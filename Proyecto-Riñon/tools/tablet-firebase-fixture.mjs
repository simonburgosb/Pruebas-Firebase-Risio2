// In-memory browser fixture. Only loaded by verify-tablet-browser route overrides.
const data={},listeners=new Set();let serial=0;window.tabletBoardData=data;
export const ref=(db,path='')=>({path,key:path.split('/').at(-1)});
function val(t){if(t.path==='.info/connected')return true;if(t.path==='.info/serverTimeOffset')return 0;let o=data;for(const k of t.path.split('/').filter(Boolean))o=o?.[k];return o??null;}
const snap=t=>({val:()=>structuredClone(val(t)),exists:()=>val(t)!==null});
function put(t,v){const keys=t.path.split('/').filter(Boolean);let o=data;for(const k of keys.slice(0,-1))o=o[k]??={};if(v==null)delete o[keys.at(-1)];else o[keys.at(-1)]=structuredClone(v);queueMicrotask(()=>{for(const [target,cb]of listeners)cb(snap(target));});}
export const push=t=>ref(null,t.path+'/key'+(++serial));export const get=async t=>snap(t);export const set=async(t,v)=>put(t,v);export const remove=async t=>put(t,null);export const update=async(t,v)=>{for(const [p,x]of Object.entries(v))put(ref(null,[t.path,p].filter(Boolean).join('/')),x);};
export const onValue=(t,cb)=>{const rec=[t,cb];listeners.add(rec);queueMicrotask(()=>cb(snap(t)));return()=>listeners.delete(rec);};export const query=t=>t;export const limitToLast=()=>{};export const serverTimestamp=()=>Date.now();export const runTransaction=async(t,fn)=>{const v=fn(val(t));if(v===undefined)return{committed:false};put(t,v);return{committed:true};};export const onDisconnect=()=>({remove:async()=>{},set:async()=>{},update:async()=>{},cancel:async()=>{}});
