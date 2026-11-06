import * as THREE from './vendor/three.module.js';
import { prepareGlomerulusMesh, alignGlomerulusModel } from './glomerulus-structures.js';
import { prepareNephronMesh } from './nephron-structures.js';
import { prepareNephron85Mesh } from './nephron85-structures.js';

// Completar o corregir este mapa cuando el artista entregue la equivalencia
// semántica de los colores de segmentación. El RGB se obtiene del atributo
// COLOR_0 del GLB y el valor se muestra directamente en el panel informativo.
const structureNameByVertexColor = {
  '255,0,0': 'Corteza renal',
  '80,27,17': 'Corteza renal', // Identificador del riñón texturizado.
  '0,255,255': 'Corteza renal', // Superficie del riñón de corte.
  '255,0,255': 'Corteza renal', // Borde de la misma pieza de corte.
  '25,255,118': 'Pirámides renales',
  '0,80,47': 'Pirámides renales',
  '255,37,46': 'Arteria renal',
  '255,0,34': 'Arteria renal',
  '121,16,42': 'Arteria renal',
  '36,51,255': 'Vena renal',
  '3,0,255': 'Vena renal',
  '11,0,184': 'Vena renal',
  '92,255,0': 'Vena renal',
  '0,68,255': 'Cálices menores',
  '70,0,255': 'Cálices mayores',
  '255,175,0': 'Pelvis renal',
  '255,109,16': 'Uréter',
  '255,72,0': 'Uréter',
  '58,255,0': 'Uréter',
  '80,0,0': 'Sistema colector',
  '255,0,231': 'Sistema colector'
};

function setupModel(model) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x = -center.x;
  model.position.y = -center.y;
  model.position.z = -center.z;

  model.traverse((child) => {
    if (child.isMesh) {
      // Los GLB comparten materiales entre meshes con frecuencia. Clonarlos aquí
      // evita que ocultar una pieza cambie accidentalmente otra que usa el mismo material.
      if (child.material) {
        child.material = Array.isArray(child.material)
          ? child.material.map((material) => material.clone())
          : child.material.clone();
        splitVertexColorsIntoMaterialGroups(child);
        forEachMaterial(child, (material) => {
          // COLOR_0 identifica regiones para seleccionar; la textura define su aspecto.
          if (material.map) material.vertexColors = false;
          material.side = THREE.DoubleSide;
          material.transparent = false;
          material.opacity = 1.0;
          material.depthWrite = true;
          material.visible = true;
          material.needsUpdate = true;
        });
      }
      child.visible = true;
    }
  });
}

export function forEachMaterial(mesh, callback) {
  if (!mesh.material) return;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach(callback);
}

function getVertexColorKey(colorAttribute, vertexIndex) {
  // Los GLB de vasos se exportaron con identificadores de color por vértice,
  // pero sin slots de materiales. Cuantizar evita separar caras que comparten
  // visualmente el mismo color por pequeñas diferencias de coma flotante.
  const red = Math.round(colorAttribute.getX(vertexIndex) * 255);
  const green = Math.round(colorAttribute.getY(vertexIndex) * 255);
  const blue = Math.round(colorAttribute.getZ(vertexIndex) * 255);
  return `${red},${green},${blue}`;
}

function getStructureName(colorKey, mesh) {
  // En los archivos vasculares, los colores de los bordes de corte son tapas
  // del mismo vaso. No identifican una vena o un uréter dentro de la arteria.
  for (let node = mesh; node; node = node.parent) {
    if (node.userData.kidneyPart === 'arteria') return 'Arteria renal';
    if (node.userData.kidneyPart === 'vena') return 'Vena renal';
  }
  return structureNameByVertexColor[colorKey] || `Región sin clasificar (${colorKey})`;
}

function splitVertexColorsIntoMaterialGroups(mesh) {
  if (Array.isArray(mesh.material)) return;

  const sourceGeometry = mesh.geometry;
  const colorAttribute = sourceGeometry.getAttribute('color');
  const sourceIndex = sourceGeometry.getIndex();
  if (!colorAttribute || !sourceIndex || sourceIndex.count % 3 !== 0) return;

  const trianglesByColor = new Map();
  for (let offset = 0; offset < sourceIndex.count; offset += 3) {
    const vertexIndex = sourceIndex.getX(offset);
    const colorKey = getVertexColorKey(colorAttribute, vertexIndex);
    if (!trianglesByColor.has(colorKey)) trianglesByColor.set(colorKey, []);
    trianglesByColor.get(colorKey).push(
      vertexIndex,
      sourceIndex.getX(offset + 1),
      sourceIndex.getX(offset + 2)
    );
  }

  // Aunque solo exista una región, conservar su nombre para el raycast.
  if (trianglesByColor.size < 2) {
    const [colorKey] = trianglesByColor.keys();
    mesh.material.name = getStructureName(colorKey, mesh);
    mesh.material.userData.vertexColorKey = colorKey;
    return;
  }

  const geometry = sourceGeometry.clone();
  const orderedIndices = new sourceIndex.array.constructor(sourceIndex.count);
  const materials = [];
  let writeOffset = 0;

  geometry.clearGroups();
  for (const [colorKey, triangleIndices] of trianglesByColor) {
    orderedIndices.set(triangleIndices, writeOffset);
    geometry.addGroup(writeOffset, triangleIndices.length, materials.length);

    const material = mesh.material.clone();
    material.name = getStructureName(colorKey, mesh);
    material.userData.vertexColorKey = colorKey;
    materials.push(material);
    writeOffset += triangleIndices.length;
  }

  geometry.setIndex(new THREE.BufferAttribute(orderedIndices, 1));
  mesh.geometry = geometry;
  mesh.material = materials;
}

