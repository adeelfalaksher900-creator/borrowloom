import {Problem,text,identifier,today,loanDates,garmentFields,circleFields,availability,requireTransition,canTransition,csvCell,EXAMPLE_GARMENTS} from './domain.mjs';
import {token,digest,opaque,trustedMutation,readJSON,rateLimit,session,cookie,member,imageData,json,safeImageResponse} from './security.mjs';
import {startPreview,sourcePhoto,pollPreview,publicJob,deleteProvider,cleanup,ERROR_GUIDANCE} from './youcam.mjs';

const fields='g.id,g.circle_id,g.title,g.category,g.size_label,g.colour,g.measurements,g.condition_note,g.care_note,g.asset,g.archived,g.version,g.created_at';
const toGarment=g=>({...g,photo_url:g.asset?'/assets/'+g.asset:`/api/garments/${g.id}/photo`});
const rows=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results||[];
const key=value=>identifier(value);
async function garmentFor(db,id,user,owner=false,photo=false){
  const g=await db.prepare(`SELECT ${fields}${photo?',g.photo,g.photo_type':''} FROM garments g WHERE g.id=?`).bind(identifier(id)).first();
  if(!g)throw new Problem('NOT_FOUND','This piece could not be found.',404);
  const circle=await member(db,g.circle_id,user.id,owner);return {g,circle};
}
async function windows(db,id){return rows(db,'SELECT start_date,blocked_to,status FROM blocking_loans WHERE garment_id=? AND blocked_to>=? ORDER BY start_date',id,today());}
function loanView(l,user){const role=l.owner_id===user.id?'owner':'borrower';return {...l,role,actions:['approved','declined','collected','returned','cancelled'].filter(x=>canTransition(l,x,role)&&!(l.archived&&['approved','collected'].includes(x))),overdue:l.status==='collected'&&l.end_date<today()};}
async function sessionData(env,user){
  return {user,circles:await rows(env.DB,`SELECT c.id,c.title,c.description,c.care_days,c.is_example,c.owner_id=? AS is_owner,
  (SELECT COUNT(*) FROM garments g WHERE g.circle_id=c.id AND g.archived=0) AS garment_count
  FROM circles c JOIN members m ON m.circle_id=c.id WHERE m.user_id=? ORDER BY c.created_at DESC`,user.id,user.id),preview_ready:Boolean(env.YOUCAM_API_KEY)};
}
async function api(request,env,ctx){
  const url=new URL(request.url),path=url.pathname.replace(/\/$/,''),method=request.method,db=env.DB;
  if(method==='GET'&&path==='/api/health'){
    await db.prepare('SELECT 1').first();return json({status:'ok',storage:'ready',preview:env.YOUCAM_API_KEY?'configured':'unavailable'});
  }
  if(!['GET','HEAD'].includes(method))trustedMutation(request,env);
  if(path==='/api/session'&&method==='GET'){const s=await session(request,env,true);return json(await sessionData(env,s.user),200,s.headers);}
  // Recovery accepts a private capability before requiring an existing session.
  if(path==='/api/recover'&&method==='POST'){
    const input=await readJSON(request,3000),raw=String(input.code||'').replace(/[\s-]/g,'').toLowerCase();
    const ip=await digest(String(request.headers.get('CF-Connecting-IP')||'local'));
    await rateLimit(db,'recover:'+ip,10);
    if(!opaque(raw))throw new Problem('RECOVERY_INVALID','Check the complete recovery code and try again.',401);
    const u=await db.prepare('SELECT id,name FROM users WHERE recovery_hash=?').bind(await digest(raw)).first();
    if(!u)throw new Problem('RECOVERY_INVALID','This recovery code is invalid or has been replaced.',401);
    const next=token(),nextHash=await digest(next),rawSession=token();
    const claimed=await db.batch([db.prepare('UPDATE users SET recovery_hash=? WHERE id=? AND recovery_hash=?').bind(nextHash,u.id,await digest(raw)),db.prepare('DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND recovery_hash=?)').bind(u.id,u.id,nextHash),db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND recovery_hash=?)').bind(await digest(rawSession),u.id,Date.now()+7776000000,u.id,nextHash)]);
    if(!claimed[0].meta?.changes)throw new Problem('RECOVERY_INVALID','This recovery code has already been used or replaced.',401);
    return json({user:u,recovery_code:next},200,{'Set-Cookie':cookie(rawSession)});
  }
  const {user}=await session(request,env);
  if(!['GET','HEAD'].includes(method))await rateLimit(db,'write:'+user.id,160);
  if(path==='/api/session'&&method==='PATCH'){
    const input=await readJSON(request,3000),name=text(input.name,'your name',60);
    await db.batch([db.prepare('UPDATE users SET name=? WHERE id=?').bind(name,user.id),db.prepare('UPDATE members SET display_name=? WHERE user_id=?').bind(name,user.id)]);return json({user:{...user,name}});
  }
  if(path==='/api/recovery'&&method==='POST'){
    const raw=token();await db.prepare('UPDATE users SET recovery_hash=? WHERE id=?').bind(await digest(raw),user.id).run();return json({recovery_code:raw});
  }
  if(path==='/api/session'&&method==='DELETE'){
    const raw=request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-borrowloom='))?.slice(18);
    if(opaque(raw))await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(raw)).run();
    return json({ok:true},200,{'Set-Cookie':cookie('',0)});
  }
  if(path==='/api/circles'&&method==='POST'){
    const input=await readJSON(request,5000),f=circleFields(input),id=crypto.randomUUID(),invite=token(),isExample=input.example===true?1:0;
    const count=await db.prepare('SELECT COUNT(*) AS n FROM circles WHERE owner_id=?').bind(user.id).first();
    if(count.n>=5)throw new Problem('WARDROBE_LIMIT','You can own up to five wardrobes.',409);
    const statements=[db.prepare('INSERT INTO circles(id,owner_id,title,description,rules,care_days,invite_hash,is_example,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,user.id,isExample?'The example wardrobe':f.title,isExample?'Fictional garments to explore the workflow. No physical pieces are offered.':f.description,f.rules,f.care_days,await digest(invite),isExample,Date.now()),db.prepare('INSERT INTO members(circle_id,user_id,display_name,joined_at) VALUES(?,?,?,?)').bind(id,user.id,user.name,Date.now())];
    if(isExample)for(const g of EXAMPLE_GARMENTS)statements.push(db.prepare('INSERT INTO garments(id,circle_id,title,category,size_label,colour,measurements,condition_note,care_note,asset,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,g.title,g.category,g.size_label,g.colour,g.measurements,g.condition_note,g.care_note,g.asset,Date.now()));
    await db.batch(statements);return json({id,invite},201);
  }
  if(path==='/api/join'&&method==='POST'){
    const input=await readJSON(request,3000),id=identifier(input.circle_id),invite=input.invite;
    await rateLimit(db,'join:'+user.id,25);
    if(!opaque(invite))throw new Problem('INVITE_INVALID','This invitation is incomplete or has been replaced.',404);
    const c=await db.prepare('SELECT id FROM circles WHERE id=? AND invite_hash=?').bind(id,await digest(invite)).first();
    if(!c)throw new Problem('INVITE_INVALID','This invitation is no longer valid. Ask the owner for a new one.',404);
    const n=await db.prepare('SELECT COUNT(*) AS n FROM members WHERE circle_id=?').bind(id).first();
    if(n.n>=30&&!await db.prepare('SELECT 1 FROM members WHERE circle_id=? AND user_id=?').bind(id,user.id).first())throw new Problem('WARDROBE_FULL','This wardrobe has reached its 30-member limit.',409);
    await db.prepare('INSERT OR IGNORE INTO members(circle_id,user_id,display_name,joined_at) VALUES(?,?,?,?)').bind(id,user.id,user.name,Date.now()).run();return json({id});
  }
  let match;
  if((match=/^\/api\/circles\/([^/]+)$/.exec(path))&&method==='GET'){
    const c=await member(db,key(match[1]),user.id);const {invite_hash,...publicCircle}=c;
    const garments=(await rows(db,`SELECT ${fields} FROM garments g WHERE g.circle_id=? ${c.owner_id===user.id?'':'AND archived=0'} ORDER BY g.created_at DESC`,c.id)).map(toGarment);
    return json({circle:{...publicCircle,is_owner:c.owner_id===user.id},garments,members:c.owner_id===user.id?await rows(db,'SELECT user_id,display_name,joined_at FROM members WHERE circle_id=? ORDER BY joined_at',c.id):undefined});
  }
  if((match=/^\/api\/circles\/([^/]+)\/invite$/.exec(path))&&method==='POST'){
    const c=await member(db,key(match[1]),user.id,true),invite=token();await db.prepare('UPDATE circles SET invite_hash=? WHERE id=?').bind(await digest(invite),c.id).run();return json({id:c.id,invite});
  }
  if((match=/^\/api\/circles\/([^/]+)\/members\/([^/]+)$/.exec(path))&&method==='DELETE'){
    const c=await member(db,key(match[1]),user.id,true),target=key(match[2]);
    if(target===c.owner_id)throw new Problem('OWNER_REQUIRED','The owner cannot be removed from their own wardrobe.',409);
    const result=await db.batch([db.prepare("DELETE FROM members WHERE circle_id=? AND user_id=? AND NOT EXISTS(SELECT 1 FROM loans WHERE circle_id=? AND borrower_id=? AND status IN ('pending','approved','collected'))").bind(c.id,target,c.id,target),db.prepare('UPDATE circles SET invite_hash=? WHERE id=? AND changes()>0').bind(await digest(token()),c.id)]);
    if(!result[0].meta?.changes){const exists=await db.prepare('SELECT 1 FROM members WHERE circle_id=? AND user_id=?').bind(c.id,target).first();if(exists)throw new Problem('ACTIVE_BOOKING','Finish, decline or cancel this member’s active requests before removing them.',409);}
    return json({ok:true});
  }
  if((match=/^\/api\/circles\/([^/]+)\/garments$/.exec(path))&&method==='POST'){
    const c=await member(db,key(match[1]),user.id,true);if(c.is_example)throw new Problem('EXAMPLE_READONLY','Add your own wardrobe to list a real piece.',409);
    const input=await readJSON(request),f=garmentFields(input),photo=imageData(input.photo),id=crypto.randomUUID();
    const n=await db.prepare('SELECT COUNT(*) AS n FROM garments WHERE circle_id=?').bind(c.id).first();if(n.n>=30)throw new Problem('GARMENT_LIMIT','A wardrobe can hold up to 30 pieces.',409);
    await db.prepare('INSERT INTO garments(id,circle_id,title,category,size_label,colour,measurements,condition_note,care_note,photo,photo_type,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,c.id,f.title,f.category,f.size_label,f.colour,f.measurements,f.condition_note,f.care_note,photo.bytes,photo.type,Date.now()).run();return json({id},201);
  }
  if((match=/^\/api\/garments\/([^/]+)\/photo$/.exec(path))&&method==='GET'){
    const {g}=await garmentFor(db,match[1],user,false,true);if(!g.photo)throw new Problem('NOT_FOUND','This photograph is not available.',404);return safeImageResponse(g.photo,g.photo_type);
  }
  if((match=/^\/api\/garments\/([^/]+)\/availability$/.exec(path))&&method==='GET'){
    const {g,circle}=await garmentFor(db,match[1],user);const dates=loanDates({start_date:url.searchParams.get('from'),end_date:url.searchParams.get('to')}),blocked=await windows(db,g.id);
    return json({...dates,available:!g.archived&&availability(blocked,dates.start_date,dates.end_date,circle.care_days),care_days:circle.care_days,windows:blocked});
  }
  if((match=/^\/api\/garments\/([^/]+)$/.exec(path))){
    const {g,circle}=await garmentFor(db,match[1],user,method!=='GET');
    if(method==='GET')return json({garment:toGarment(g),circle:{id:circle.id,title:circle.title,rules:circle.rules,care_days:circle.care_days,is_example:circle.is_example,is_owner:circle.owner_id===user.id},windows:await windows(db,g.id)});
    if(method==='PATCH'){
      const input=await readJSON(request),f=garmentFields(input);
      if(circle.is_example)throw new Problem('EXAMPLE_READONLY','Example pieces cannot be edited.',409);
      if(g.archived)throw new Problem('ARCHIVED','Restore this piece before editing.',409);
      if(!Number.isInteger(input.version)||input.version!==g.version)throw new Problem('STALE_PIECE','This piece has changed in another tab. Reload before editing it.',409);
      const hasPhoto=Boolean(input.photo),photo=hasPhoto?imageData(input.photo):null;
      const saved=await db.prepare(`UPDATE garments SET title=?,category=?,size_label=?,colour=?,measurements=?,condition_note=?,care_note=?,version=version+1 ${hasPhoto?',photo=?,photo_type=?':''} WHERE id=? AND archived=0 AND version=?`).bind(f.title,f.category,f.size_label,f.colour,f.measurements,f.condition_note,f.care_note,...(hasPhoto?[photo.bytes,photo.type]:[]),g.id,input.version).run();
      if(!saved.meta?.changes)throw new Problem('STALE_PIECE','This piece changed while you were editing. Reload before saving.',409);return json({id:g.id});
    }
  }
  if((match=/^\/api\/garments\/([^/]+)\/archive$/.exec(path))&&method==='POST'){
    const {g,circle}=await garmentFor(db,match[1],user,true);if(circle.is_example)throw new Problem('EXAMPLE_READONLY','Example pieces cannot be archived.',409);
    const input=await readJSON(request,1000);if(typeof input.archived!=='boolean')throw new Problem('INVALID_FIELD','Choose whether to archive this piece.');
    const result=await db.prepare("UPDATE garments SET archived=?,version=version+1 WHERE id=? AND NOT EXISTS(SELECT 1 FROM loans WHERE garment_id=? AND status IN ('approved','collected'))").bind(Number(input.archived),g.id,g.id).run();
    if(!result.meta?.changes)throw new Problem('ACTIVE_BOOKING','Finish or cancel confirmed borrowing before archiving this piece.',409);return json({id:g.id,archived:input.archived});
  }
  if(path==='/api/loans'&&method==='GET'){
    const list=await rows(db,`SELECT l.*,g.title,g.asset,g.archived,c.title AS circle_title,c.is_example,c.owner_id,u.name AS borrower_name FROM loans l JOIN garments g ON g.id=l.garment_id JOIN circles c ON c.id=l.circle_id JOIN users u ON u.id=l.borrower_id WHERE l.borrower_id=? OR c.owner_id=? ORDER BY l.created_at DESC LIMIT 500`,user.id,user.id);
    return json({loans:list.map(l=>loanView(l,user))});
  }
  if(path==='/api/loans'&&method==='POST'){
    const input=await readJSON(request,4000),{g,circle}=await garmentFor(db,input.garment_id,user),dates=loanDates(input),note=text(input.note,'note',400,false),clientKey=identifier(input.idempotency_key);
    const hash=await digest(JSON.stringify([g.id,dates.start_date,dates.end_date,note]));
    const old=await db.prepare('SELECT id,request_hash FROM loans WHERE borrower_id=? AND client_key=?').bind(user.id,clientKey).first();
    if(old){if(old.request_hash!==hash)throw new Problem('REQUEST_CHANGED','This request key was already used for different dates.',409);return json({id:old.id});}
    if(g.archived)throw new Problem('ARCHIVED','This piece is no longer available.',409);
    if(!availability(await windows(db,g.id),dates.start_date,dates.end_date,circle.care_days))throw new Problem('DATES_UNAVAILABLE','These dates are no longer available. Choose another window.',409);
    const duplicate=await db.prepare("SELECT id FROM loans WHERE garment_id=? AND borrower_id=? AND status IN ('pending','approved','collected') AND start_date=? AND end_date=?").bind(g.id,user.id,dates.start_date,dates.end_date).first();if(duplicate) return json({id:duplicate.id});
    const id=crypto.randomUUID(),now=Date.now();
    await db.batch([db.prepare('INSERT INTO loans(id,circle_id,garment_id,borrower_id,start_date,end_date,borrower_note,client_key,request_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,circle.id,g.id,user.id,dates.start_date,dates.end_date,note,clientKey,hash,now,now),db.prepare("INSERT INTO loan_events(id,loan_id,actor_id,from_status,to_status,created_at) VALUES(?,?,?,NULL,'pending',?)").bind(crypto.randomUUID(),id,user.id,now)]);return json({id},201);
  }
  if((match=/^\/api\/loans\/([^/]+)$/.exec(path))){
    const l=await db.prepare('SELECT l.*,c.owner_id,c.is_example,g.archived FROM loans l JOIN circles c ON c.id=l.circle_id JOIN garments g ON g.id=l.garment_id WHERE l.id=? AND (c.owner_id=? OR l.borrower_id=?)').bind(key(match[1]),user.id,user.id).first();
    if(!l)throw new Problem('NOT_FOUND','This request could not be found.',404);
    if(method==='GET')return json({loan:loanView(l,user),events:await rows(db,'SELECT from_status,to_status,created_at FROM loan_events WHERE loan_id=? ORDER BY created_at',l.id)});
    if(method==='PATCH'){
      const input=await readJSON(request,2000),next=input.status,role=l.owner_id===user.id?'owner':'borrower';requireTransition(l,next,role);
      if(l.archived&&['approved','collected'].includes(next))throw new Problem('ARCHIVED','Restore this piece before confirming borrowing.',409);
      const note=role==='owner'?text(input.note,'owner note',400,false):l.owner_note,now=Date.now(),returnDate=next==='returned'?today():l.actual_return_date;
      // Optimistic state guard and event insert execute together in one D1 transaction.
      const result=await db.batch([db.prepare('UPDATE loans SET status=?,owner_note=?,actual_return_date=?,updated_at=? WHERE id=? AND status=?').bind(next,note,returnDate,now,l.id,l.status),db.prepare('INSERT INTO loan_events(id,loan_id,actor_id,from_status,to_status,created_at) SELECT ?,?,?,?,?,? WHERE changes()>0').bind(crypto.randomUUID(),l.id,user.id,l.status,next,now)]);
      if(!result[0].meta?.changes)throw new Problem('STALE_REQUEST','This request has already changed. Refresh it.',409);return json({id:l.id,status:next});
    }
  }
  if(path==='/api/tryons'&&method==='GET')return json({jobs:(await rows(db,'SELECT * FROM tryon_jobs WHERE user_id=? AND expires_at>? ORDER BY created_at DESC LIMIT 40',user.id,Date.now())).map(publicJob),ready:Boolean(env.YOUCAM_API_KEY)});
  if(path==='/api/tryons'&&method==='POST'){
    const input=await readJSON(request),{g}=await garmentFor(db,input.garment_id,user,false,true);
    if(input.consent!==true)throw new Problem('CONSENT_REQUIRED','Confirm that you have permission to process this photograph.');
    if(g.archived)throw new Problem('ARCHIVED','This piece is no longer available for previews.',409);
    await rateLimit(db,'preview:'+user.id,12);
    const photo=await sourcePhoto(env,input)||imageData(input.photo);return json({job:await startPreview(env,user,g,input,photo)},202);
  }
  if((match=/^\/api\/tryons\/([^/]+)\/recheck$/.exec(path))&&method==='POST'){
    const row=await db.prepare('SELECT * FROM tryon_jobs WHERE id=? AND user_id=?').bind(key(match[1]),user.id).first();
    if(!row)throw new Problem('NOT_FOUND','This private preview could not be found.',404);
    if(row.status!=='paused'||!row.provider_id||row.expires_at<=Date.now())throw new Problem('INVALID_TRANSITION','This preview cannot be checked again.',409);
    await rateLimit(db,'recheck:'+user.id,12);
    return json({job:await pollPreview(env,row,true)});
  }
  if((match=/^\/api\/tryons\/([^/]+)(\/image)?$/.exec(path))){
    const row=await db.prepare('SELECT * FROM tryon_jobs WHERE id=? AND user_id=?').bind(key(match[1]),user.id).first();if(!row)throw new Problem('NOT_FOUND','This private preview could not be found.',404);
    if(method==='DELETE'&&!match[2]){
      await db.batch([db.prepare("UPDATE tryon_jobs SET status='cancelled' WHERE id=?").bind(row.id),db.prepare('DELETE FROM result_chunks WHERE job_id=?').bind(row.id)]);
      ctx.waitUntil(deleteProvider(env,row));return json({ok:true});
    }
    if(method==='GET'&&match[2]){
      if(row.expires_at<=Date.now()||row.status!=='succeeded')throw new Problem('PREVIEW_EXPIRED','This image is no longer available.',410);
      const parts=await rows(db,'SELECT bytes FROM result_chunks WHERE job_id=? ORDER BY part',row.id),bytes=new Uint8Array(row.result_size);let at=0;
      for(const p of parts){const b=new Uint8Array(p.bytes);bytes.set(b,at);at+=b.length;}
      if(at!==row.result_size)throw new Problem('PREVIEW_UNAVAILABLE','This image is unavailable. Please try a new preview.',410);
      return safeImageResponse(bytes,row.result_type);
    }
    if(method==='GET')return json({job:await pollPreview(env,row),message:ERROR_GUIDANCE[row.error_code]||null});
  }
  if(path==='/api/export'&&method==='GET'){
    const circles=await rows(db,'SELECT c.id,c.title,c.care_days,c.rules,c.is_example FROM circles c JOIN members m ON m.circle_id=c.id WHERE m.user_id=?',user.id);
    const loans=await rows(db,'SELECT l.id,g.title,l.start_date,l.end_date,l.status,l.borrower_note,l.owner_note,l.actual_return_date FROM loans l JOIN garments g ON g.id=l.garment_id JOIN circles c ON c.id=l.circle_id WHERE l.borrower_id=? OR c.owner_id=? ORDER BY l.created_at DESC',user.id,user.id);
    if(url.searchParams.get('format')==='csv')return new Response(['Piece,Collection,Return,Status,Actual return',...loans.map(l=>[l.title,l.start_date,l.end_date,l.status,l.actual_return_date].map(csvCell).join(','))].join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="borrowloom-borrowing.csv"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    return json({exported_at:new Date().toISOString(),user,circles,loans},200,{'Content-Disposition':'attachment; filename="borrowloom-records.json"'});
  }
  throw new Problem('NOT_FOUND','That page or action could not be found.',404);
}

export default {
  async fetch(request,env,ctx={waitUntil:()=>{}}){
    try{return await api(request,env,ctx);}catch(e){
      if(e instanceof Problem)return json({error:{code:e.code,message:e.message,field:e.field}},e.status);
      const message=String(e?.message||'');
      if(/DATES_UNAVAILABLE|AWAITING_RETURN/.test(message))return json({error:{code:'DATES_UNAVAILABLE',message:'This piece is already committed for these dates or is awaiting return. Choose another window.'}},409);
      if(/GARMENT_UNAVAILABLE/.test(message))return json({error:{code:'GARMENT_UNAVAILABLE',message:'This piece is no longer available.'}},409);
      if(/MEMBERSHIP_REQUIRED/.test(message))return json({error:{code:'MEMBERSHIP_REQUIRED',message:'Your membership has changed. Ask the owner for access.'}},403);
      // Log only a random diagnostic reference. Photos, invitation keys, provider URLs and request bodies never enter logs.
      const reference=crypto.randomUUID();console.error('Borrowloom request failed',reference,e?.name||'Error');
      return json({error:{code:'INTERNAL_ERROR',message:'Something went wrong. Please reload and try again.',reference}},500);
    }
  },
  async scheduled(_event,env,ctx){ctx.waitUntil(cleanup(env));}
};
