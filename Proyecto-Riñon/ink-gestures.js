// Shared pointer arbitration: one finger/pen writes; two fingers navigate.
// A navigation gesture cancels its provisional stroke and stays locked until
// every finger lifts. Stylus contact rejects palm/touch events while writing.
export class InkGestures {
  constructor(canvas,{viewport=canvas.parentElement,targets=()=>[canvas],enabled=()=>true,cancel=()=>{},changed=()=>{}}={}) {
    Object.assign(this,{canvas,viewport,targets,enabled,cancel,changed});
    this.scrollHost=viewport.closest?.('.pdf-media');
    this.pointers=new Map();this.scale=1;this.x=0;this.y=0;
    viewport.classList.add('ink-viewport');canvas.style.touchAction='none';
    this.resetButton=document.createElement('button');this.resetButton.type='button';this.resetButton.className='ink-reset';this.resetButton.textContent='Restablecer vista';this.resetButton.hidden=true;
    this.resetButton.addEventListener('click',()=>this.reset());viewport.append(this.resetButton);
    const hints=document.createElement('span');hints.className='sr-only';hints.id='ink-hint-'+Math.random().toString(36).slice(2);hints.textContent='Un dedo o lápiz para escribir. Dos dedos para ampliar y desplazar. Restablecer vista devuelve el tamaño original.';viewport.append(hints);canvas.setAttribute('aria-describedby',hints.id);
    this.listeners=[];
    for(const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture']) {
      const fn=e=>this.handle(type,e);canvas.addEventListener(type,fn,{capture:true,passive:false});this.listeners.push([type,fn]);
    }
    this.resize=()=>this.apply();window.addEventListener('resize',this.resize);
  }
  stop(e){if(e.cancelable)e.preventDefault();e.stopImmediatePropagation();}
  pair(){const a=[...this.pointers.values()].filter(p=>p.type==='touch');if(a.length<2)return null;const [p,q]=a;return {x:(p.x+q.x)/2,y:(p.y+q.y)/2,d:Math.max(1,Math.hypot(p.x-q.x,p.y-q.y))};}
  handle(type,e) {
    if(!this.enabled())return;
    const touch=e.pointerType==='touch',pen=e.pointerType==='pen';
    if(type==='pointerdown') {
      if(e.pointerType==='mouse')return;
      this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,type:e.pointerType});
      try{this.canvas.setPointerCapture(e.pointerId);}catch{}
      if(pen){if(this.pointers.size>1)this.cancel();this.pen=e.pointerId;return;}
      if(touch && this.pen!=null){this.stop(e);return;}
      const pair=this.pair();
      if(pair){this.cancel();this.navigating=true;this.previous=pair;this.stop(e);}
      else if(this.navigating)this.stop(e);
    } else if(type==='pointermove') {
      if(this.pointers.has(e.pointerId))this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,type:e.pointerType});
      if(touch && this.pen!=null){this.stop(e);return;}
      if(touch && this.navigating){
        const pair=this.pair();
        if(pair && this.previous){const r=this.viewport.getBoundingClientRect(),old=this.scale;this.scale=Math.min(4,Math.max(1,old*pair.d/this.previous.d));const ratio=this.scale/old;
          if(old===1 && this.scale===1 && this.scrollHost)this.scrollHost.scrollBy(this.previous.x-pair.x,this.previous.y-pair.y);
          this.x=pair.x-r.left-(this.previous.x-r.left-this.x)*ratio;this.y=pair.y-r.top-(this.previous.y-r.top-this.y)*ratio;this.apply();}
        this.previous=pair;this.stop(e);
      }
    } else {
      const tracked=this.pointers.has(e.pointerId);if(!tracked)return;
      const blocked=touch && (this.navigating || this.pen!=null);
      if(type==='pointercancel' || type==='lostpointercapture'){if(!blocked)this.cancel();this.stop(e);}
      this.pointers.delete(e.pointerId);
      if(pen && this.pen===e.pointerId){this.pen=null;if(this.pointers.size)this.navigating=true;}
      if(blocked)this.stop(e);
      if(![...this.pointers.values()].some(p=>p.type==='touch')){this.navigating=false;this.previous=null;}
      else if(this.navigating)this.previous=this.pair();
    }
  }
  apply(){
    const w=this.viewport.clientWidth,h=this.viewport.clientHeight;
    this.x=Math.min(0,Math.max(w*(1-this.scale),this.x));this.y=Math.min(0,Math.max(h*(1-this.scale),this.y));
    for(const target of this.targets())if(target){target.style.transformOrigin='0 0';target.style.transform=`translate(${this.x}px, ${this.y}px) scale(${this.scale})`;}
    this.resetButton.hidden=this.scale===1 && this.x===0 && this.y===0;this.resetButton.textContent=`Restablecer vista · ${Math.round(this.scale*100)}%`;this.changed();
  }
  abortInput(){this.cancel();const ids=[...this.pointers.keys()];this.pointers.clear();this.pen=null;this.navigating=false;this.previous=null;for(const id of ids)try{if(this.canvas.hasPointerCapture(id))this.canvas.releasePointerCapture(id);}catch{}}
  reset(){this.abortInput();this.scale=1;this.x=0;this.y=0;this.apply();}
  destroy(){this.reset();for(const [type,fn] of this.listeners)this.canvas.removeEventListener(type,fn,true);window.removeEventListener('resize',this.resize);this.resetButton.remove();this.viewport.querySelector('#'+this.canvas.getAttribute('aria-describedby'))?.remove();this.viewport.classList.remove('ink-viewport');}
}