const kidneyModelPairs = [
  { id: 'arteria', completo: './Models/Arteria_Completo.glb', corte: './Models/Arteria_Corte.glb' },
  { id: 'caliz', completo: './Models/Caliz_Completo.glb', corte: './Models/Caliz_Corte.glb' },
  { id: 'piramide', completo: './Models/Piramide_Completo.glb', corte: './Models/Piramide_Corte.glb' },
  { id: 'rinon', completo: './Models/Rinon_textu.glb', corte: './Models/Rinon_Corte.glb' },
  { id: 'vena', completo: './Models/Vena_Completo.glb', corte: './Models/Vena_Corte.glb' }
];

function getFirstMesh(root) {
  let mesh = null;
  root.traverse((child) => {
    if (!mesh && child.isMesh) mesh = child;
  });
  return mesh;
}

function alignCompleteVariant(completePart, cutPart) {
  const completeMesh = getFirstMesh(completePart);
  const cutMesh = getFirstMesh(cutPart);
  if (!completeMesh || !cutMesh) return;

  completePart.updateMatrixWorld(true);
  cutPart.updateMatrixWorld(true);
  const completePosition = completeMesh.getWorldPosition(new THREE.Vector3());
  const cutPosition = cutMesh.getWorldPosition(new THREE.Vector3());

  // Las exportaciones completas conservan un origen distinto de sus pares de
  // corte. Esta corrección hace que cada par ocupe la misma referencia.
  completePart.position.add(cutPosition.sub(completePosition));
}

// Alinear las piezas completas con sus equivalentes de corte conserva el atlas.
async function buildKidneyAnatomy(loader) {
  const gltfs = await Promise.all(kidneyModelPairs.flatMap(pair => [
    loader.loadAsync(new URL(pair.completo, import.meta.url).href),
    loader.loadAsync(new URL(pair.corte, import.meta.url).href)
  ]));
  const model = new THREE.Group();
  model.name = 'Riñón';
  kidneyModelPairs.forEach((pair, index) => {
    const completePart = gltfs[index * 2].scene;
    const cutPart = gltfs[index * 2 + 1].scene;
    completePart.userData.variant = 'completo';
    cutPart.userData.variant = 'corte';
    completePart.userData.kidneyPart = pair.id;
    cutPart.userData.kidneyPart = pair.id;
    completePart.name = `${pair.id}_completo`;
    cutPart.name = `${pair.id}_corte`;

    alignCompleteVariant(completePart, cutPart);
    model.add(completePart, cutPart);
  });
  // Se conserva la orientación común de los modelos entregados.
  model.rotation.y = Math.PI;
  setupModel(model);
  return model;
}

async function buildDetailedAnatomy(loader, kind) {
  const nephron = kind === 'nephron';
  const nephron85 = kind === 'nephron85';
  const asset = nephron85 ? './Models/Nefrona_85.glb' : nephron ? './Models/Nefrona_15.glb' : './Models/Glomerulo.glb';
  const [gltf, regions] = await Promise.all([
    loader.loadAsync(new URL(asset, import.meta.url).href),
    nephron85 ? fetch(new URL('./nephron85-regions.json', import.meta.url)).then(response => { if (!response.ok) throw new Error('No se cargaron las regiones de Nefrona 85%.'); return response.json(); }) : null
  ]);
  const model = gltf.scene;
  model.name = nephron85 ? 'Nefrona 85%' : nephron ? 'Nefrona 15%' : 'Glomérulo: anatomía';
  if (nephron) model.rotation.y = -Math.PI / 2;
  else if (!nephron85) { alignGlomerulusModel(model); model.scale.setScalar(.18); }
  model.traverse(node => {
    if (!node.isMesh) return;
    if (nephron85) prepareNephron85Mesh(node, regions);
    else if (nephron) prepareNephronMesh(node);
    else prepareGlomerulusMesh(node, [], { anatomy: true });
  });
  setupModel(model);
  return model;
}

const modelTemplates = new Map();

// El atlas y el tablero comparten geometría y texturas. Cada visor puede
// cambiar la visibilidad de sus propias piezas y materiales.
async function anatomyInstance(kind, build) {
  if (!modelTemplates.has(kind)) {
    modelTemplates.set(kind, build().catch(error => {
      modelTemplates.delete(kind);
      throw error;
    }));
  }
  const model = (await modelTemplates.get(kind)).clone();
  model.traverse(node => {
    if (!node.isMesh) return;
    node.material = Array.isArray(node.material)
      ? node.material.map(material => material.clone())
      : node.material.clone();
  });
  return model;
}

export function loadKidneyAnatomy(loader) {
  return anatomyInstance('kidney', () => buildKidneyAnatomy(loader));
}

export function loadDetailedAnatomyModel(loader, kind) {
  return anatomyInstance(kind, () => buildDetailedAnatomy(loader, kind));
}
