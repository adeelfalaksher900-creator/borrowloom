export const $=(s,root=document)=>root.querySelector(s);
export const $$=(s,root=document)=>[...root.querySelectorAll(s)];
export const esc=(s='')=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const icon=id=>`<svg class="icon" aria-hidden="true"><use href="/icons.svg#${id}"></use></svg>`;
export const day=()=>new Date().toISOString().slice(0,10);
export function plusDay(date,n){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export const dateLabel=s=>s==='9999-12-31'?'until the piece is returned':new Date(s+'T00:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
export const dateRange=(a,b)=>a===b?dateLabel(a):`${dateLabel(a)} – ${dateLabel(b)}`;
export const categories={full_body:'Dresses & full outfits',upper_body:'Tops & shirts',outer:'Jackets & outerwear'};
export const statusName={pending:'Awaiting owner',approved:'Dates confirmed',collected:'With borrower',returned:'Returned',declined:'Declined',cancelled:'Cancelled'};
export const stateTag=s=>`<span class="tag ${['approved','returned'].includes(s)?'good':s==='pending'?'warning':''}">${esc(statusName[s]||s)}</span>`;
export function toast(message){const t=$('#toast');t.textContent=message;t.hidden=false;clearTimeout(t._timer);t._timer=setTimeout(()=>t.hidden=true,5000);}
export async function api(path,method='GET',body,timeout=30000){
  let r;try{r=await fetch(path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Borrowloom':'1'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeout),cache:'no-store'});}catch(e){throw new Error(e.name==='TimeoutError'?'This is taking longer than expected. Your request may still be processing. Refresh before trying again.':'You appear to be offline. Check your connection, then try again.');}
  let data;try{data=await r.json();}catch{throw new Error('The service returned an unreadable response. Please try again.');}
  if(!r.ok){const error=new Error(data.error?.message||'This action could not be completed.');error.code=data.error?.code;error.status=r.status;throw error;}return data;
}
export function errorBox(error){return `<div class="error" role="alert">${esc(error.message||error)}</div>`;}
export function showError(root,error){let e=$('.form-error',root);if(!e){e=document.createElement('div');e.className='form-error';root.prepend(e);}e.innerHTML=errorBox(error);e.setAttribute('tabindex','-1');e.focus();}
export function bindForm(form,handler){form.addEventListener('submit',async e=>{e.preventDefault();if(form.dataset.pending==='1')return;form.dataset.pending='1';const b=$('[type=submit]',form),old=b?.textContent;if(b){b.disabled=true;b.textContent='One moment…';}const err=$('.form-error',form);if(err)err.innerHTML='';try{await handler(Object.fromEntries(new FormData(form)),form);}catch(error){showError(form,error);}finally{form.dataset.pending='0';if(b&&b.isConnected){b.disabled=false;b.textContent=old;}}});}
export function modal(title,body,trigger=document.activeElement){
  const d=document.createElement('dialog');d.className='modal';const titleId='dialog-title-'+crypto.randomUUID();d.setAttribute('aria-labelledby',titleId);d.innerHTML=`<div class="modal-head"><h2 id="${titleId}">${esc(title)}</h2><button class="modal-close" type="button" aria-label="Close dialog">${icon('close')}</button></div><div class="modal-content">${body}</div>`;
  document.body.append(d);$('.modal-close',d).addEventListener('click',()=>d.close());d.addEventListener('close',()=>{d.remove();if(!document.querySelector('dialog[open]')&&trigger?.isConnected&&!trigger.disabled)trigger.focus();},{once:true});d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});d.showModal();return d;
}
export function field(name,label,{value='',type='text',required=false,max=120,help='',placeholder=''}={}){return `<div class="field"><label for="${name}">${esc(label)}${required?' <span aria-hidden="true">*</span>':''}</label><input id="${name}" name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''} maxlength="${max}" placeholder="${esc(placeholder)}" ${help?`aria-describedby="${name}-help"`:''}>${help?`<span class="help" id="${name}-help">${esc(help)}</span>`:''}</div>`;}
export function textarea(name,label,{value='',max=400,help=''}={}){return `<div class="field"><label for="${name}">${esc(label)}</label><textarea id="${name}" name="${name}" maxlength="${max}" ${help?`aria-describedby="${name}-help"`:''}>${esc(value)}</textarea>${help?`<span class="help" id="${name}-help">${esc(help)}</span>`:''}</div>`;}
export function select(name,label,options,value,id=name){return `<div class="field"><label for="${id}">${esc(label)}</label><select id="${id}" name="${name}">${Object.entries(options).map(([k,v])=>`<option value="${esc(k)}" ${String(value)===k?'selected':''}>${esc(v)}</option>`).join('')}</select></div>`;}
export async function copy(text,button){try{await navigator.clipboard.writeText(text);if(button){const old=button.textContent;button.textContent='Copied';setTimeout(()=>{if(button.isConnected)button.textContent=old;},2200);}toast('Copied to clipboard.');}catch{const d=modal('Copy this text',`<p class="help">Select the text below and copy it.</p><div class="code">${esc(text)}</div>`);$('.code',d).focus();}}
export function invitation(id,secret){return `${location.origin}/wardrobes#join=${encodeURIComponent(id)}.${secret}`;}
export function inviteModal(id,secret){const link=invitation(id,secret),d=modal('An invitation to share.',`<p class="help">Send this link only to people you know. Anyone with it can join this wardrobe. Existing members keep access when you replace the link.</p><div class="code">${esc(link)}</div><button class="button primary" id="copy-invite">Copy invitation ${icon('share')}</button>`);$('#copy-invite',d).onclick=e=>copy(link,e.currentTarget);return d;}
export function pieceCard(g){return `<article class="piece-card"><a href="/piece?id=${g.id}" aria-label="View ${esc(g.title)}"><div class="image-wrap"><img src="${esc(g.photo_url)}" alt="${esc(g.title)}" width="480" height="600" loading="lazy">${g.archived?'<span class="tag">Archived</span>':''}</div><div class="card-body"><h3>${esc(g.title)}</h3><div class="card-meta"><span>${esc(g.size_label)} · ${esc(g.colour||categories[g.category])}</span><span aria-hidden="true">↗</span></div></div></a></article>`;}
export async function normalizePhoto(file){
  if(!file||!['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(file.type))throw new Error('Choose a JPEG, PNG or WebP photograph. Export HEIC as JPEG if your browser cannot read it.');
  if(file.size>12000000)throw new Error('Choose a photograph smaller than 12 MB.');
  let bitmap;try{bitmap=await createImageBitmap(file);}catch{throw new Error('This photo could not be opened. Export it as JPEG or PNG and try again.');}
  try{
    if(Math.min(bitmap.width,bitmap.height)<384||Math.max(bitmap.width,bitmap.height)<512)throw new Error('Use a clear photograph of at least 512 × 384 pixels.');
    let scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),quality=.88,data;
    const canvas=document.createElement('canvas'),c=canvas.getContext('2d');
    for(let i=0;i<8;i++){canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);c.fillStyle='#ffffff';c.fillRect(0,0,canvas.width,canvas.height);c.drawImage(bitmap,0,0,canvas.width,canvas.height);data=canvas.toDataURL('image/jpeg',quality);if(data.length<700000)return data;quality-=.06;if(i>3)scale*=.85;}
    throw new Error('This photograph is still too large. Crop closer to the garment or person, then try again.');
  }finally{bitmap.close();}
}
export function recoveryModal(code){const spaced=code.match(/.{1,8}/g).join('-'),d=modal('Keep your way back in.',`<div class="notice warning">This code is your account key. Keep it somewhere private. We cannot recover an account without it.</div><div class="code">${esc(spaced)}</div><p class="help">Using recovery replaces this code and signs out earlier sessions. Save the replacement code each time.</p><div class="form-actions"><button class="button primary" id="copy-code">Copy recovery code</button><button class="button secondary" id="download-code">Download code</button></div>`);$('#copy-code',d).onclick=e=>copy(spaced,e.currentTarget);$('#download-code',d).onclick=()=>downloadText('borrowloom-recovery.txt','Borrowloom private recovery code\n\n'+spaced+'\n\nKeep this private. Anyone with it can access your account.');}
export function downloadText(name,text,type='text/plain'){const u=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),5000);}
