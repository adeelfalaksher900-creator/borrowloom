import { Problem, object } from './domain.mjs';

export function token() {
  return [...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function digest(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function opaque(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }

export function trustedMutation(request, env) {
  const origins=String(env.SITE_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
  const origin=request.headers.get('Origin');
  if (!origin || !origins.includes(origin) || request.headers.get('X-Borrowloom')!=='1') throw new Problem('ORIGIN_REJECTED','Open Borrowloom in its own tab and try again.',403);
}

export async function readJSON(request, limit=800000) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Problem('INVALID_CONTENT_TYPE','Send this form as JSON.',415);
  const declared=Number(request.headers.get('content-length')||0);
  if (declared>limit) throw new Problem('BODY_TOO_LARGE','This form or photo is too large.',413);
  const reader=request.body?.getReader();
  if (!reader) throw new Problem('EMPTY_BODY','Complete the form before continuing.');
  let total=0;const chunks=[];
  try {
    while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit){await reader.cancel();throw new Problem('BODY_TOO_LARGE','This form or photo is too large.',413);}chunks.push(value);}
    const bytes=new Uint8Array(total);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.byteLength;}
    return object(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
  } catch(e) { if(e instanceof Problem)throw e; throw new Problem('INVALID_JSON','This form could not be read. Please try again.'); }
}

export async function rateLimit(db,key,maximum,seconds=3600) {
  const now=Date.now();const bucket=Math.floor(now/(seconds*1000));
  const r=await db.prepare(`INSERT INTO rate_limits(key,hits,expires_at) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET hits=hits+1 WHERE hits<?`).bind(`${key}:${bucket}`,now+seconds*2000,maximum).run();
  if (!r.meta?.changes) throw new Problem('RATE_LIMITED','There have been too many attempts. Please try again later.',429);
}

const COOKIE='__Host-borrowloom';
export function cookie(raw,age=7776000) { return `${COOKIE}=${raw}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`; }
export async function session(request,env,create=false) {
  const raw=request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  if (opaque(raw)) {
    const row=await env.DB.prepare(`SELECT u.id,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`).bind(await digest(raw),Date.now()).first();
    if(row)return {user:row,headers:{}};
  }
  if(!create)throw new Problem('SESSION_EXPIRED','Your browser session has expired. Reload the page or use your recovery code.',401);
  const origin=String(request.headers.get('CF-Connecting-IP')||'local');
  await rateLimit(env.DB,'sessions:'+await digest(todayKey()+':'+origin),150);
  const newToken=token(),id=crypto.randomUUID(),now=Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO users(id,name,created_at) VALUES(?,?,?)').bind(id,'Member',now),
    env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await digest(newToken),id,now+7776000000)
  ]);
  return {user:{id,name:'Member'},headers:{'Set-Cookie':cookie(newToken)}};
}
function todayKey(){return new Date().toISOString().slice(0,10);}

export async function member(db,circleId,userId,owner=false) {
  const c=await db.prepare(`SELECT c.*,m.display_name FROM circles c JOIN members m ON m.circle_id=c.id WHERE c.id=? AND m.user_id=?`).bind(circleId,userId).first();
  if(!c)throw new Problem('NOT_FOUND','This wardrobe is not available to this browser. Open its invitation to join.',404);
  if(owner&&c.owner_id!==userId)throw new Problem('OWNER_REQUIRED','Only the wardrobe owner can do that.',403);
  return c;
}

export function imageInfo(bytes) {
  const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  if(b.length<24)throw new Problem('INVALID_IMAGE','Choose a readable JPEG or PNG photograph.');
  if(b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71&&b[4]===13&&b[5]===10&&b[6]===26&&b[7]===10&&String.fromCharCode(...b.slice(12,16))==='IHDR') {
    const d=new DataView(b.buffer,b.byteOffset,b.byteLength);
    return {type:'image/png',width:d.getUint32(16),height:d.getUint32(20)};
  }
  if(b[0]===255&&b[1]===216) {
    let at=2;
    while(at+8<b.length){
      if(b[at]!==255){at++;continue;}
      const marker=b[at+1];at+=2;
      if(marker===0||marker===255||marker===216||(marker>=208&&marker<=215))continue;
      if(marker===217||marker===218)break;
      if(at+2>b.length)break;
      const length=(b[at]<<8)|b[at+1];
      if(length<2||at+length>b.length)break;
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))return {type:'image/jpeg',height:(b[at+3]<<8)|b[at+4],width:(b[at+5]<<8)|b[at+6]};
      at+=length;
    }
  }
  throw new Problem('INVALID_IMAGE','Choose a readable JPEG or PNG photograph.');
}

export function validateImage(bytes,maxBytes=530000) {
  const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  if(b.length>maxBytes)throw new Problem('IMAGE_TOO_LARGE','Choose a smaller photograph or reduce its resolution.',413);
  const info=imageInfo(b);
  if(Math.min(info.width,info.height)<384||Math.max(info.width,info.height)<512||Math.max(info.width,info.height)>4096)throw new Problem('IMAGE_DIMENSIONS','Use a clear photo of at least 512 × 384 pixels, with neither side above 4096 pixels.');
  return {...info,bytes:b};
}

export function imageData(value) {
  if(typeof value!=='string'||value.length>710000)throw new Problem('IMAGE_TOO_LARGE','Choose a smaller JPEG or PNG photograph.',413);
  const match=/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if(!match)throw new Problem('INVALID_IMAGE','Choose a JPEG or PNG photograph.');
  let raw;try{raw=atob(match[2]);}catch{throw new Problem('INVALID_IMAGE','This photo could not be read.');}
  const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  const info=validateImage(bytes);
  if(info.type!=='image/'+match[1])throw new Problem('INVALID_IMAGE','The photo contents do not match its format.');
  return info;
}

export function json(value,status=200,extra={}) {
  return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...extra}});
}

export function safeImageResponse(bytes,type,extra={}) {
  const binary=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  return new Response(binary,{headers:{'Content-Type':type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Referrer-Policy':'no-referrer',...extra}});
}
