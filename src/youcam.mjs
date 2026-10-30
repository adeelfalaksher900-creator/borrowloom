import { Problem,today } from './domain.mjs';
import { digest,validateImage,imageInfo } from './security.mjs';

const BASE='https://yce-api-01.makeupar.com';
const TASK='/s2s/v2.0/task/cloth-v4';
const SAMPLE='https://plugins-media.makeupar.com/strapi/assets/clothes_03_cccd5d4803.jpeg';
const ACTIVE=['reserved','uploading','submitted','running','paused','uncertain'];

function storageURL(value) {
  let u;try{u=new URL(value);}catch{throw new Problem('PROVIDER_STORAGE','The preview service returned an unreadable image link.',502);}
  if(u.protocol!=='https:'||u.username||u.password||u.port||!/^yce-[a-z0-9-]+\.s3(?:-accelerate)?(?:\.[a-z0-9-]+)?\.amazonaws\.com$/i.test(u.hostname))throw new Problem('PROVIDER_STORAGE','The preview service returned an unsupported storage destination.',502);
  return u.href;
}

async function request(env,path,body,timeout=18000) {
  let r;
  try{r=await (env.FETCH||fetch)(BASE+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+env.YOUCAM_API_KEY,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeout),redirect:'error'});}catch{throw new Problem('PROVIDER_CONNECTION','The preview service did not respond in time. No replacement task will be started automatically.',502);}
  let data;try{data=await r.json();}catch{throw new Problem('PROVIDER_RESPONSE','The preview service returned an unreadable response.',502);}
  if(!r.ok||Number(data.status)>=400)throw new Problem(r.status===401?'PROVIDER_AUTH':'PROVIDER_ERROR','The preview service could not complete this request. Please try later.',502);
  return data;
}

export async function priceAndBalance(env) {
  if(!env.YOUCAM_API_KEY)throw new Problem('PREVIEW_UNAVAILABLE','Virtual previews are not available right now. You can still check dates and arrange borrowing.',503);
  const balance=await request(env,'/s2s/v1.0/client/credit');
  if(!Array.isArray(balance.results))throw new Problem('PROVIDER_BALANCE','The preview service could not confirm its available units.',503);
  const spendable=balance.results.filter(x=>String(x.type||'').startsWith('Api')).reduce((n,x)=>n+(Number(x.amount)||0),0);
  let next;let found=[];
  for(let i=0;i<10;i++){
    const page=await request(env,'/s2s/v2.0/credit/feature-cost?page_size=20'+(next?'&starting_token='+encodeURIComponent(next):''));
    const result=page.result;
    if(!result||!Array.isArray(result.skus))throw new Problem('PROVIDER_PRICE','The preview service could not confirm the feature cost.',503);
    found.push(...result.skus.filter(x=>String(x.run_task_url||'').replace(/\/$/,'').endsWith(TASK)));
    next=result.next_token;if(!next)break;
    if(i===9)throw new Problem('PROVIDER_PRICE','The feature-price list could not be read completely.',503);
  }
  const costs=found.map(x=>Number(x.amount));
  if(!costs.length||costs.some(x=>!Number.isInteger(x)||x<=0)||new Set(costs).size!==1)throw new Problem('PROVIDER_PRICE','The preview service could not confirm an unambiguous task cost.',503);
  const cost=costs[0],maximum=Number(env.YOUCAM_MAX_TASK_UNITS||2),minimum=Number(env.YOUCAM_MIN_BALANCE||500);
  if(cost>maximum||spendable-cost<minimum)throw new Problem('PREVIEW_BUDGET','Virtual previews have reached the available free-unit budget. Borrowing features remain available.',503);
  return {cost,spendable,minimum};
}

