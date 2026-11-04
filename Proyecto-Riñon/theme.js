export const darkMode=()=>document.documentElement.dataset.theme==='dark';
export function readableInk(color,paper=false){
  if(!darkMode() || paper || !/^#[0-9a-f]{6}$/i.test(color))return color;
  const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
  const lum=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
  return lum<155?'#'+rgb.map(c=>Math.round(c+(255-c)*.55).toString(16).padStart(2,'0')).join(''):color;
}
const buttons=[];
function sync(){for(const button of buttons){const dark=darkMode();button.setAttribute('aria-pressed',String(dark));button.setAttribute('aria-label',dark?'Activar modo claro':'Activar modo oscuro');button.title=button.getAttribute('aria-label');button.innerHTML=`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${dark?'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>':'<path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z"/>'}</svg><span>${dark?'Modo claro':'Modo oscuro'}</span>`;}}
export function setTheme(theme,persist=true){document.documentElement.dataset.theme=theme==='dark'?'dark':'light';if(persist)try{localStorage.setItem('risio.theme.v1',document.documentElement.dataset.theme);}catch{}sync();window.dispatchEvent(new CustomEvent('risio-theme-change'));}
for(const host of document.querySelectorAll('#account-bar,.auth-gate,.library-reader-actions')){const b=document.createElement('button');b.type='button';b.className='theme-toggle';b.addEventListener('click',()=>setTheme(darkMode()?'light':'dark'));host.prepend(b);buttons.push(b);}
sync();window.addEventListener('storage',e=>{if(e.key==='risio.theme.v1')setTheme(e.newValue,false);});
let frame;function size(){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const height=Math.round(window.visualViewport?.height||innerHeight);document.documentElement.style.setProperty('--app-height',`${height}px`);document.documentElement.dataset.keyboard=String(height<innerHeight*.75 || height<480 && Boolean(document.activeElement?.matches('input,textarea')));});}
size();window.addEventListener('focusin',size);window.addEventListener('focusout',size);window.addEventListener('resize',size);window.visualViewport?.addEventListener('resize',size);
