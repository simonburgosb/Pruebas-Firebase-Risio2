import fs from 'node:fs';
import assert from 'node:assert/strict';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
// El SDK Node de RTDB ignora NO_PROXY; las conexiones son solo a emuladores locales.
for (const key of ['HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy']) delete process.env[key];
const env = await initializeTestEnvironment({projectId: 'demo-risio',
  database: {host: '127.0.0.1', port: 9000, rules: fs.readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8')},
  storage: {host: '127.0.0.1', port: 9199, rules: fs.readFileSync(new URL('../../storage.rules', import.meta.url), 'utf8')}});
const alice = env.authenticatedContext('alice', {email_verified: true}), bob = env.authenticatedContext('bob', {email_verified: true});
const unverified = env.authenticatedContext('unverified', {email_verified: false}), guest = env.unauthenticatedContext();
const profile = {displayName: 'Estudiante de prueba', university: 'UPB', requestedRole: 'student', semester: 3, createdAt: Date.now() - 100, updatedAt: Date.now() - 100};
const note = {resource: 'viewer:anatomy:kidney', strokesJson: '[]', updatedAt: Date.now() - 100};
try {
  await env.clearDatabase(); await env.clearStorage();
  for (const user of [alice,bob]) await assertSucceeds(user.database().ref(`profiles/${user === alice ? 'alice' : 'bob'}`).set(profile));
  await assertSucceeds(unverified.database().ref('profiles/unverified').set(profile));
  await assertFails(guest.database().ref('profiles/guest').set(profile));
  await assertFails(bob.database().ref('profiles/alice').get());
  await assertFails(alice.database().ref('profiles').get());
  await assertFails(alice.database().ref('profiles/alice/role').set('admin'));
  await assertFails(alice.database().ref('profiles/alice/semester').set(2.5));
  await assertFails(alice.database().ref('profiles/alice/semester').set(null));
  await assertFails(alice.database().ref('profiles/alice/university').set('Otra'));
  await assertSucceeds(alice.database().ref('annotations/alice/one').set(note));
  await assertSucceeds(alice.database().ref('annotations/alice').get());
  await assertFails(bob.database().ref('annotations/alice').get());
  await assertFails(bob.database().ref('annotations/alice/one').set(note));
  await assertFails(unverified.database().ref('annotations/unverified/one').set(note));
  await assertFails(unverified.database().ref('annotations/unverified').get());
  await assertFails(guest.database().ref('annotations/alice').get());
  await assertFails(alice.database().ref('annotations/alice/one').update({extra: 'bad'}));
  await assertFails(alice.database().ref('teacherApprovals/alice').set(true));
  await assertSucceeds(bob.database().ref('profiles/bob').set({...profile, requestedRole:'teacher', semester:null}));
  await assertFails(bob.database().ref('teacherApprovals/bob').set(true));
  await assertSucceeds(alice.storage().ref('private/alice/test').putString('Hello', 'raw', {contentType: 'text/plain'}));
  await assertFails(bob.storage().ref('private/alice/test').getMetadata());
  await assertFails(unverified.storage().ref('private/unverified/test').putString('Hello', 'raw', {contentType:'text/plain'}));
  await assertFails(alice.storage().ref('private/alice/exe').putString('bad', 'raw', {contentType:'application/x-msdownload'}));
  await assertFails(bob.storage().ref('private/alice/test').delete());
  console.log('OK: 26 comprobaciones de reglas; notas privadas, correo verificado, perfiles y permisos docentes protegidos, adjuntos privados.');
  if (process.env.RISIO_BROWSER_TEST) await import('./verify-auth-browser.mjs');
} finally { await env.cleanup(); }
