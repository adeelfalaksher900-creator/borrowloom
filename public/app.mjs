import {$,$$,api,errorBox} from './lib/ui.mjs';
const page=document.body.dataset.page;
const current=['piece','wardrobe','fitting'].includes(page)?'wardrobes':page;
$$('[data-nav]').forEach(a=>{if(a.dataset.nav===current){a.classList.add('active');a.setAttribute('aria-current','page');}});
$('.menu-toggle')?.addEventListener('click',e=>{const b=e.currentTarget,expanded=b.getAttribute('aria-expanded')==='true';b.setAttribute('aria-expanded',String(!expanded));b.setAttribute('aria-label',expanded?'Open navigation':'Close navigation');$('#mobile-nav').hidden=expanded;});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#mobile-nav')?.hidden){$('#mobile-nav').hidden=true;$('.menu-toggle').setAttribute('aria-expanded','false');$('.menu-toggle').setAttribute('aria-label','Open navigation');$('.menu-toggle').focus();}});
if(['wardrobes','wardrobe','piece','borrowing','fitting','account'].includes(page)){
  const app=$('#app');
  try{const session=await api('/api/session');const {mount}=await import(`./pages/${page}.mjs`);await mount(app,session);}catch(error){app.innerHTML=errorBox(error)+'<button class="button secondary" id="reload">Try again</button>';$('#reload').onclick=()=>location.reload();}
}