async function boundedBytes(response,limit=6000000) {
  if(!response.ok)throw new Problem('IMAGE_DOWNLOAD','The selected image could not be retrieved.',502);
  if(Number(response.headers.get('content-length')||0)>limit)throw new Problem('IMAGE_DOWNLOAD','The generated image exceeds the supported download size.',502);
  const reader=response.body?.getReader();if(!reader)throw new Problem('IMAGE_DOWNLOAD','The image is empty.',502);
  const chunks=[];let count=0;
  while(true){const {done,value}=await reader.read();if(done)break;count+=value.length;if(count>limit){await reader.cancel();throw new Problem('IMAGE_DOWNLOAD','The generated image exceeds the supported download size.',502);}chunks.push(value);}
  const bytes=new Uint8Array(count);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}return bytes;
}

async function publicInput(env,url) {
  let r;try{r=await (env.FETCH||fetch)(url,{redirect:'error',signal:AbortSignal.timeout(18000)});}catch{throw new Problem('IMAGE_DOWNLOAD','The example photograph is not available right now.',502);}
  return validateImage(await boundedBytes(r,5000000),5000000);
}

export async function sourcePhoto(env,input) {
  if(input.sample_portrait===true)return publicInput(env,SAMPLE);
  return null;
}

async function upload(env,image,name) {
  const metadata=await request(env,'/s2s/v2.0/file',{files:[{content_type:image.type,file_name:name,file_size:image.bytes.length}]});
  const file=(metadata.data?.files||metadata.files)?.[0];const put=file?.requests?.[0];
  if(!file?.file_id||put?.method!=='PUT')throw new Problem('PROVIDER_UPLOAD','The preview service could not prepare the image upload.',502);
  const url=storageURL(put.url);
  const headers=new Headers();
  for(const [key,value] of Object.entries(put.headers||{}))if(['content-type','content-length','x-amz-server-side-encryption','x-amz-acl'].includes(key.toLowerCase()))headers.set(key,String(value));
  headers.set('Content-Type',image.type);
  let r;try{r=await (env.FETCH||fetch)(url,{method:'PUT',headers,body:image.bytes,redirect:'error',signal:AbortSignal.timeout(22000)});}catch{throw new Problem('PROVIDER_UPLOAD','The image upload did not finish. No new preview was created.',502);}
  if(!r.ok)throw new Problem('PROVIDER_UPLOAD','The image upload was rejected. No new preview was created.',502);
  return file.file_id;
}

export function publicJob(row) {
  return {id:row.id,garment_id:row.garment_id,garment_title:row.garment_title,status:row.status,created_at:row.created_at,expires_at:row.expires_at,error_code:row.error_code,poll_after_ms:Math.max(10500,(row.next_poll_at||0)-Date.now()),can_recheck:row.status==='paused'&&Boolean(row.provider_id),image_url:row.status==='succeeded'?`/api/tryons/${row.id}/image`:null};
}

