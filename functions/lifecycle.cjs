const TTL=45*60*1000, IDLE=2*60*1000;
function lifecycle(current,meta,now) {
 if(!meta || meta.kind!=='student') return;
 const value=current || {};
 if(value._lifecycle?.deleting) return;
 const occupied=Object.keys(value.slots || {}).length>0;
 return {...value,_lifecycle:{createdAt:meta.createdAt,emptySince:occupied?null:(value._lifecycle?.emptySince ?? now),deleting:false}};
}
function deletionCandidate(current,meta,now) {
 if(!meta || meta.kind!=='student')return;
 const value=current||{},empty=Object.keys(value.slots||{}).length===0;
 if(value._lifecycle?.deleting || now>=meta.createdAt+TTL || (empty && value._lifecycle?.emptySince!=null && now>=value._lifecycle.emptySince+IDLE))
  return {...value,_lifecycle:{...value._lifecycle,deleting:true}};
}
module.exports={TTL,IDLE,lifecycle,deletionCandidate};
