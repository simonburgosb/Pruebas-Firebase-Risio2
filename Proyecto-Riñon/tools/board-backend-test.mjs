// Test harness for the real callable handlers. Local auth/database emulators only.
import {createRequire} from 'node:module';
import http from 'node:http';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../functions/index.js',import.meta.url));
process.env.FIREBASE_CONFIG=JSON.stringify({projectId:'demo-risio',databaseURL:'http://127.0.0.1:9000?ns=demo-risio'});
process.env.GCLOUD_PROJECT='demo-risio';
const backend=require('./index.js');
const {getDatabase}=require('firebase-admin/database'),{getAuth}=require('firebase-admin/auth');
const db=getDatabase();
const req=(uid,data)=>({auth:{uid,token:{email_verified:true}},data});
export async function testLifecycle(){
 const made=await backend.createStudentBoard.run(req('student1',{title:'Tablero temporal',course:'Renal'}));
 assert.ok(made.id);
 await assert.rejects(()=>backend.deleteStudentBoard.run(req('student2',{id:made.id})));
 await backend.deleteStudentBoard.run(req('student1',{id:made.id}));
 assert.equal((await db.ref(`boardDirectory/UPB/${made.id}`).get()).exists(),false);
 assert.equal((await db.ref(`boardData/UPB/${made.id}`).get()).exists(),false);
 const expired=await backend.createStudentBoard.run(req('student1',{title:'Caduca',course:'Renal'}));
 await db.ref(`boardDirectory/UPB/${expired.id}/createdAt`).set(Date.now()-2700001);
 await db.ref(`boardData/UPB/${expired.id}/slots/s0`).set({uid:'student1'});
 const idle=await backend.createStudentBoard.run(req('student1',{title:'Vacío',course:'Renal'}));
 await db.ref(`boardData/UPB/${idle.id}/_lifecycle/emptySince`).set(Date.now()-120001);
 const active=await backend.createStudentBoard.run(req('student1',{title:'Activo',course:'Renal'}));
 await db.ref(`boardData/UPB/${active.id}/slots/s0`).set({uid:'student1'});
 await backend.trackStudentPresence.run({params:{university:'UPB',board:active.id}});
 await backend.cleanStudentBoards.run({});
 for(const id of [expired.id,idle.id]){assert.equal((await db.ref(`boardDirectory/UPB/${id}`).get()).exists(),false);assert.equal((await db.ref(`boardData/UPB/${id}`).get()).exists(),false);}
 assert.ok((await db.ref(`boardDirectory/UPB/${active.id}`).get()).exists());
 assert.ok((await db.ref('boardDirectory/UPB/class').get()).exists(),'No caduca la clase docente');
 await db.ref(`boardData/UPB/${active.id}/slots`).remove();await backend.trackStudentPresence.run({params:{university:'UPB',board:active.id}});
 assert.ok((await db.ref(`boardData/UPB/${active.id}/_lifecycle/emptySince`).get()).val()>Date.now()-2000);
 console.log('OK backend: creación autenticada, borrado exclusivo del creador, eliminación completa por 45 minutos y 2 minutos vacíos, actividad reinicia intervalo, clases docentes conservadas.');
}
export async function startCallableHarness(){
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:8085');res.setHeader('Access-Control-Allow-Headers','content-type,authorization,x-firebase-appcheck');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  const name=req.url.split('/').at(-1);
  if(!['createStudentBoard','deleteStudentBoard'].includes(name)){res.writeHead(404);res.end();return;}
  try{const token=await getAuth().verifyIdToken((req.headers.authorization||'').replace(/^Bearer /,''));let input='';for await(const part of req)input+=part;
   const result=await backend[name].run({auth:{uid:token.uid,token},data:JSON.parse(input).data});res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:result}));
  }catch(error){res.writeHead(403,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{status:'PERMISSION_DENIED',message:error.message}}));}
 });
 await new Promise(resolve=>server.listen(5001,'127.0.0.1',resolve));
 return ()=>new Promise(resolve=>server.close(resolve));
}
export async function closeBackend(){await require('firebase-admin/app').deleteApp(require('firebase-admin/app').getApp());}
