// Solo se ejecuta en Cloud Functions. No incluye credenciales: usa la identidad del entorno.
const {initializeApp}=require('firebase-admin/app');
const {getDatabase}=require('firebase-admin/database');
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {onValueWritten}=require('firebase-functions/v2/database');
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {lifecycle,deletionCandidate}=require('./lifecycle.cjs');
initializeApp();
const db=()=>getDatabase();
async function viewer(request) {
 if(!request.auth || request.auth.token.email_verified!==true)throw new HttpsError('unauthenticated','Verifica tu correo e inicia sesión.');
 const profile=(await db().ref(`profiles/${request.auth.uid}`).get()).val();
 if(profile?.university!=='UPB')throw new HttpsError('permission-denied','Universidad no habilitada.');
 return {uid:request.auth.uid,profile};
}
const validId=value=>typeof value==='string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
exports.createStudentBoard=onCall({region:'us-central1'},async request=>{
 const {uid,profile}=await viewer(request);
 if(profile.requestedRole!=='student')throw new HttpsError('permission-denied','Esta opción es para estudiantes.');
 const title=String(request.data?.title||'').trim(),course=String(request.data?.course||'').trim();
 if([title,course].some(v=>v.length<2 || v.length>100))throw new HttpsError('invalid-argument','Escribe título y materia entre 2 y 100 caracteres.');
 const university=profile.university,id=db().ref().push().key,now=Date.now();
 const meta={title,course,ownerUid:uid,ownerName:profile.displayName,kind:'student',createdAt:now};
 await db().ref().update({[`boardDirectory/${university}/${id}`]:meta,[`boardData/${university}/${id}/_lifecycle`]:{createdAt:now,emptySince:now,deleting:false}});
 return {...meta,id};
});
async function erase(university,id) {
 await db().ref().update({[`boardDirectory/${university}/${id}`]:null,[`boardData/${university}/${id}`]:null});
}
exports.deleteStudentBoard=onCall({region:'us-central1'},async request=>{
 const {uid,profile}=await viewer(request),id=request.data?.id;
 if(!validId(id))throw new HttpsError('invalid-argument','Tablero inválido.');
 const path=`boardData/${profile.university}/${id}`,meta=(await db().ref(`boardDirectory/${profile.university}/${id}`).get()).val();
 if(!meta || meta.kind!=='student' || meta.ownerUid!==uid)throw new HttpsError('permission-denied','Solo el estudiante creador puede eliminar su tablero.');
 await db().ref(path).transaction(value=>({...value,_lifecycle:{...value?._lifecycle,deleting:true}}));
 await erase(profile.university,id);return {deleted:true};
});
exports.trackStudentPresence=onValueWritten({ref:'/boardData/{university}/{board}/slots',region:'us-central1'},async event=>{
 const {university,board}=event.params,meta=(await db().ref(`boardDirectory/${university}/${board}`).get()).val();
 if(meta?.kind!=='student')return;
 const target=db().ref(`boardData/${university}/${board}`);
 await target.transaction(current=>lifecycle(current,meta,Date.now()));
 if(!(await db().ref(`boardDirectory/${university}/${board}`).get()).exists())await target.remove();
});
// Every minute; expiry is also enforced by RTDB rules at exactly 45 minutes.
exports.cleanStudentBoards=onSchedule({schedule:'every 1 minutes',region:'us-central1',timeZone:'UTC'},async()=>{
 const universities=(await db().ref('boardDirectory').get()).val()||{};
 for(const [university,boards] of Object.entries(universities))for(const [id,meta] of Object.entries(boards)) {
  if(meta.kind!=='student')continue;
  const target=db().ref(`boardData/${university}/${id}`);
  // Repair old records once, without resetting an existing idle interval.
  await target.transaction(current=>lifecycle(current,meta,Date.now()));
  if(!(await db().ref(`boardDirectory/${university}/${id}`).get()).exists()){await target.remove();continue;}
  const result=await target.transaction(current=>current===null?{}:deletionCandidate(current,meta,Date.now()));
  if(result.committed && result.snapshot.child('_lifecycle/deleting').val()===true)await erase(university,id);
 }
});
