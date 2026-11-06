import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { ANATOMY_MODELS, getAvailableAnatomyParts } from './anatomy-browser.js';
import { forEachMaterial, loadKidneyAnatomy, loadDetailedAnatomyModel } from './anatomy-models.js';
import { BOARD_MODELS } from './board-model-catalog.js';

const loader = new GLTFLoader();
// Fixed positions in paper coordinates keep ink aligned for every participant.
const slots = Object.keys(BOARD_MODELS);

function makeModelView(layer, id, sizePercent, redraw, inspect, choose) {
  const entry = BOARD_MODELS[id];
  const cell = slots.indexOf(id);
  const slot = { x: .025 + (cell % 3) * .325, y: .035 + Math.floor(cell / 3) * .485, w: .30, h: .45 };
  let rect, percent, needsFrame = true;
  const region = document.createElement('div');
  region.className = 'board-model-hit';
  region.dataset.modelId = id;
  region.tabIndex = 0;
  region.setAttribute('role', 'group');
  region.setAttribute('aria-label', `${entry.label}. Usa las flechas para recorrer las estructuras y Escape para restablecer.`);
  function placeRegion(x, y, w, h) {
    Object.assign(region.style, { left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` });
  }
  function setSize(value) {
    if (percent === value) return;
    percent = value;
    const scale = value / 100, w = slot.w * scale, h = slot.h * scale;
    rect = {
      x: THREE.MathUtils.clamp(slot.x + (slot.w - w) / 2, .01, .99 - w),
      y: THREE.MathUtils.clamp(slot.y + (slot.h - h) / 2, .01, .99 - h),
      w, h
    };
    placeRegion(rect.x, rect.y, w, h);
    needsFrame = true;
    redraw();
  }
  setSize(sizePercent);
  const status = document.createElement('span');
  status.className = 'board-model-load';
  status.setAttribute('role', 'status');
  status.textContent = 'Cargando modelo…';
  region.append(status);
  layer.append(region);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, .01, 1000);
  const controls = new OrbitControls(camera, region);
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  controls.enablePan = false;
  const light = new THREE.DirectionalLight(0xffffff, 2);
  light.position.set(3, 5, 8);
  const fill = new THREE.DirectionalLight(0xffffff, .65);
  fill.position.set(-5, -3, -4);
  scene.add(new THREE.AmbientLight(0xffffff, 1.45), light, fill);
  controls.addEventListener('change', redraw);

  const events = new AbortController(), { signal } = events;
  const bounds = new THREE.Box3(), ray = new THREE.Raycaster(), position = new THREE.Vector2();
  const placement = new THREE.Matrix4(), corner = new THREE.Vector3();
  const pointers = new Set(), meshes = [], parts = new Map();
  let model, selected, press, hoverFrame, loading = false;

  function frame(resetOrientation = false) {
    if (bounds.isEmpty()) return;
    const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    // La cara abierta del corte renal apunta hacia +X en la escena del atlas.
    const kidney = entry.anatomy === 'kidney';
    const horizontal = kidney ? size.z : size.x;
    const depth = kidney ? size.x : size.z;
    const distance = Math.max(size.y, horizontal / camera.aspect) * .59 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) + depth / 2;
    camera.near = Math.max(distance / 1000, .000001);
    camera.far = distance * 30;
    camera.updateProjectionMatrix();
    // Place the camera's nominal frame on the sheet, while keeping the entire
    // sheet in the frustum. Geometry can extend outside its old slot.
    placement.set(
      rect.w, 0, 0, 2 * rect.x + rect.w - 1,
      0, rect.h, 0, 1 - 2 * rect.y - rect.h,
      0, 0, 1, 0,
      0, 0, 0, 1
    );
    camera.projectionMatrix.premultiply(placement);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    controls.minDistance = Math.max(distance * .30, size.length() * .40);
    controls.maxDistance = distance * 6;
    const direction = resetOrientation ? new THREE.Vector3(kidney ? 1 : 0, 0, kidney ? 0 : 1)
      : camera.position.clone().sub(controls.target).normalize();
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(direction, distance);
    controls.update();
    redraw();
  }

  function setSelection(part) {
    selected = part;
    for (const mesh of meshes) forEachMaterial(mesh, material => {
      const dim = Boolean(part && material.name !== part.name);
      if (material.transparent !== dim) material.needsUpdate = true;
      material.opacity = dim ? .15 : 1;
      material.transparent = dim;
      material.depthWrite = !dim;
    });
    redraw();
  }

  function pick(x, y) {
    const box = layer.getBoundingClientRect();
    if (!box.width || !box.height || x < box.left || x > box.right || y < box.top || y > box.bottom) return;
    position.set((x - box.left) / box.width * 2 - 1, 1 - (y - box.top) / box.height * 2);
    ray.setFromCamera(position, camera);
    let nearest;
    for (const { object, face } of ray.intersectObjects(meshes, false)) {
      const material = Array.isArray(object.material) ? object.material[face.materialIndex] : object.material;
      const part = parts.get(material.name);
      if (part && part === selected) return part;
      if (part && !nearest) nearest = part;
    }
    return nearest;
  }

  function fitHitRegion() {
    // Match the pointer target to the visible model as it rotates or zooms.
    // Keep a minimum target around the nominal frame for narrow structures.
    let left = rect.x, top = rect.y, right = rect.x + rect.w, bottom = rect.y + rect.h;
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          corner.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
          if (corner.z >= -camera.near) {
            placeRegion(0, 0, 1, 1);
            return;
          }
          corner.applyMatrix4(camera.projectionMatrix);
          const u = (corner.x + 1) / 2, v = (1 - corner.y) / 2;
          left = Math.min(left, u); right = Math.max(right, u);
          top = Math.min(top, v); bottom = Math.max(bottom, v);
        }
      }
    }
    left = Math.max(0, left); top = Math.max(0, top);
    right = Math.min(1, right); bottom = Math.min(1, bottom);
    placeRegion(left, top, right - left, bottom - top);
  }

  function showHover(part) {
    region.classList.toggle('board-model-over-part', Boolean(part));
    inspect(view, part);
  }
  function cancelHover() {
    cancelAnimationFrame(hoverFrame);
    showHover(null);
  }

  region.addEventListener('pointerdown', event => {
    pointers.add(event.pointerId);
    press = pointers.size === 1 && event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
    cancelHover();
  }, { signal });
  region.addEventListener('pointermove', event => {
    if (pointers.size) {
      if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 7) press = null;
      return;
    }
    if (event.pointerType !== 'mouse' || !model) return;
    cancelAnimationFrame(hoverFrame);
    hoverFrame = requestAnimationFrame(() => showHover(pick(event.clientX, event.clientY)));
  }, { signal });
  region.addEventListener('pointerup', event => {
    if (pointers.delete(event.pointerId) && press && model) choose(view, pick(event.clientX, event.clientY));
    press = null;
  }, { signal });
  const cancelPointer = event => { pointers.delete(event.pointerId); press = null; cancelHover(); };
  region.addEventListener('pointercancel', cancelPointer, { signal });
  region.addEventListener('lostpointercapture', cancelPointer, { signal });
  region.addEventListener('pointerleave', cancelHover, { signal });
  region.addEventListener('wheel', cancelHover, { signal, passive: true });
  region.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      choose(view, null);
      frame(true);
    } else if (parts.size && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      const options = [...parts.values()];
      const step = event.key === 'ArrowRight' ? 1 : -1;
      const current = selected ? options.indexOf(selected) : step === 1 ? -1 : 0;
      choose(view, options[(current + step + options.length) % options.length]);
    }
  }, { signal });

  function release() {
    if (!model) return;
    model.traverse(node => { if (node.isMesh) forEachMaterial(node, material => material.dispose()); });
    scene.remove(model);
    model = null;
    meshes.length = 0;
    parts.clear();
    bounds.makeEmpty();
  }

  async function load() {
    loading = true;
    status.textContent = 'Cargando modelo…';
    try {
      model = await (entry.variant ? loadKidneyAnatomy(loader) : loadDetailedAnatomyModel(loader, entry.anatomy));
      if (signal.aborted) { release(); return; }
      if (entry.variant) for (const part of model.children) part.visible = part.userData.variant === entry.variant;
      model.updateMatrixWorld(true);
      model.traverseVisible(mesh => {
        if (!mesh.isMesh) return;
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
        meshes.push(mesh);
      });
      if (!meshes.length) throw new Error('El modelo no contiene regiones visibles.');
      for (const part of getAvailableAnatomyParts(model, ANATOMY_MODELS[entry.anatomy].parts)) parts.set(part.name, part);
      scene.add(model);
      frame(true);
      status.hidden = true;
    } catch (error) {
      if (signal.aborted) return;
      console.error('Error al cargar el modelo del tablero:', error);
      release();
      status.textContent = error.response?.status === 404
        ? 'Falta un archivo del modelo. Comprueba la carpeta Models.'
        : 'No se cargó el modelo. Pulsa su nombre en la barra para reintentar.';
    } finally {
      loading = false;
    }
  }

  const view = {
    render(renderer, width, height) {
      const w = rect.w * width, h = rect.h * height;
      if (needsFrame || camera.aspect !== w / h) {
        needsFrame = false;
        camera.aspect = w / h;
        frame();
      }
      if (!model) return;
      renderer.clearDepth();
      renderer.render(scene, camera);
      fitHitRegion();
    },
    setSize,
    setSelection,
    cancelHover,
    focus() {
      region.focus({ preventScroll: true });
      region.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      if (!model && !loading) load();
      else if (model) frame(true);
    },
    dispose() {
      events.abort();
      cancelHover();
      controls.dispose();
      release();
      region.remove();
    }
  };
  load();
  return view;
}

export function mountBoardModels(layer, info) {
  const canvas = document.createElement('canvas');
  canvas.className = 'board-model-webgl';
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.autoClear = false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  layer.prepend(canvas);

  const views = new Map();
  let selection, hover, shownPart, frameId, width = 0, height = 0;

  function render() {
    if (!width || !height) return;
    renderer.setViewport(0, 0, width, height);
    renderer.clear();
    for (const view of views.values()) view.render(renderer, width, height);
  }
  function redraw() {
    if (frameId !== undefined) return;
    frameId = requestAnimationFrame(() => { frameId = undefined; render(); });
  }
  function updateInfo() {
    const part = (hover || selection)?.part;
    if (part === shownPart) return;
    shownPart = part;
    info.hidden = !part;
    if (!part) return;
    info.querySelector('strong').textContent = part.name;
    info.querySelector('span').textContent = part.description;
  }
  function inspect(view, part) {
    if (part) hover = { view, part };
    else if (hover?.view === view) hover = null;
    updateInfo();
  }
  function choose(view, part) {
    const same = selection?.view === view && selection.part === part;
    selection?.view.setSelection(null);
    selection = part && !same ? { view, part } : null;
    selection?.view.setSelection(part);
    hover = null;
    updateInfo();
  }

  const resize = new ResizeObserver(() => {
    width = layer.clientWidth;
    height = layer.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    redraw();
  });
  resize.observe(layer);
  return {
    sync(models) {
      for (const [id, view] of views) {
        if (models.has(id)) continue;
        if (selection?.view === view) selection = null;
        view.dispose();
        views.delete(id);
      }
      for (const [id, size] of models) {
        if (views.has(id)) views.get(id).setSize(size);
        else views.set(id, makeModelView(layer, id, size, redraw, inspect, choose));
      }
      updateInfo();
      redraw();
    },
    focus(id) {
      const view = views.get(id);
      if (!view) return;
      views.delete(id);
      views.set(id, view);
      layer.append(layer.querySelector(`[data-model-id="${id}"]`));
      view.focus();
      redraw();
    },
    stopHover() { for (const view of views.values()) view.cancelHover(); },
    drawTo(context) {
      if (!width || !height) return;
      render();
      context.drawImage(canvas, 0, 0, context.canvas.width, context.canvas.height);
    },
    dispose() {
      resize.disconnect();
      for (const view of views.values()) view.dispose();
      cancelAnimationFrame(frameId);
      info.hidden = true;
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    }
  };
}
