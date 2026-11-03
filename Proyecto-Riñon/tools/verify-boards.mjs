import fs from 'node:fs';
import assert from 'node:assert/strict';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
for (const key of ['HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy']) delete process.env[key];
const env = await initializeTestEnvironment({projectId:'demo-risio',database:{host:'127.0.0.1',port:9000,rules:fs.readFileSync(new URL('../../database.rules.json',import.meta.url),'utf8')}});
const user = (uid, verified = true) => env.authenticatedContext(uid,{email_verified:verified}).database();
const profile = (uid,role='student',university='UPB') => ({displayName:uid,university,requestedRole:role,...(role==='student'?{semester:3}:{}),createdAt:Date.now()-100,updatedAt:Date.now()-100});
const directory = (uid,kind='student',title='Grupo renal') => ({title,course:'Fisiología renal',ownerUid:uid,ownerName:uid,kind,createdAt:Date.now()-100});
const presence = uid => ({uid,connectionId:'connection-'+uid,displayName:uid,joinedAt:Date.now()-100});
const stroke = uid => ({authorUid:uid,pointsJson:'[[0.1,0.2],[0.5,0.7]]',color:'#8c2626',width:4,createdAt:Date.now()-100});
const db = {}, people = ['teacher','student1','student2','student3','student4','student5','student6','student7','other'];
try {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async context => {
    for(const uid of people) await context.database().ref(`profiles/${uid}`).set(profile(uid,uid==='teacher'?'teacher':'student',uid==='other'?'OTHER':'UPB'));
  });
  for(const uid of people) db[uid] = user(uid);
  // No administrator approval: both registered profiles create directly.
  await assertSucceeds(db.teacher.ref('boardDirectory/UPB/class').set(directory('teacher','teacher','Clase de riñón')));
  await assertSucceeds(db.student1.ref('boardDirectory/UPB/group').set(directory('student1')));
  await assertFails(db.student2.ref('boardDirectory/UPB/forged').set(directory('student2','teacher')));
  await assertFails(db.student2.ref('boardDirectory/UPB/forged-owner').set(directory('student1')));
  await assertFails(user('student2',false).ref('boardDirectory/UPB/unchecked').set(directory('student2')));
  await assertFails(env.unauthenticatedContext().database().ref('boardDirectory/UPB').get());
  await assertFails(db.other.ref('boardDirectory/UPB').get());
  await assertFails(db.student1.ref('boardDirectory/OTHER').get());
  await assertFails(db.student1.ref('boardDirectory/OTHER/wrong').set(directory('student1')));
  await assertSucceeds(db.student2.ref('boardDirectory/UPB').get());
  await assertFails(db.student1.ref('boardDirectory/UPB/group/kind').set('teacher'));
  await assertSucceeds(db.student1.ref('boardDirectory/UPB/group/title').set('Grupo de repaso'));
  // Six users race for five fixed reservations. Transactions and rules arbitrate the final slot.
  const attempts = await Promise.all(people.filter(uid=>uid.startsWith('student')).slice(0,6).map(async uid => {
    for(let i=0;i<5;i++) {
      const target = db[uid].ref(`boardData/UPB/group/slots/s${i}`);
      const disconnect = target.onDisconnect();
      try { await disconnect.remove(); const result = await target.transaction(current=>current===null?presence(uid):undefined, undefined, false); if(result.committed) {await disconnect.cancel();return {uid,slot:`s${i}`};} }
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
  await assertSucceeds(db[winner.uid].ref(`boardData/UPB/group/slots/${winner.slot}`).remove());
  await assertSucceeds(db[outsider].ref(`boardData/UPB/group/slots/${winner.slot}`).set(presence(outsider)));
  await assertSucceeds(db[outsider].ref('boardData/UPB/group/strokes/one').get());
  // Class boards accept more than five people and require teacher permission for students to draw.
  for(const uid of people.filter(uid=>uid!=='other')) await assertSucceeds(db[uid].ref(`boardData/UPB/class/participants/${uid}`).set(presence(uid)));
  assert.equal((await db.teacher.ref('boardData/UPB/class/participants').get()).numChildren(),8);
  await assertSucceeds(db.teacher.ref('boardData/UPB/class/strokes/teacher').set(stroke('teacher')));
  await assertFails(db.student1.ref('boardData/UPB/class/strokes/no-permission').set(stroke('student1')));
  await assertSucceeds(db.student1.ref('boardData/UPB/class/hands/student1').set(true));
  await assertFails(db.student2.ref('boardData/UPB/class/hands/student1').set(true));
  await assertFails(db.student1.ref('boardData/UPB/class/permissions/student1').set(true));
  await assertSucceeds(db.teacher.ref('boardData/UPB/class/permissions/student1').set(true));
  await assertSucceeds(db.student1.ref('boardData/UPB/class/strokes/permitted').set(stroke('student1')));
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
  await disconnected.onDisconnect().remove(); db[outsider].goOffline();
  const observer=db[accepted[1].uid];
  for(let i=0;i<50;i++) { if(!(await observer.ref(`boardData/UPB/group/slots/${winner.slot}`).get()).exists()) break; await new Promise(r=>setTimeout(r,50)); }
  assert.equal((await observer.ref(`boardData/UPB/group/slots/${winner.slot}`).get()).exists(),false,'Desconexión libera el cupo');
  db[outsider].goOnline();
  // Only this request's emulated records were used.
  console.log('OK: creación directa profesor/estudiante, aislamiento universitario, cinco cupos en carrera, liberación, persistencia, clase con ocho participantes, chat, mano, permisos y revocación.');
  if(process.env.RISIO_BOARDS_BROWSER_TEST) await import('./verify-boards-browser.mjs');
} finally { await env.cleanup(); }