export async function startPreview(env,user,garment,input,photo) {
  const idempotency=String(input.idempotency_key||'');
  if(!/^[0-9a-f-]{36}$/i.test(idempotency))throw new Problem('INVALID_REQUEST_KEY','Reload the fitting room before trying again.');
  const inputDigest=await digest(photo.bytes);
  const existing=await env.DB.prepare('SELECT * FROM tryon_jobs WHERE user_id=? AND idempotency_key=?').bind(user.id,idempotency).first();
  if(existing){
    if(existing.input_digest!==inputDigest||existing.garment_id!==garment.id||existing.garment_version!==garment.version)throw new Problem('REQUEST_CHANGED','This request key belongs to a different photograph or garment. Start a new request.',409);
    return publicJob(existing);
  }
  const cached=await env.DB.prepare("SELECT * FROM tryon_jobs WHERE user_id=? AND garment_id=? AND garment_version=? AND input_digest=? AND expires_at>? AND status IN ('reserved','uploading','submitted','running','paused','uncertain','succeeded') ORDER BY created_at DESC LIMIT 1").bind(user.id,garment.id,garment.version,inputDigest,Date.now()).first();
  if(cached)return publicJob(cached);
  const {cost,spendable,minimum}=await priceAndBalance(env);
  const day=today(),now=Date.now(),id=crypto.randomUUID();
  let reserved;
  try { reserved=await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO budgets(key,units) VALUES('total',0)"),
    env.DB.prepare('INSERT OR IGNORE INTO budgets(key,units) VALUES(?,0)').bind(day),
    env.DB.prepare(`INSERT INTO tryon_jobs(id,user_id,garment_id,garment_version,garment_title,idempotency_key,input_digest,status,cost,created_at,expires_at)
      SELECT ?,?,?,?,?,?,?,'reserved',?,?,? FROM budgets t,budgets d
      WHERE t.key='total' AND d.key=? AND t.units+?<=? AND d.units+?<=?
      AND (SELECT COUNT(*) FROM tryon_jobs WHERE user_id=? AND created_at>?)<8
      AND ?>=?+?+COALESCE((SELECT SUM(cost) FROM tryon_jobs WHERE status IN ('reserved','uploading','submitted','running','paused','uncertain')),0)`).bind(id,user.id,garment.id,garment.version,garment.title,idempotency,inputDigest,cost,now,now+86400000,day,cost,Number(env.YOUCAM_TOTAL_BUDGET||200),cost,Number(env.YOUCAM_DAILY_BUDGET||30),user.id,now-86400000,spendable,minimum,cost),
    env.DB.prepare("UPDATE budgets SET units=units+? WHERE key IN ('total',?) AND EXISTS(SELECT 1 FROM tryon_jobs WHERE id=?)").bind(cost,day,id)
  ]); } catch (e) {
    const duplicate=await env.DB.prepare('SELECT * FROM tryon_jobs WHERE user_id=? AND idempotency_key=?').bind(user.id,idempotency).first();
    if(duplicate && duplicate.input_digest===inputDigest && duplicate.garment_id===garment.id && duplicate.garment_version===garment.version)return publicJob(duplicate);
    throw e;
  }
  if(!reserved[2].meta?.changes)throw new Problem('PREVIEW_BUDGET','The available preview allowance has been reached. Please try another day; borrowing is still available.',429);
  let submitted=false;
  try{
    let garmentPhoto;
    if(garment.asset){
      if(!['dress.png','jacket.png','blouse.png'].includes(garment.asset))throw new Problem('INVALID_IMAGE','This garment photograph could not be read.');
      garmentPhoto=await publicInput(env,String(env.ASSET_ORIGIN).replace(/\/$/,'')+'/assets/'+garment.asset);
    }else garmentPhoto=validateImage(garment.photo);
    const active=await env.DB.prepare("UPDATE tryon_jobs SET status='uploading' WHERE id=? AND status='reserved'").bind(id).run();
    if(!active.meta?.changes)return publicJob(await env.DB.prepare('SELECT * FROM tryon_jobs WHERE id=?').bind(id).first());
    const src=await upload(env,photo,'portrait.'+(photo.type==='image/png'?'png':'jpg'));
    if((await env.DB.prepare('SELECT status FROM tryon_jobs WHERE id=?').bind(id).first())?.status!=='uploading')return publicJob(await env.DB.prepare('SELECT * FROM tryon_jobs WHERE id=?').bind(id).first());
    const ref=await upload(env,garmentPhoto,'garment.'+(garmentPhoto.type==='image/png'?'png':'jpg'));
    if((await env.DB.prepare('SELECT status FROM tryon_jobs WHERE id=?').bind(id).first())?.status!=='uploading')return publicJob(await env.DB.prepare('SELECT * FROM tryon_jobs WHERE id=?').bind(id).first());
    submitted=true;
    const created=await request(env,TASK,{src_file_id:src,ref_file_id:ref,garment_category:garment.category,filter_multi_person:'strict',change_shoes:false});
    const taskId=created.data?.task_id;
    if(typeof taskId!=='string'||!taskId||taskId.length>500)throw new Problem('PROVIDER_RESPONSE','The preview service did not return a task reference.',502);
    await env.DB.prepare("UPDATE tryon_jobs SET status=CASE WHEN status='uploading' THEN 'submitted' ELSE status END,provider_id=?,cleanup_pending=1 WHERE id=?").bind(taskId,id).run();
  }catch(e){
    const code=e instanceof Problem?e.code:'PREVIEW_FAILED';
    await env.DB.prepare("UPDATE tryon_jobs SET status=?,error_code=? WHERE id=? AND status IN ('reserved','uploading')").bind(submitted?'uncertain':'error',code,id).run();
  }
  return publicJob(await env.DB.prepare('SELECT * FROM tryon_jobs WHERE id=?').bind(id).first());
}

