import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';
import {env,ORIGIN} from './support/database.mjs';
import {addDays,today} from '../src/domain.mjs';
import {png} from './support/images.mjs';

function client(e){let cookie='';return {get cookie(){return cookie;},async call(path,method='GET',body,extra={}){const r=await worker.fetch(new Request(ORIGIN+path,{method,headers:{Cookie:cookie,Origin:ORIGIN,'X-Borrowloom':'1','Content-Type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body)}),e,{waitUntil:p=>p.catch(()=>{})});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const data=r.headers.get('content-type')?.includes('json')?await r.json():await r.text();return {status:r.status,data,headers:r.headers};}};}
async function fixture(){const e=env(),owner=client(e),borrower=client(e),stranger=client(e);for(const c of [owner,borrower,stranger])assert.equal((await c.call('/api/session')).status,200);const create=await owner.call('/api/circles','POST',{title:'Friends',care_days:1,example:true});const id=create.data.id;assert.equal(create.status,201);await borrower.call('/api/join','POST',{circle_id:id,invite:create.data.invite});const wardrobe=(await borrower.call('/api/circles/'+id)).data;return {e,owner,borrower,stranger,id,invite:create.data.invite,g:wardrobe.garments[0]};}
test('separate browser identities, membership isolation, invitation rotation and owner authorization',async()=>{
  const f=await fixture();assert.notEqual(f.owner.cookie,f.borrower.cookie);
  assert.equal((await f.stranger.call('/api/circles/'+f.id)).status,404);
  assert.equal((await f.stranger.call('/api/garments/'+f.g.id)).status,404);
  assert.equal((await f.borrower.call('/api/circles/'+f.id+'/invite','POST',{})).status,403);
  const rotated=await f.owner.call('/api/circles/'+f.id+'/invite','POST',{});assert.equal(rotated.status,200);
  assert.equal((await f.stranger.call('/api/join','POST',{circle_id:f.id,invite:f.invite})).status,404);
  assert.equal((await f.stranger.call('/api/join','POST',{circle_id:f.id,invite:rotated.data.invite})).status,200);f.e.DB.close();
});
test('real request, duplicate retry, approval conflict, collection, actual return and audit history',async()=>{
  const f=await fixture(),date=today(),end=addDays(date,3),request={garment_id:f.g.id,start_date:date,end_date:end,note:'Family dinner',idempotency_key:crypto.randomUUID()};
  const a=await f.borrower.call('/api/loans','POST',request);assert.equal(a.status,201);
  assert.equal((await f.borrower.call('/api/loans','POST',request)).data.id,a.data.id);
  assert.equal((await f.borrower.call('/api/loans','POST',{...request,end_date:addDays(end,1)})).status,409);
  const b=await f.owner.call('/api/loans','POST',{...request,idempotency_key:crypto.randomUUID()});assert.equal(b.status,201);
  assert.equal((await f.borrower.call('/api/loans/'+a.data.id,'PATCH',{status:'approved'})).status,409);
  assert.equal((await f.owner.call('/api/loans/'+a.data.id,'PATCH',{status:'approved'})).status,200);
  assert.equal((await f.owner.call('/api/loans/'+b.data.id,'PATCH',{status:'approved'})).status,409);
  assert.equal((await f.owner.call('/api/loans/'+a.data.id,'PATCH',{status:'collected'})).status,200);
  assert.equal((await f.borrower.call('/api/loans/'+a.data.id,'PATCH',{status:'cancelled'})).status,409);
  assert.equal((await f.owner.call('/api/loans/'+a.data.id,'PATCH',{status:'returned'})).status,200);
  const detail=(await f.borrower.call('/api/loans/'+a.data.id)).data;assert.equal(detail.loan.actual_return_date,date);assert.equal(detail.events.length,4);
  const avail=await f.borrower.call(`/api/garments/${f.g.id}/availability?from=${addDays(date,2)}&to=${addDays(date,3)}`);assert.equal(avail.data.available,true);f.e.DB.close();
});
test('Origin checks reject cross-site mutations; recovery is single-use and revokes old sessions',async()=>{
  const f=await fixture();assert.equal((await f.owner.call('/api/session','PATCH',{name:'Mallory'},{Origin:'https://attacker.invalid'})).status,403);
  const recovery=await f.owner.call('/api/recovery','POST',{});assert.equal(recovery.status,200);
  const original=(await f.owner.call('/api/session')).data.user.id;
  const recovered=await f.stranger.call('/api/recover','POST',{code:recovery.data.recovery_code});assert.equal(recovered.status,200);assert.equal(recovered.data.user.id,original);
  assert.equal((await f.owner.call('/api/loans')).status,401);
  assert.equal((await f.borrower.call('/api/recover','POST',{code:recovery.data.recovery_code})).status,401);
  assert.equal((await f.stranger.call('/api/session','PATCH',{name:'Adele'})).status,200);f.e.DB.close();
});
test('private jobs cannot be read or deleted by another member; deleted images remain unavailable',async()=>{
  const f=await fixture(),uid=(await f.borrower.call('/api/session')).data.user.id,jid=crypto.randomUUID();
  f.e.DB.sqlite.prepare("INSERT INTO tryon_jobs(id,user_id,garment_id,garment_version,garment_title,idempotency_key,input_digest,status,cost,created_at,expires_at,result_type,result_size) VALUES(?,?,?,1,'Dress',?,'hash','succeeded',2,?,?, 'image/png',3)").run(jid,uid,f.g.id,crypto.randomUUID(),Date.now(),Date.now()+100000);
  f.e.DB.sqlite.prepare('INSERT INTO result_chunks VALUES(?,0,?)').run(jid,new Uint8Array([1,2,3]));
  assert.equal((await f.owner.call('/api/tryons/'+jid)).status,404);assert.equal((await f.owner.call('/api/tryons/'+jid,'DELETE')).status,404);
  assert.equal((await f.borrower.call('/api/tryons/'+jid,'DELETE')).status,200);assert.equal((await f.borrower.call('/api/tryons/'+jid+'/image')).status,410);assert.equal(f.e.DB.sqlite.prepare('SELECT COUNT(*) n FROM result_chunks').get().n,0);f.e.DB.close();
});
test('exports contain no session, invitation, provider or recovery secrets, and CSV neutralizes formulas',async()=>{
  const f=await fixture();await f.borrower.call('/api/loans','POST',{garment_id:f.g.id,start_date:today(),end_date:today(),idempotency_key:crypto.randomUUID()});
  f.e.DB.sqlite.prepare('UPDATE garments SET title=? WHERE id=?').run('=HYPERLINK("https://bad.invalid")',f.g.id);
  const out=await f.owner.call('/api/export');assert.equal(out.status,200);const raw=JSON.stringify(out.data);assert.ok(!/invite_hash|recovery_hash|token_hash|provider_id/.test(raw));
  const csv=await f.owner.call('/api/export?format=csv');assert.ok(csv.data.includes('"\'=HYPERLINK'));assert.equal(csv.headers.get('cache-control'),'no-store');f.e.DB.close();
});
test('two simultaneous recovery attempts grant exactly one new session and usable replacement code',async()=>{
  const f=await fixture(),code=(await f.owner.call('/api/recovery','POST',{})).data.recovery_code;
  const attempts=await Promise.all([f.borrower.call('/api/recover','POST',{code}),f.stranger.call('/api/recover','POST',{code})]);
  assert.deepEqual(attempts.map(x=>x.status).sort(),[200,401]);const win=attempts.find(x=>x.status===200);
  const c=client(f.e);const restored=await c.call('/api/recover','POST',{code:win.data.recovery_code});assert.equal(restored.status,200);f.e.DB.close();
});
test('D1 array BLOBs round-trip as image bytes; stale edits cannot overwrite current measurements',async()=>{
  const f=await fixture(),circle=await f.owner.call('/api/circles','POST',{title:'Real wardrobe',care_days:1}),bytes=png();
  const payload={title:'My blazer',category:'outer',size_label:'M',measurements:'Chest 92 cm',photo:'data:image/png;base64,'+Buffer.from(bytes).toString('base64')};
  const added=await f.owner.call('/api/circles/'+circle.data.id+'/garments','POST',payload);assert.equal(added.status,201);
  const get=await worker.fetch(new Request(ORIGIN+'/api/garments/'+added.data.id+'/photo',{headers:{Cookie:f.owner.cookie}}),f.e);assert.equal(get.status,200);assert.deepEqual(new Uint8Array(await get.arrayBuffer()),bytes);
  const current=await f.owner.call('/api/garments/'+added.data.id);const version=current.data.garment.version;
  assert.equal((await f.owner.call('/api/garments/'+added.data.id,'PATCH',{...payload,photo:undefined,version,measurements:'Chest 96 cm'})).status,200);
  assert.equal((await f.owner.call('/api/garments/'+added.data.id,'PATCH',{...payload,photo:undefined,version})).status,409);
  assert.equal((await f.owner.call('/api/garments/'+added.data.id)).data.garment.measurements,'Chest 96 cm');f.e.DB.close();
});
test('member revocation is owner-only, protects active borrowing and invalidates the old invitation',async()=>{
  const f=await fixture(),uid=(await f.borrower.call('/api/session')).data.user.id,route=`/api/circles/${f.id}/members/${uid}`;
  assert.equal((await f.stranger.call(route,'DELETE')).status,404);assert.equal((await f.borrower.call(route,'DELETE')).status,403);
  const l=await f.borrower.call('/api/loans','POST',{garment_id:f.g.id,start_date:today(),end_date:today(),idempotency_key:crypto.randomUUID()});
  assert.equal((await f.owner.call(route,'DELETE')).status,409);await f.borrower.call('/api/loans/'+l.data.id,'PATCH',{status:'cancelled'});
  assert.equal((await f.owner.call(route,'DELETE')).status,200);assert.equal((await f.borrower.call('/api/garments/'+f.g.id)).status,404);
  assert.equal((await f.borrower.call('/api/join','POST',{circle_id:f.id,invite:f.invite})).status,404);f.e.DB.close();
});
test('archived pending requests advertise decline, not an impossible approval action',async()=>{
  const f=await fixture();const l=await f.borrower.call('/api/loans','POST',{garment_id:f.g.id,start_date:today(),end_date:today(),idempotency_key:crypto.randomUUID()});
  f.e.DB.sqlite.prepare('UPDATE garments SET archived=1 WHERE id=?').run(f.g.id);
  const list=(await f.owner.call('/api/loans')).data.loans.find(x=>x.id===l.data.id);assert.deepEqual(list.actions,['declined']);
  assert.equal((await f.owner.call('/api/loans/'+l.data.id,'PATCH',{status:'approved'})).status,409);f.e.DB.close();
});
