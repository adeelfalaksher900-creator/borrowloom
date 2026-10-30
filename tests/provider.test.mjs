import test from 'node:test';
import assert from 'node:assert/strict';
import {env} from './support/database.mjs';
import {png} from './support/images.mjs';
import {startPreview,pollPreview,cleanup} from '../src/youcam.mjs';
function setup(){
  const e=env(),db=e.DB.sqlite,user={id:crypto.randomUUID(),name:'Owner'},cid=crypto.randomUUID(),gid=crypto.randomUUID(),photo={bytes:png(),type:'image/png'};
  db.prepare('INSERT INTO users(id,name,created_at) VALUES(?,?,0)').run(user.id,user.name);
  db.prepare('INSERT INTO circles(id,owner_id,title,care_days,invite_hash,created_at) VALUES(?,?,?,1,?,0)').run(cid,user.id,'Wardrobe','hash');
  db.prepare('INSERT INTO garments(id,circle_id,title,category,size_label,photo,photo_type,created_at) VALUES(?,?,?,?,?,?,?,0)').run(gid,cid,'Blazer','outer','M',photo.bytes,photo.type);
  const g={id:gid,version:1,title:'Blazer',category:'outer',photo:Array.from(photo.bytes)};
  let taskCalls=0,fileCalls=0;const signedHeaders=[],deletions=[];
  e.YOUCAM_API_KEY='test-only';e.FETCH=async(url,options={})=>{
    if(url.includes('/client/credit'))return Response.json({results:[{type:'ApiFree',amount:1000}]});
    if(url.includes('/credit/feature-cost'))return Response.json({result:{skus:[{run_task_url:'/s2s/v2.0/task/cloth-v4',amount:2}]}});
    if(url.endsWith('/file'))return Response.json({data:{files:[{file_id:'file-'+(++fileCalls),requests:[{method:'PUT',url:'https://yce-task.s3.us-west-2.amazonaws.com/upload?x='+fileCalls,headers:{'Content-Type':'image/png'}}]}]}});
    if(options.method==='PUT'){signedHeaders.push(new Headers(options.headers));await e.onPut?.();return new Response(null,{status:200});}
    if(url.endsWith('/task/delete')){const id=JSON.parse(options.body).task_id;deletions.push(id);return e.deleteFails?Response.json({error:'unavailable'},{status:503}):Response.json({ok:true});}
    if(url.endsWith('/cloth-v4')&&options.method==='POST'){taskCalls++;await e.onTask?.();return Response.json({data:{task_id:'provider-'+taskCalls}});}
    if(url.includes('/cloth-v4/')){if(e.pollFails)return Response.json({error:'unavailable'},{status:503});return Response.json({data:{task_status:'success',results:{url:'https://yce-task.s3.us-west-2.amazonaws.com/result'}}});}
    if(url.includes('/result')){await e.onResult?.();return new Response(photo.bytes,{headers:{'Content-Type':'image/png'}});}
    throw new Error('Unexpected mock destination '+url);
  };
  return {e,db,user,g,photo,input:{idempotency_key:crypto.randomUUID()},signedHeaders,deletions,get taskCalls(){return taskCalls;}};
}
test('provider protocol creates one task on retries, never forwards API authorization to signed storage, and stores bounded private bytes',async()=>{
  const f=setup();const j=await startPreview(f.e,f.user,f.g,f.input,f.photo);assert.equal(j.status,'submitted');
  const repeat=await startPreview(f.e,f.user,f.g,f.input,f.photo);assert.equal(repeat.id,j.id);assert.equal(f.taskCalls,1);
  for(const headers of f.signedHeaders)assert.equal(headers.has('Authorization'),false);
  const result=await pollPreview(f.e,await f.e.DB.prepare('SELECT * FROM tryon_jobs WHERE id=?').bind(j.id).first());assert.equal(result.status,'succeeded');
  assert.equal(f.db.prepare('SELECT SUM(length(bytes)) n FROM result_chunks WHERE job_id=?').get(j.id).n,f.photo.bytes.length);assert.equal(f.deletions.length,1);f.e.DB.close();
});
test('cancelling during upload stops before billable task creation',async()=>{
  const f=setup();let once=false;f.e.onPut=()=>{if(!once){once=true;f.db.prepare("UPDATE tryon_jobs SET status='cancelled'").run();}};
  const j=await startPreview(f.e,f.user,f.g,f.input,f.photo);assert.equal(j.status,'cancelled');assert.equal(f.taskCalls,0);f.e.DB.close();
});
test('cancellation racing an accepted task preserves cancellation and retains the provider ID for cleanup',async()=>{
  const f=setup();f.e.onTask=()=>f.db.prepare("UPDATE tryon_jobs SET status='cancelled'").run();
  const j=await startPreview(f.e,f.user,f.g,f.input,f.photo);assert.equal(j.status,'cancelled');assert.equal(f.taskCalls,1);
  const row=f.db.prepare('SELECT * FROM tryon_jobs WHERE id=?').get(j.id);assert.equal(row.provider_id,'provider-1');assert.equal(row.cleanup_pending,1);f.e.DB.close();
});
test('cancellation during result download cannot resurrect saved image bytes or a succeeded state',async()=>{
  const f=setup();const j=await startPreview(f.e,f.user,f.g,f.input,f.photo);f.e.onResult=()=>f.db.prepare("UPDATE tryon_jobs SET status='cancelled'").run();
  const result=await pollPreview(f.e,await f.e.DB.prepare('SELECT * FROM tryon_jobs WHERE id=?').bind(j.id).first());assert.equal(result.status,'cancelled');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM result_chunks').get().n,0);f.e.DB.close();
});
test('repeated provider failures pause polling, with explicit recheck of the same task',async()=>{
  const f=setup(),j=await startPreview(f.e,f.user,f.g,f.input,f.photo);f.e.pollFails=true;
  let result;for(let i=0;i<3;i++){f.db.prepare('UPDATE tryon_jobs SET next_poll_at=0,last_polled_at=0').run();result=await pollPreview(f.e,await f.e.DB.prepare('SELECT * FROM tryon_jobs WHERE id=?').bind(j.id).first());}
  assert.equal(result.status,'paused');assert.equal(result.can_recheck,true);assert.equal(f.taskCalls,1);
  f.e.pollFails=false;f.db.prepare('UPDATE tryon_jobs SET next_poll_at=0,last_polled_at=0').run();result=await pollPreview(f.e,await f.e.DB.prepare('SELECT * FROM tryon_jobs WHERE id=?').bind(j.id).first(),true);assert.equal(result.status,'succeeded');assert.equal(f.taskCalls,1);f.e.DB.close();
});
test('cleanup rotates through failing jobs so earlier failures do not starve later images',async()=>{
  const f=setup();f.e.deleteFails=true;
  for(let i=0;i<12;i++)f.db.prepare("INSERT INTO tryon_jobs(id,user_id,garment_id,garment_version,garment_title,idempotency_key,input_digest,provider_id,status,cost,created_at,expires_at,cleanup_pending) VALUES(?,?,?,1,'Blazer',?,'hash',?,'cancelled',2,?,?,1)").run(crypto.randomUUID(),f.user.id,f.g.id,crypto.randomUUID(),'delete-'+i,Date.now()+i,Date.now()+100000);
  await cleanup(f.e);assert.equal(f.deletions.length,10);await cleanup(f.e);assert.equal(new Set(f.deletions).size,12);f.e.DB.close();
});