export const ERROR_GUIDANCE=Object.freeze({
  error_pose:'Use a clear, front-facing photo with your shoulders and body visible.',
  error_invalid_ref:'Ask the owner for a front-facing photograph of one complete garment.',
  error_apply_region_mismatch:'Use a photograph that includes the area covered by this garment.',
  error_invalid_src:'Include your face and upper body, rather than only legs or feet.',
  error_multi_person:'Choose a photograph with only one person.',
  exceed_max_filesize:'Choose a smaller JPEG or PNG photograph.',
  error_below_min_image_size:'Choose a larger, clearer photograph.',
  error_nsfw_content_detected:'This photograph cannot be processed. Choose an appropriate clothed photo.',
  error_editing_failed:'The preview could not be produced from this pair of photographs.'
});

export async function deleteProvider(env,row) {
  if(!row.provider_id||!env.YOUCAM_API_KEY)return false;
  await env.DB.prepare('UPDATE tryon_jobs SET cleanup_attempts=cleanup_attempts+1,last_cleanup_at=? WHERE id=?').bind(Date.now(),row.id).run();
  try{await request(env,'/s2s/v2.0/task/delete',{task_id:row.provider_id});await env.DB.prepare('UPDATE tryon_jobs SET cleanup_pending=0 WHERE id=?').bind(row.id).run();return true;}catch{return false;}
}

