import fs from 'node:fs';
import assert from 'node:assert/strict';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {boardLifetime} from '../board-utils.js';
for (const key of ['HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy']) delete process.env[key];
const env = await initializeTestEnvironment({projectId:'demo-risio',database:{host:'127.0.0.1',port:9000,rules:fs.readFileSync(new URL('../../database.rules.json',import.meta.url),'utf8')}});
const user = (uid, verified = true) => env.authenticatedContext(uid,{email_verified:verified}).database();
const profile = (uid,role='student',university='UPB') => ({displayName:uid,university,requestedRole:role,...(role==='student'?{semester:3}:{}),createdAt:Date.now()-100,updatedAt:Date.now()-100});
const directory = (uid,kind='student',title='Grupo renal') => ({title,course:'Fisiología renal',ownerUid:uid,ownerName:uid,kind,createdAt:Date.now()-100});
const presence = uid => ({uid,connectionId:'connection-'+uid,displayName:uid,joinedAt:Date.now()-100});
const stroke = uid => ({authorUid:uid,pointsJson:'[[0.1,0.2],[0.5,0.7]]',...(uid==='teacher'?{red:40,green:92,blue:155}:{red:140,green:38,blue:38}),tool:'pen',width:4,createdAt:Date.now()-100});
const db = {}, people = ['teacher','student1','student2','student3','student4','student5','student6','student7','other'];
try {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async context => {
    for(const uid of people) await context.database().ref(`profiles/${uid}`).set(profile(uid,uid==='teacher'?'teacher':'student',uid==='other'?'OTHER':'UPB'));
  });
  for(const uid of people) db[uid] = user(uid);
  // No administrator approval: both registered profiles create directly.
  await assertSucceeds(db.teacher.ref('boardDirectory/UPB/class').set(directory('teacher','teacher','Clase de riñón')));
  await assertSucceeds(db.student1.ref('boardDirectory/UPB/group').set({...directory('student1'),createdAt:{'.sv':'timestamp'}}));
  await assertFails(db.student1.ref('boardDirectory/UPB/old').set({...directory('student1'),createdAt:Date.now()-20000}));
  await assertFails(db.student2.ref('boardDirectory/UPB/forged').set(directory('student2','teacher')));
  await assertFails(db.student2.ref('boardDirectory/UPB/forged-owner').set(directory('student1')));
  await assertFails(user('student2',false).ref('boardDirectory/UPB/unchecked').set(directory('student2')));
  await assertFails(env.unauthenticatedContext().database().ref('boardDirectory/UPB').get());
  await assertFails(db.other.ref('boardDirectory/UPB').get());
  await assertFails(db.student1.ref('boardDirectory/OTHER').get());
  await assertFails(db.student1.ref('boardDirectory/OTHER/wrong').set(directory('student1')));
  await assertSucceeds(db.student2.ref('boardDirectory/UPB').get());
  await assertFails(db.student1.ref('boardDirectory/UPB/group/kind').set('teacher'));
  await assertFails(db.student1.ref('boardDirectory/UPB/group/title').set('Grupo de repaso'));
  // Six users race for five fixed reservations. Transactions and rules arbitrate the final slot.
  const attempts = await Promise.all(people.filter(uid=>uid.startsWith('student')).slice(0,6).map(async uid => {
    for(let i=0;i<5;i++) {
      const target = db[uid].ref(`boardData/UPB/group/slots/s${i}`);
      const disconnect = target.onDisconnect();
      try { await disconnect.set({...presence(uid),leftAt:{'.sv':'timestamp'}}); const result = await target.transaction(current=>current===null||current.leftAt?presence(uid):undefined, undefined, false); if(result.committed) {await disconnect.cancel();return {uid,slot:`s${i}`};} }
      catch(error) { if(!(await target.get()).exists()) throw error; }
      await disconnect.cancel();
    }
    return null;
  }));
  const accepted = attempts.filter(Boolean); assert.equal(accepted.length,5,'Solo cinco reservas simultáneas');
  const outsider = people.filter(uid=>uid.startsWith('student')).slice(0,6).find(uid=>!accepted.some(p=>p.uid===uid));
  await assertFails(db[outsider].ref('boardData/UPB/group/slots/s5').set(presence(outsider)));
  await assertFails(db[outsider].ref('boardData/UPB/group/participants/'+outsider).set(presence(outsider)));
  await assertFails(db[outsider].ref('boardData/UPB/group/strokes/sneak').set(stroke(outsider)));
  await assertFails(db[outsider].ref('boardData/UPB/group/strokes').get());
  await assertFails(db[outsider].ref(`boardData/UPB/group/slots/${accepted[0].slot}`).remove());
  const winner=accepted[0];
  await assertFails(db[winner.uid].ref('boardData/UPB/group/slots').update({s0:presence(winner.uid),s1:presence(winner.uid)}));
  await assertSucceeds(db[winner.uid].ref('boardData/UPB/group/strokes/one').set(stroke(winner.uid)));
  await assertSucceeds(db[accepted[1].uid].ref('boardData/UPB/group/strokes').get());
  await assertFails(db[accepted[1].uid].ref('boardData/UPB/group/strokes/one').remove());
  // Leaving frees the slot while strokes stay stored.
  await assertSucceeds(db[winner.uid].ref(`boardData/UPB/group/slots/${winner.slot}`).update({leftAt:{'.sv':'timestamp'}}));
  await assertSucceeds(db[outsider].ref(`boardData/UPB/group/slots/${winner.slot}`).set(presence(outsider)));
  await assertSucceeds(db[outsider].ref('boardData/UPB/group/strokes/one').get());
  // Class boards accept more than five people and require teacher permission for students to draw.
  for(const [i,uid] of people.filter(uid=>uid!=='other').entries()){await assertSucceeds(db[uid].ref(`boardData/UPB/class/classSlots/c${i}`).set(presence(uid)));await assertSucceeds(db[uid].ref(`boardData/UPB/class/participants/${uid}`).set(presence(uid)));}
  assert.equal((await db.teacher.ref('boardData/UPB/class/participants').get()).numChildren(),8);
  await assertSucceeds(db.teacher.ref('boardData/UPB/class/strokes/teacher').set(stroke('teacher')));
  await assertFails(db.student1.ref('boardData/UPB/class/strokes/no-permission').set(stroke('student1')));
  await assertSucceeds(db.student1.ref('boardData/UPB/class/hands/student1').set(true));
  await assertFails(db.student2.ref('boardData/UPB/class/hands/student1').set(true));
  await assertFails(db.student1.ref('boardData/UPB/class/permissions/student1').set(true));
  await assertSucceeds(db.teacher.ref('boardData/UPB/class/permissions/student1').set(true));
  await assertSucceeds(db.student1.ref('boardData/UPB/class/strokes/permitted').set(stroke('student1')));
  const classModels = 'boardData/UPB/class/models';
  await assertSucceeds(db.teacher.ref(`${classModels}/kidney-cut`).set(true));
  assert.equal((await db.student1.ref(`${classModels}/kidney-cut`).get()).val(), true);
  await assertSucceeds(db.teacher.ref(`${classModels}/kidney-cut`).set(125));
  assert.equal((await db.student1.ref(`${classModels}/kidney-cut`).get()).val(), 125);
  await assertFails(db.student1.ref(`${classModels}/kidney-cut`).set(150));
  await assertFails(db.teacher.ref(`${classModels}/kidney-cut`).set(126));
  await assertFails(db.teacher.ref(`${classModels}/kidney-cut`).set(225));
  await assertFails(db.teacher.ref(`${classModels}/kidney-full`).set(125));
  await assertFails(db.student1.ref(`${classModels}/nephron-85`).set(true));
  await assertFails(db.student1.ref(`${classModels}/kidney-cut`).remove());
  await assertFails(db.teacher.ref(`${classModels}/external-url`).set(true));
  await assertFails(db.teacher.ref(`${classModels}/nephron-85`).set('https://example.com/model.glb'));
  await assertFails(user('teacher', false).ref(`${classModels}/nephron-85`).set(true));
  await assertSucceeds(db.teacher.ref(`${classModels}/kidney-cut`).remove());

  // The student who created the board and other connected participants can manage models.
  await assertSucceeds(db.student1.ref('boardDirectory/UPB/model-group').set(directory('student1')));
  const modelGroup = uid => db[uid].ref('boardData/UPB/model-group');
  await assertSucceeds(modelGroup('student1').child('slots/s0').set(presence('student1')));
  await assertSucceeds(modelGroup('student1').child('models/glomerulus').set(true));
  await assertFails(modelGroup('student2').child('models/nephron-15').set(true));
  await assertSucceeds(modelGroup('student2').child('slots/s2').set(presence('student2')));
  assert.equal((await modelGroup('student2').child('models/glomerulus').get()).val(), true);
  await assertSucceeds(modelGroup('student2').child('models/glomerulus').remove());
  await assertSucceeds(modelGroup('student2').child('models/nephron-15').set(true));
  await assertSucceeds(modelGroup('student2').child('models/nephron-15').set(75));
  await assertFails(modelGroup('teacher').child('models/glomerulus').set(true));
  await assertSucceeds(modelGroup('teacher').child('slots/s1').set(presence('teacher')));
  for (const model of ['kidney-full', 'kidney-cut', 'nephron-15', 'nephron-85', 'glomerulus']) {
    await assertSucceeds(modelGroup('teacher').child(`models/${model}`).set(true));
  }
  assert.equal((await modelGroup('student1').child('models').get()).numChildren(), 5);
  for (const model of ['glomerulus-15', 'glomerulus-85']) {
    await assertFails(modelGroup('student1').child(`models/${model}`).set(true));
    await assertFails(db.teacher.ref(`${classModels}/${model}`).set(true));
  }
  await assertFails(modelGroup('student7').child('models').get());
  await assertSucceeds(modelGroup('teacher').child('slots/s1').update({leftAt:{'.sv':'timestamp'}}));
  await assertFails(modelGroup('teacher').child('models/glomerulus').remove());
  await env.withSecurityRulesDisabled(async ctx => {
    await ctx.database().ref('boardDirectory/UPB/model-group/createdAt').set(Date.now() - 2701000);
  });
  await assertFails(modelGroup('student1').child('models').get());
  await assertFails(modelGroup('teacher').child('models/glomerulus').remove());
  await assertSucceeds(db.student1.ref().update({'boardDirectory/UPB/model-group':null,'boardData/UPB/model-group':null}));
  await assertSucceeds(db.teacher.ref('boardData/UPB/class/permissions/student1').remove());
  await assertFails(db.student1.ref('boardData/UPB/class/strokes/revoked').set(stroke('student1')));
  await assertFails(db.student2.ref('boardData/UPB/class/strokes/impersonation').set(stroke('teacher')));
  await assertFails(db.student1.ref('boardData/UPB/class/strokes').remove());
  await assertSucceeds(db.student1.ref('boardData/UPB/class/messages/one').set({uid:'student1',authorName:'student1',text:'Hola clase',createdAt:Date.now()-100}));
  await assertFails(db.student2.ref('boardData/UPB/class/messages/forged').set({uid:'student1',authorName:'student1',text:'Hola',createdAt:Date.now()-100}));
  await assertFails(db.other.ref('boardData/UPB/class/participants/other').set(presence('other')));
  await assertSucceeds(db.teacher.ref('boardData/UPB/class/strokes').remove());
  // Abrupt disconnect releases only that connection's reservation.
  const disconnected=db[outsider].ref(`boardData/UPB/group/slots/${winner.slot}`);
  await disconnected.onDisconnect().set({...presence(outsider),leftAt:{'.sv':'timestamp'}}); db[outsider].goOffline();
  const observer=db[accepted[1].uid];
  for(let i=0;i<50;i++) { if((await observer.ref(`boardData/UPB/group/slots/${winner.slot}/leftAt`).get()).exists()) break; await new Promise(r=>setTimeout(r,50)); }
  assert.equal((await observer.ref(`boardData/UPB/group/slots/${winner.slot}/leftAt`).get()).exists(),true,'Desconexión libera el cupo y registra la salida');
  db[outsider].goOnline();
  // Custom RGB is validated server-side; the blue family belongs only to the classroom owner.
  await assertSucceeds(db.teacher.ref('boardData/UPB/class/permissions/student1').set(true));
  await assertFails(db.student1.ref('boardData/UPB/class/strokes/blue').set({...stroke('student1'),red:0,green:0,blue:255}));
  await assertFails(db.teacher.ref('boardData/UPB/class/strokes/red-teacher').set({...stroke('teacher'),red:255,green:0,blue:0}));
  await assertSucceeds(db.student1.ref('boardData/UPB/class/strokes/custom').set({...stroke('student1'),red:213,green:91,blue:30,width:27,tool:'highlighter'}));
  await assertSucceeds(db.student1.ref('boardData/UPB/class/live/student1').set(stroke('student1')));
  await assertFails(db.student2.ref('boardData/UPB/class/live/student1').set(stroke('student2')));
  const text={authorUid:'student1',text:'Filtración renal',x:.2,y:.3,fontSize:24,red:130,green:20,blue:35,updatedAt:Date.now()-10};
  await assertSucceeds(db.student1.ref('boardData/UPB/class/texts/test').set(text));
  await assertFails(db.student2.ref('boardData/UPB/class/texts/test').set({...text,authorUid:'student2'}));
  await assertSucceeds(db.teacher.ref('boardData/UPB/class/highlights/test/teacher').set({red:40,green:92,blue:155}));
  await assertFails(db.student1.ref('boardData/UPB/class/highlights/test/student1').set({red:0,green:0,blue:255}));
  await assertSucceeds(db.teacher.ref('boardData/UPB/class/permissions/student1').remove());
  await assertFails(db.student1.ref('boardData/UPB/class/live/student1').set(stroke('student1')));
  await assertSucceeds(db.student1.ref('boardData/UPB/class/live/student1').remove());
  await env.withSecurityRulesDisabled(async ctx=>{await ctx.database().ref('boardDirectory/UPB/group/createdAt').set(Date.now()-2700001);});
  await assertFails(db[accepted[1].uid].ref('boardData/UPB/group/strokes/expired').set(stroke(accepted[1].uid)));
  await assertFails(db[outsider].ref(`boardData/UPB/group/slots/${winner.slot}`).set(presence(outsider)));
  await assertFails(db.student1.ref('boardData/UPB/group/_lifecycle').set({emptySince:Date.now()}));
  await assertFails(db[accepted[1].uid].ref('boardData/UPB/group/strokes').get());
  await assertFails(db.student1.ref('boardDirectory/UPB/group/createdAt').set({'.sv':'timestamp'}));
  const deletion=id=>({[`boardDirectory/UPB/${id}`]:null,[`boardData/UPB/${id}`]:null});
  // Duration is role-bound, immutable, and enforced by server time.
  const longClass = db.teacher.ref('boardDirectory/UPB/long-class');
  await assertFails(longClass.set({...directory('teacher', 'teacher'), durationMinutes: 300}));
  await assertSucceeds(longClass.set({...directory('teacher', 'teacher'), durationMinutes: 240}));
  await assertFails(longClass.child('durationMinutes').set(120));
  await assertFails(longClass.child('durationMinutes').remove());
  const longGroup = db.student1.ref('boardDirectory/UPB/long-group');
  for (const durationMinutes of [0, 1.5, 35, 45, 61, '60']) {
    await assertFails(longGroup.set({...directory('student1'), durationMinutes}));
  }
  for (const durationMinutes of [20, 40]) {
    const id = `group-${durationMinutes}`;
    await assertSucceeds(db.student1.ref(`boardDirectory/UPB/${id}`).set({...directory('student1'), durationMinutes}));
    await assertSucceeds(db.student1.ref().update(deletion(id)));
  }
  assert.equal(boardLifetime({kind:'student', durationMinutes:35}), 35 * 60000);
  assert.equal(boardLifetime({kind:'student'}), 45 * 60000);
  await assertSucceeds(longGroup.set({...directory('student1'), durationMinutes: 60}));
  await env.withSecurityRulesDisabled(async ctx => {
    const database = ctx.database();
    await database.ref('boardDirectory/UPB/long-class/createdAt').set(Date.now() - 61 * 60000);
    await database.ref('boardDirectory/UPB/long-group/createdAt').set(Date.now() - 46 * 60000);
    await database.ref('boardData/UPB/long-group/slots/s0').set(presence('student1'));
  });
  await assertSucceeds(db.teacher.ref('boardData/UPB/long-class/classSlots/c0').set(presence('teacher')));
  await assertSucceeds(db.student1.ref('boardData/UPB/long-group/strokes/a').set(stroke('student1')));
  await assertFails(db.student2.ref().update(deletion('long-class')));
  await assertFails(db.student2.ref().update(deletion('long-group')));
  await env.withSecurityRulesDisabled(async ctx => {
    await ctx.database().ref('boardDirectory/UPB/long-class/createdAt').set(Date.now() - 240 * 60000 - 1000);
    await ctx.database().ref('boardDirectory/UPB/long-group/createdAt').set(Date.now() - 60 * 60000 - 1000);
  });
  await assertFails(db.teacher.ref('boardData/UPB/long-class/classSlots/c1').set(presence('teacher')));
  await assertFails(db.student1.ref('boardData/UPB/long-group/strokes/b').set(stroke('student1')));
  await assertSucceeds(db.student2.ref().update(deletion('long-class')));
  await assertSucceeds(db.student2.ref().update(deletion('long-group')));

  await assertFails(db.student2.ref().update(deletion('class')));
  await assertSucceeds(db.student1.ref('boardDirectory/UPB/owned').set({...directory('student1'),createdAt:{'.sv':'timestamp'}}));
  await assertSucceeds(db.student1.ref('boardData/UPB/owned/slots/s0').set(presence('student1')));
  await assertSucceeds(db.student1.ref('boardData/UPB/owned/strokes/a').set(stroke('student1')));
  await assertFails(db.student2.ref().update(deletion('owned')));
  await assertFails(db.other.ref().update(deletion('group')));
  await assertFails(user('student2',false).ref().update(deletion('group')));
  await assertSucceeds(db.student1.ref().update(deletion('owned')));
  await assertSucceeds(db.student2.ref().update(deletion('group')));
  await env.withSecurityRulesDisabled(async ctx=>{
    const snapshot=await ctx.database().ref().get();
    for(const id of ['owned','group']){
      assert.equal(snapshot.child('boardDirectory/UPB/'+id).exists(),false);
      assert.equal(snapshot.child('boardData/UPB/'+id).exists(),false);
    }
  });
  // A stale cleanup attempt cannot remove a newly created active group.
  await assertSucceeds(db.student1.ref('boardDirectory/UPB/group').set({...directory('student1'),createdAt:{'.sv':'timestamp'}}));
  await assertFails(db.student2.ref().update(deletion('group')));

  // Existing 8 + 42 = 50, even with simultaneous extra arrivals.
  await env.withSecurityRulesDisabled(async ctx=>{
    for(let i=0;i<44;i++)await ctx.database().ref(`profiles/extra${i}`).set(profile(`extra${i}`));
  });
  const joins=await Promise.all(Array.from({length:44},(_,i)=>`extra${i}`).map(async uid=>{
    try{const db=user(uid);for(let i=8;i<50;i++){const target=db.ref('boardData/UPB/class/classSlots/c'+i);const result=await target.transaction(v=>v===null?presence(uid):undefined,undefined,false);if(result.committed){await db.ref('boardData/UPB/class/participants/'+uid).set(presence(uid));return true;}}return false;}catch{return false;}
  }));
  assert.equal(joins.filter(Boolean).length,42);
  assert.equal((await db.teacher.ref('boardData/UPB/class/participants').get()).numChildren(),50);
  await assertFails(db.student1.ref().update(deletion('class')));
  await assertSucceeds(db.teacher.ref().update(deletion('class')));
  await env.withSecurityRulesDisabled(async ctx=>{
    await ctx.database().ref('boardDirectory/UPB/hour').set({...directory('teacher','teacher'),createdAt:Date.now()-3600100});
    await ctx.database().ref('boardData/UPB/hour/participants/teacher').set(presence('teacher'));
  });
  await assertFails(db.teacher.ref('boardData/UPB/hour/strokes').get());
  await assertFails(db.teacher.ref('boardData/UPB/hour/strokes/a').set(stroke('teacher')));
  await assertFails(db.student1.ref('boardData/UPB/hour/participants/student1').set(presence('student1')));
  await assertSucceeds(db.student1.ref().update(deletion('hour')));
  await env.withSecurityRulesDisabled(async ctx=>{
    for(const id of ['idle','recent','active','never'])await ctx.database().ref('boardDirectory/UPB/'+id).set({...directory(id==='active'?'student7':'student1'),createdAt:Date.now()-300000});
    await ctx.database().ref('boardData/UPB/idle/slots/s0').set({...presence('student1'),leftAt:Date.now()-120100});
    await ctx.database().ref('boardData/UPB/recent/slots/s0').set({...presence('student1'),leftAt:Date.now()-1000});
    await ctx.database().ref('boardData/UPB/active/slots/s0').set(presence('student1'));
  });
  await assertFails(db.student2.ref().update(deletion('recent')));
  await assertFails(db.student2.ref().update(deletion('active')));
  await assertFails(db.student1.ref('boardData/UPB/active/slots/s0').remove());
  await assertFails(db.student2.ref('boardData/UPB/active/slots/s0').update({leftAt:{'.sv':'timestamp'}}));
  await assertSucceeds(db.student1.ref('boardData/UPB/active/slots/s0').update({leftAt:{'.sv':'timestamp'}}));
  await assertFails(db.student1.ref('boardData/UPB/active/slots/s0').update({leftAt:Date.now()-200000}));
  await assertFails(db.student2.ref('boardData/UPB/idle/slots/s1').set(presence('student2')));
  await assertSucceeds(db.student2.ref().update(deletion('idle')));
  await assertSucceeds(db.student2.ref().update(deletion('never')));
  await assertSucceeds(db.student2.ref('boardData/UPB/recent/slots/s0').set(presence('student2')));

  // Exercise the actual BoardSession against rules, with only its app/SDK imports injected.
  const sdk=await import('firebase/database');
  const original=fs.readFileSync(new URL('../board-session.js',import.meta.url),'utf8');
  async function client(uid,role){
    globalThis.__boardTest={...sdk,auth:{currentUser:{uid}},database:db[uid]._delegate,withTimeout:p=>p};
    const code=original.replace(/^import .*from '\.\/firebase-client.js';$/m,'const {auth,database,withTimeout,ref,get,set,update,remove,push,onValue,query,limitToLast,runTransaction,onDisconnect,serverTimestamp}=globalThis.__boardTest;')
      .replace(/^import .*from '\.\/vendor\/firebase-sdk.js';$/m,'').replace(/from '(\.\/board-[^']+)'/g, (_, path) => 'from ' + JSON.stringify(new URL('../' + path, import.meta.url).href));
    const {BoardSession}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64')+'#'+uid);
    return new BoardSession(profile(uid,role),()=>{});
  }
  const teacherClient=await client('teacher','teacher'),studentClient=await client('student2','student');
  const classMeta=await teacherClient.create('Clase real','Materia real', 180);
  assert.equal(classMeta.durationMinutes, 180);
  async function ready(session){for(let i=0;i<80 && !session.present && !session.error;i++)await new Promise(r=>setTimeout(r,25));assert.equal(session.error,'');assert.equal(session.present,true);}
  await teacherClient.join(classMeta);await ready(teacherClient);
  await studentClient.join(classMeta);await ready(studentClient);
  const duplicate=await client('student2','student');
  await duplicate.join(classMeta);
  for(let i=0;i<80 && !duplicate.error;i++)await new Promise(r=>setTimeout(r,25));
  assert.match(duplicate.error,/otra pestaña/);await duplicate.leave();
  assert.equal((await db.student2.ref('boardData/UPB/'+classMeta.id+'/participants/student2').get()).exists(),true,'Duplicate tab must not remove original participant');
  await assertFails(db.student2.ref('boardData/UPB/'+classMeta.id+'/classSlots/'+studentClient.classSeat.target.key).remove());
  await studentClient.leave();await teacherClient.leave();
  await env.withSecurityRulesDisabled(async ctx=>{assert.equal((await ctx.database().ref('boardData/UPB/'+classMeta.id+'/classSlots').get()).exists(),false);});
  await teacherClient.deleteBoard(classMeta);
  const groupMeta=await studentClient.create('Grupo real','Materia real');
  assert.equal(groupMeta.durationMinutes, 40);
  await studentClient.join(groupMeta);await ready(studentClient);
  const modelRef=db.student2.ref('boardData/UPB/'+groupMeta.id+'/models/kidney-full');
  await studentClient.shareModel('kidney-full', true);
  assert.equal((await modelRef.get()).val(), true);
  await Promise.all([studentClient.resizeModel('kidney-full', 1), studentClient.resizeModel('kidney-full', 1)]);
  assert.equal((await modelRef.get()).val(), 150);
  await studentClient.shareModel('kidney-full', false);
  await studentClient.resizeModel('kidney-full', 1);
  assert.equal((await modelRef.get()).exists(), false);
  await studentClient.leave();
  let departedSlots;
  await env.withSecurityRulesDisabled(async ctx=>{
    const target=ctx.database().ref('boardData/UPB/'+groupMeta.id+'/slots');departedSlots=(await target.get()).val();
    const key=Object.keys(departedSlots)[0];assert.ok(departedSlots[key].leftAt>0);
    departedSlots[key].leftAt=Date.now()-120100;await target.set(departedSlots);
    await ctx.database().ref('boardDirectory/UPB/'+groupMeta.id+'/createdAt').set(Date.now()-300000);
  });
  await studentClient.cleanExpired([{...groupMeta,createdAt:Date.now()-300000}],new Map([[groupMeta.id,departedSlots]]));
  assert.equal((await db.student2.ref('boardDirectory/UPB/'+groupMeta.id).get()).exists(),false);
  await assertSucceeds(db.student1.ref('boardDirectory/UPB/disconnect').set({...directory('student1'),createdAt:{'.sv':'timestamp'}}));
  const departure=db.student1.ref('boardData/UPB/disconnect/slots/s0');
  await assertSucceeds(departure.onDisconnect().set({...presence('student1'),leftAt:{'.sv':'timestamp'}}));
  await assertSucceeds(departure.set(presence('student1')));
  db.student1.goOffline();
  let leftAt=0;
  for(let i=0;i<40 && !leftAt;i++){
    await new Promise(r=>setTimeout(r,50));
    await env.withSecurityRulesDisabled(async ctx=>{leftAt=(await ctx.database().ref('boardData/UPB/disconnect/slots/s0/leftAt').get()).val();});
  }
  assert.ok(leftAt>0,'Last disconnect stores server departure timestamp');
  // Only this request's emulated records were used.
  console.log('OK: creación directa profesor/estudiante, aislamiento universitario, cinco cupos en carrera, liberación, persistencia, clase con 50 participantes y rechazo del 51, chat, mano, permisos, revocación, caducidad de clase a una hora y de grupo tras dos minutos vacío, borrado por propietario y limpieza atómica de vencidos sin Functions.');
} finally { await env.cleanup(); }
