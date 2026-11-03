import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from '../vendor/three.module.js';
import { NEPHRON_STRUCTURES, prepareNephronMesh } from '../nephron-structures.js';
// Los helpers puros usan el Three incluido, sin cargar OrbitControls en Node.
const browserSource = fs.readFileSync(new URL('../anatomy-browser.js', import.meta.url), 'utf8');
const geometryHelpers = browserSource.slice(browserSource.indexOf('function visiblePart('), browserSource.indexOf('export class ModelPreview'));
const { getAvailableAnatomyParts, extractPreview } = new Function('THREE', geometryHelpers.replaceAll('export function', 'function') + '\nreturn { getAvailableAnatomyParts, extractPreview };')(THREE);

function readModel(name) {
  const file = fs.readFileSync(new URL('../Models/' + name, import.meta.url));
  assert.equal(file.toString('ascii', 0, 4), 'glTF');
  const length = file.readUInt32LE(12);
  const json = JSON.parse(file.toString('utf8', 20, 20 + length));
  const binary = file.subarray(28 + length);
  function attribute(id) {
    const accessor = json.accessors[id], view = json.bufferViews[accessor.bufferView];
    const TypedArray = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[accessor.componentType];
    const itemSize = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
    assert.ok(!view.byteStride);
    const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const bytes = binary.subarray(offset, offset + accessor.count * itemSize * TypedArray.BYTES_PER_ELEMENT);
    return new THREE.BufferAttribute(new TypedArray(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), itemSize, !!accessor.normalized);
  }
  return { file, json, binary, primitive: json.meshes[0].primitives[0], attribute };
}
const asset = readModel('Nefrona_15.glb'), reference = readModel('Nefrona_anatomia.glb');
assert.equal(createHash('sha256').update(asset.file).digest('hex'), '5e8eeba122fd586a797491ce3c26bfd5d3e09632cfad0db8f29e3e316700ddbd', 'Conserva exactamente el archivo adjunto.');
assert.deepEqual(asset.attribute(asset.primitive.attributes.POSITION).array, reference.attribute(reference.primitive.attributes.POSITION).array);
assert.deepEqual(asset.attribute(asset.primitive.indices).array, reference.attribute(reference.primitive.indices).array);
assert.deepEqual(asset.attribute(asset.primitive.attributes.COLOR_1).array, reference.attribute(reference.primitive.attributes.COLOR_0).array, 'La segmentación coincide con la guía anterior.');
assert.equal(asset.json.images.length, 3);
for (const image of asset.json.images) {
  assert.equal(image.mimeType, 'image/png');
  const view = asset.json.bufferViews[image.bufferView];
  assert.equal(asset.binary.subarray(view.byteOffset + 1, view.byteOffset + 4).toString(), 'PNG');
}
const sourceGeometry = new THREE.BufferGeometry();
for (const [semantic, name] of Object.entries({ POSITION: 'position', NORMAL: 'normal', TEXCOORD_0: 'uv', COLOR_0: 'color', COLOR_1: 'color_1' })) {
  sourceGeometry.setAttribute(name, asset.attribute(asset.primitive.attributes[semantic]));
}
sourceGeometry.setIndex(asset.attribute(asset.primitive.indices));
const sourceIndices = [...sourceGeometry.index.array];
const map = new THREE.Texture(), normalMap = new THREE.Texture(), metalRough = new THREE.Texture();
const original = new THREE.MeshStandardMaterial({ color: '#f0d0b0', map, normalMap,
  roughnessMap: metalRough, metalnessMap: metalRough, roughness: .37, metalness: .81, vertexColors: true });
const mesh = new THREE.Mesh(sourceGeometry, original);
prepareNephronMesh(mesh);
assert.equal(mesh.geometry.index.count / 3, 31116);
assert.equal(mesh.material.length, 11);
assert.deepEqual([...sourceGeometry.index.array], sourceIndices);
for (const name of ['position', 'normal', 'uv', 'color', 'color_1']) {
  assert.deepEqual(mesh.geometry.getAttribute(name).array, sourceGeometry.getAttribute(name).array);
}
function faces(indices) {
  const result = [];
  for (let i = 0; i < indices.length; i += 3) result.push(indices.slice(i, i + 3).join(','));
  return result.sort();
}
assert.deepEqual(faces([...mesh.geometry.index.array]), faces(sourceIndices));
assert.equal(original.color.getHexString(), 'f0d0b0');
assert.equal(original.vertexColors, true, 'No modifica el material fuente.');
for (const material of mesh.material) {
  assert.notEqual(material, original);
  assert.equal(material.map, map); assert.equal(material.normalMap, normalMap);
  assert.equal(material.metalnessMap, metalRough); assert.equal(material.roughnessMap, metalRough);
  assert.equal(material.roughness, .37); assert.equal(material.metalness, .81);
  assert.equal(material.color.getHexString(), 'ffffff'); assert.equal(material.vertexColors, false);
}
const identifiers = sourceGeometry.getAttribute('color_1');
for (const group of mesh.geometry.groups) {
  const material = mesh.material[group.materialIndex];
  for (let i = group.start; i < group.start + group.count; i++) {
    const v = mesh.geometry.index.getX(i);
    assert.equal([identifiers.getX(v), identifiers.getY(v), identifiers.getZ(v)].map(x => Math.round(x * 255)).join(','), material.userData.vertexColorKey);
  }
}
const model = new THREE.Group(); model.add(mesh);
const available = getAvailableAnatomyParts(model, NEPHRON_STRUCTURES);
assert.deepEqual(available.map(part => part.name), ['Arteriola aferente', 'Glomérulo', 'Cápsula de Bowman', 'Arteriola eferente', 'Túbulo proximal', 'Asa de Henle', 'Túbulo contorneado distal', 'Conductos colectores']);
for (const part of available) {
  assert.ok(part.description && part.function);
  const preview = extractPreview(model, part.name);
  assert.ok(preview.children.length > 0);
  const box = new THREE.Box3().setFromObject(preview), size = box.getSize(new THREE.Vector3());
  assert.ok([size.x, size.y, size.z].every(Number.isFinite)); assert.ok(size.length() > 0);
  for (const child of preview.children) {
    assert.equal(child.material.name, part.name); assert.equal(child.material.map, map);
    assert.ok(child.geometry.getAttribute('uv')); assert.equal(child.material.visible, true);
  }
}
console.log('OK: Nefrona 15% exacta, 31.116 caras, segmentación COLOR_1, tres texturas PBR y UV conservadas, materiales independientes y ocho estructuras confirmadas con vistas previas; regiones sin identificar excluidas.');