export async function pollPreview(env,row,manual=false) {
  if(row.expires_at<=Date.now()){
    await env.DB.batch([env.DB.prepare('DELETE FROM result_chunks WHERE job_id=?').bind(row.id),env.DB.prepare("UPDATE tryon_jobs SET status='expired' WHERE id=?").bind(row.id)]);
    return publicJob({...row,status:'expired'});
  }
  if(!['submitted','running',...(manual?['paused']:[])].includes(row.status)||!row.provider_id)return publicJob(row);
  const now=Date.now();
  if(!manual&&now-row.created_at>900000){await env.DB.prepare("UPDATE tryon_jobs SET status='paused',error_code='PROCESSING_PAUSED' WHERE id=? AND status IN ('submitted','running')").bind(row.id).run();return publicJob(await env.DB.prepare('SELECT * FROM tryon_jobs WHERE id=?').bind(row.id).first());}
  const lease=await env.DB.prepare("UPDATE tryon_jobs SET status='submitted',last_polled_at=?,poll_lease_until=?,poll_failures=CASE WHEN ?=1 THEN 0 ELSE poll_failures END WHERE id=? AND last_polled_at<=? AND next_poll_at<=? AND poll_lease_until<=? AND status IN ('submitted','running',?)").bind(now,now+60000,Number(manual),row.id,now-10000,now,now,manual?'paused':'running').run();
  if(!lease.meta?.changes)return publicJob(row);
  try{
    const result=await request(env,TASK+'/'+encodeURIComponent(row.provider_id));
    const data=result.data;
    if(!data||typeof data.task_status!=='string')throw new Problem('PROVIDER_RESPONSE','The preview status could not be read.',502);
    if(data.task_status==='success'){
      const resultURL=storageURL(data.results?.url);
      const response=await (env.FETCH||fetch)(resultURL,{signal:AbortSignal.timeout(22000),redirect:'error'});
      const bytes=await boundedBytes(response);const type=imageInfo(bytes).type;
      const statements=[env.DB.prepare("DELETE FROM result_chunks WHERE job_id=? AND EXISTS(SELECT 1 FROM tryon_jobs WHERE id=? AND status IN ('submitted','running'))").bind(row.id,row.id)];
      for(let i=0;i<bytes.length;i+=250000)statements.push(env.DB.prepare("INSERT INTO result_chunks(job_id,part,bytes) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM tryon_jobs WHERE id=? AND status IN ('submitted','running') AND expires_at>?)").bind(row.id,i/250000,bytes.slice(i,i+250000),row.id,Date.now()));
      statements.push(env.DB.prepare("UPDATE tryon_jobs SET status='succeeded',result_type=?,result_size=?,poll_lease_until=0,poll_failures=0 WHERE id=? AND status IN ('submitted','running') AND expires_at>?").bind(type,bytes.length,row.id,Date.now()));
      await env.DB.batch(statements);
      await deleteProvider(env,row);
    }else if(data.task_status==='error'){
      const raw=data.error?.error_code||data.error?.code||data.error_code||'PROVIDER_FAILED';
      const code=Object.hasOwn(ERROR_GUIDANCE,raw)?raw:'PROVIDER_FAILED';
      await env.DB.prepare("UPDATE tryon_jobs SET status='error',error_code=?,poll_lease_until=0 WHERE id=? AND status IN ('submitted','running')").bind(code,row.id).run();
      await deleteProvider(env,row);
    }else if(['running','pending','queued','processing'].includes(data.task_status))await env.DB.prepare("UPDATE tryon_jobs SET status='running',poll_lease_until=0,poll_failures=0,next_poll_at=? WHERE id=? AND status IN ('submitted','running')").bind(now+10000,row.id).run();
    else throw new Problem('PROVIDER_RESPONSE','The preview service returned an unsupported task status.',502);
  }catch{
    await env.DB.prepare("UPDATE tryon_jobs SET poll_lease_until=0,poll_failures=poll_failures+1,next_poll_at=?,status=CASE WHEN poll_failures>=2 THEN 'paused' ELSE status END,error_code=CASE WHEN poll_failures>=2 THEN 'PROCESSING_PAUSED' ELSE error_code END WHERE id=? AND status IN ('submitted','running')").bind(now+30000,row.id).run();
  }
  const current=await env.DB.prepare('SELECT * FROM tryon_jobs WHERE id=?').bind(row.id).first();
  return {...publicJob(current),message:ERROR_GUIDANCE[current.error_code]||null};
}

export async function cleanup(env) {
  const now=Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM result_chunks WHERE job_id IN (SELECT id FROM tryon_jobs WHERE expires_at<=?)').bind(now),
    env.DB.prepare("UPDATE tryon_jobs SET status='expired' WHERE expires_at<=? AND status<>'expired'").bind(now),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(now),
    env.DB.prepare('DELETE FROM rate_limits WHERE expires_at<=?').bind(now)
  ]);
  const pending=await env.DB.prepare("SELECT * FROM tryon_jobs WHERE cleanup_pending=1 AND provider_id IS NOT NULL AND status IN ('succeeded','error','cancelled','expired') AND last_cleanup_at<=?-CASE WHEN cleanup_attempts<3 THEN 60000 ELSE 600000 END ORDER BY last_cleanup_at,created_at,id LIMIT 10").bind(now).all();
  for(const row of pending.results||[])await deleteProvider(env,row);
  await env.DB.prepare('DELETE FROM tryon_jobs WHERE expires_at<? AND cleanup_pending=0').bind(now-7*86400000).run();
}

export { storageURL,ACTIVE };
