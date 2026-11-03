import assert from 'node:assert/strict';
import {test} from 'node:test';
import {AccountAnnotationStore, noteId, validStrokes} from '../annotation-store.js';
const stroke = n => [{color: '#8c2626', width: 4, eraser: false, points: [{x: n, y: .4}]}];
const cache = () => { const map = new Map(); return {getItem: k => map.get(k), setItem: (k,v) => map.set(k,v)}; };
const backend = () => ({writes: [], listeners: new Map(), async write(uid, id, doc) { this.writes.push({uid, id, doc}); },
  listen(uid, fn) { this.listeners.set(uid, fn); return () => this.listeners.delete(uid); }});
const pause = () => new Promise(resolve => setImmediate(resolve));

test('Los cambios offline sobreviven al cierre y conservan el UID propietario', async () => {
  const disk = cache(), offline = backend(); offline.write = async () => { throw new Error('offline'); };
  const a = new AccountAnnotationStore(offline, disk); await a.start('alice');
  a.save('library:pdf:book:3', stroke(.2)); await a.flush(); assert.equal(a.pending, 1); a.stop();
  const server = backend(), next = new AccountAnnotationStore(server, disk); await next.start('bob');
  assert.deepEqual(next.keys(), []); assert.equal(server.writes.length, 0);
  next.stop(); await next.start('alice'); await next.flush();
  assert.deepEqual(next.read('library:pdf:book:3'), stroke(.2));
  assert.equal(next.pending, 0); assert.equal(server.writes[0].uid, 'alice'); next.stop();
});
test('La hidratación remota no borra cambios pendientes, sí sustituye cachés limpios', async () => {
  const cloud = backend(), store = new AccountAnnotationStore(cloud, cache()); await store.start('alice');
  store.save('viewer:anatomy:kidney', stroke(.3));
  cloud.listeners.get('alice')({old: {resource: 'viewer:anatomy:kidney', strokesJson: JSON.stringify(stroke(.6))},
    pdf: {resource: 'library:pdf:book:2', strokesJson: JSON.stringify(stroke(.7))}});
  await store.flush(); assert.deepEqual(store.read('viewer:anatomy:kidney'), stroke(.3));
  assert.deepEqual(store.read('library:pdf:book:2'), stroke(.7));
  store.save('library:pdf:book:2', []); await store.flush();
  assert.equal(cloud.writes.at(-1).doc.strokesJson, '[]', 'Borrar se sincroniza como recurso vacío.'); store.stop();
});
test('Una escritura antigua no marca como guardado un trazo más reciente', async () => {
  const cloud = backend(); let resolve;
  cloud.write = () => new Promise(r => { resolve = r; });
  const store = new AccountAnnotationStore(cloud, cache()); await store.start('alice');
  store.save('viewer:filtration', stroke(.1)); const first = store.flush(); await pause();
  store.save('viewer:filtration', stroke(.8)); resolve(); await first;
  assert.equal(store.pending, 1); assert.deepEqual(store.read('viewer:filtration'), stroke(.8)); store.stop();
});
test('Callbacks de una cuenta cerrada no afectan a otra cuenta', async () => {
  const cloud = backend(), store = new AccountAnnotationStore(cloud, cache()); await store.start('alice');
  const late = cloud.listeners.get('alice'); await store.start('bob');
  late({one: {resource: 'viewer:filtration', strokesJson: JSON.stringify(stroke(.9))}});
  assert.deepEqual(store.keys(), []); store.stop();
});
test('Los recursos se separan por modelo, página y momento de video', () => {
  const keys = ['viewer:anatomy:nephron', 'viewer:anatomy:nephron85', 'viewer:glucose:nephron',
    'library:pdf:book:1', 'library:pdf:book:2', 'library:video:abc:20.5', 'library:video:abc:21.5'];
  assert.equal(new Set(keys.map(noteId)).size, keys.length);
  assert.ok(keys.every(k => /^[a-f0-9]+$/.test(noteId(k))));
  assert.ok(validStrokes(stroke(.5))); assert.ok(!validStrokes(stroke(2)));
  assert.ok(!validStrokes([{...stroke(.5)[0], color: 'url(javascript:alert(1))'}]));
});
