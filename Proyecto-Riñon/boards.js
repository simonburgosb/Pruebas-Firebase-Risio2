import {InkGestures} from './ink-gestures.js';
import {darkMode, readableInk} from './theme.js';
import {auth, database} from './firebase-client.js';
import {ref, onValue} from './vendor/firebase-sdk.js';
import {hydrateIcons, iconMarkup} from './icons.js';
import {BOARD_MODELS, MIN_MODEL_SIZE, MAX_MODEL_SIZE, boardModelSize} from './board-model-catalog.js';
import {BoardSession} from './board-session.js';
import {selectBoards, parseStroke, rgb, inkColor, isBlue, TEACHER_BLUE, CLASS_DURATION_MINUTES, STUDENT_DURATION_MINUTES, defaultBoardMinutes, boardLimit, boardLifetime, boardExpired, activePeople} from './board-utils.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = name => `<span data-icon="${name}" aria-hidden="true"></span>`;
const shell = document.createElement('section'); shell.id = 'boards-page'; shell.className = 'boards-page'; shell.setAttribute('aria-label','Tableros de Risio');
shell.innerHTML = `
  <header class="boards-top"><button class="board-button board-back" id="boards-home" type="button">${icon('left')} Volver al inicio</button><div class="boards-brand"><img src="./assets/brand/ricio-logo.png" alt="" width="22" height="30">Risio <span>· UPB</span></div></header>
  <div id="boards-catalog" class="boards-catalog">
    <div class="boards-heading"><div><p class="board-eyebrow">APRENDEMOS JUNTOS</p><h1 id="boards-title" tabindex="-1">Un espacio para compartir ideas.</h1><p>Encuentra tu clase o reúne a tu grupo de estudio en un tablero.</p></div><button id="boards-create" type="button" class="board-button board-primary">${icon('plus')} Crear tablero</button></div>
    <div class="boards-university">${icon('users')} Universidad Pontificia Bolivariana <span>Solo tableros de tu universidad</span></div>
    <p id="boards-directory-status" role="status" aria-live="polite">Cargando tableros…</p>
    <div class="boards-sections">${['teacher','student'].map(kind => `
      <section class="board-catalog-section" data-board-kind="${kind}" aria-labelledby="${kind}-boards-heading">
        <div class="board-section-title"><div class="board-section-icon">${icon(kind === 'teacher' ? 'board' : 'users')}</div><div><h2 id="${kind}-boards-heading">${kind === 'teacher' ? 'Clases de profesores' : 'Grupos de estudiantes'}</h2><p>${kind === 'teacher' ? 'Una clase, todas las ideas. Sin límite de participantes fijado por Risio.' : 'Estudia en equipo con hasta 5 personas conectadas, incluido el creador.'}</p></div><span class="board-total" data-board-total="${kind}">0</span></div>
        <div class="board-filters"><label class="board-search">${icon('search')}<input type="search" data-board-search="${kind}" aria-label="Buscar ${kind === 'teacher' ? 'clases de profesores' : 'grupos de estudiantes'}" placeholder="Buscar por título, materia o creador"></label><label class="board-select"><span>Mostrar</span><select data-board-filter="${kind}" aria-label="Filtrar ${kind === 'teacher' ? 'clases' : 'grupos'}"><option value="all">Todos</option><option value="mine">Mis tableros</option><option value="online">Con personas conectadas</option>${kind === 'student' ? '<option value="available">Con cupos disponibles</option>' : ''}</select></label><label class="board-select"><span>Ordenar</span><select data-board-sort="${kind}" aria-label="Ordenar ${kind === 'teacher' ? 'clases' : 'grupos'}"><option value="new">Recién creados</option><option value="old">Más antiguos</option><option value="az">Título A–Z</option></select></label></div>
        <div class="board-grid" data-board-grid="${kind}"></div><button type="button" class="board-button board-more" data-board-more="${kind}" hidden>Ver más tableros</button>
      </section>`).join('')}
    </div>
  </div>
  <section id="board-room" class="board-room" aria-labelledby="board-room-title" hidden>
    <header class="board-room-header"><div><button id="board-back-list" type="button" class="board-text-button">${icon('left')} Todos los tableros</button><h1 id="board-room-title" tabindex="-1"></h1><p id="board-room-subtitle"></p></div><div class="board-room-actions"><span id="board-save-state" role="status" aria-live="polite"></span><button id="board-delete" class="board-button" type="button" hidden>${icon('trash')} Borrar tablero</button><button id="board-wide" class="board-button" type="button" aria-pressed="false">Vista amplia</button><button id="board-export" class="board-button" type="button">${icon('save')} Descargar PNG</button></div></header>
    <div id="board-hand-alerts" class="board-hand-alerts" role="status" aria-live="polite" hidden></div><p id="board-lifetime" class="board-lifetime" hidden></p>
    <p id="board-room-error" role="alert" hidden></p>
    <div class="board-workspace"><div class="board-drawing-area">
      <section id="board-models" class="board-models" aria-labelledby="board-models-heading" hidden>
        <div class="board-models-header">
          <div><h2 id="board-models-heading">${icon('kidney')} Anatomía 3D</h2><p id="board-models-help">Abre un modelo para explorar sus estructuras.</p></div>
          <form id="board-model-form" hidden>
            <label class="sr-board-only" for="board-model-picker">Modelo anatómico para compartir</label>
            <select id="board-model-picker" required></select>
            <button class="board-button board-primary" type="submit">${icon('plus')} Agregar</button>
          </form>
          <button id="board-model-ink" class="board-button" type="button" aria-pressed="false" hidden>${icon('pencil')} Anotar sobre 3D</button>
        </div>
        <ul id="board-model-list"></ul>
      </section>
      <div class="board-toolbar" role="toolbar" aria-label="Herramientas del tablero">
        <div class="board-tool-switch"><button class="board-button" data-board-tool="pen" aria-pressed="true" type="button">${icon('pencil')} Lápiz</button><button class="board-button" data-board-tool="highlighter" aria-pressed="false" type="button">${icon('highlight')} Resaltador</button><button class="board-button" data-board-tool="text" aria-pressed="false" type="button">${icon('text')} Texto</button></div>
        <div class="board-colors" aria-label="Colores">${[['#8c2626','Rojo oscuro'],['#302b28','Negro'],['#e57232','Naranja'],['#c99512','Amarillo'],['#23756a','Verde azulado'],['#3b8a39','Verde'],['#a23b72','Rosa'],['#285c9b','Azul']].map(([color,name],i)=>`<button type="button" data-board-color="${color}" aria-label="${name}" title="${name}" aria-pressed="${i===0}" style="--ink:${color}"></button>`).join('')}<label class="board-custom-color">Otro color<input id="board-color" type="color" value="#8c2626" aria-label="Elegir cualquier color"></label></div>
        <span id="board-color-help" class="board-color-help"></span>
        <label class="board-width">Grosor <input id="board-width" type="range" min="1" max="30" value="4" aria-label="Grosor de línea"><output id="board-width-value">4</output></label>
        <button id="board-undo" class="board-button" type="button">${icon('undo')} Deshacer</button><button id="board-clear" class="board-button" type="button" hidden>${icon('trash')} Vaciar</button>
      </div>
      <div class="board-paper-wrapper">
        <section id="board-text-dialog" class="board-text-editor" role="region" aria-label="Editar texto en el tablero" hidden><form id="board-text-form"><div class="board-text-editor-heading"><strong>Caja de texto</strong><span>Escribe directamente aquí</span></div><label>Texto<textarea id="board-text-value" maxlength="2000" rows="4" required placeholder="Escribe una idea para el tablero…"></textarea></label><label>Tamaño <input id="board-text-size" type="range" min="14" max="48" value="24"></label><p id="board-text-error" role="alert" hidden></p><div class="board-room-actions"><button id="board-text-cancel" type="button" class="board-button">Cancelar</button><button type="submit" class="board-button board-primary">Guardar texto</button></div></form></section>
        <div id="board-sheet">
          <div id="board-model-layer" hidden></div>
          <canvas id="board-canvas" width="1600" height="1000" aria-label="Lienzo compartido para anotar"></canvas>
        </div>
        <aside id="board-model-info" class="board-model-info" role="status" hidden><strong></strong><span></span></aside>
        <div class="board-blank" id="board-blank">${icon('pencil')}<strong>Aquí empiezan las ideas</strong><span id="board-blank-help">Escribe o dibuja en este espacio.</span></div>
      </div>
      <div class="board-canvas-footer"><span id="board-draw-status"></span><button id="board-hand" class="board-button" type="button" aria-pressed="false" hidden>${icon('hand')} Levantar la mano</button></div>
    </div><aside class="board-sidebar" aria-label="Participantes y chat"><section class="board-people"><h2>${icon('users')} Participantes <span id="board-people-count">0</span></h2><label class="board-search">${icon('search')}<input id="board-people-search" type="search" placeholder="Buscar participante" aria-label="Buscar participante"></label><div id="board-people-list"></div></section><section class="board-chat"><h2>${icon('chat')} Chat del tablero</h2><div id="board-chat-list" class="board-chat-list" role="log" aria-label="Mensajes del tablero" aria-live="polite"></div><form id="board-chat-form"><label class="sr-board-only" for="board-chat-input">Mensaje</label><input id="board-chat-input" maxlength="1000" placeholder="Escribe un mensaje…" required autocomplete="off"><button class="board-button" type="submit" aria-label="Enviar mensaje">${icon('right')}</button></form></section></aside></div>
  </section>
  <dialog id="board-create-dialog" class="board-dialog"><form id="board-create-form"><div class="board-dialog-heading"><span class="board-eyebrow">UN NUEVO ESPACIO</span><button type="button" class="board-icon-button" id="board-create-close" aria-label="Cerrar">${icon('close')}</button></div><h2>Crear tablero</h2><p id="board-create-description"></p><label>Título del tablero<input id="board-create-title" name="title" required minlength="2" maxlength="100" placeholder="Ej. Nombre de la clase o de la materia"></label><label>Clase o materia<input name="course" required minlength="2" maxlength="100" placeholder="Ej. Fisiología renal · Grupo 01"></label><div class="board-duration">
      <div class="board-duration-heading"><label for="board-create-duration">Duración del tablero</label><output id="board-create-time" for="board-create-duration"></output></div>
      <div class="board-duration-control">
        <div class="board-duration-track" aria-hidden="true"></div>
        <input id="board-create-duration" name="durationMinutes" type="range">
        <div class="board-duration-marks" aria-hidden="true"></div>
      </div>
    </div><div class="board-create-university">${icon('users')} UPB <span id="board-create-capacity"></span></div><p id="board-create-error" role="alert" hidden></p><button id="board-create-submit" class="board-button board-primary" type="submit">Crear y abrir tablero</button></form></dialog>
  <dialog id="board-delete-dialog" class="board-dialog"><h2>¿Borrar este tablero?</h2><p>Se eliminarán definitivamente el lienzo, los textos, los modelos compartidos, el chat y los participantes de este tablero.</p><p id="board-delete-error" role="alert" hidden></p><div class="board-room-actions"><button id="board-delete-cancel" type="button" class="board-button">Cancelar</button><button id="board-delete-confirm" type="button" class="board-button board-primary">Borrar tablero</button></div></dialog>
  <dialog id="board-clear-dialog" class="board-dialog"><h2>¿Vaciar el lienzo compartido?</h2><p>Se eliminarán los trazos, textos y resaltados de este tablero. Los mensajes del chat se conservarán.</p><div class="board-room-actions"><button class="board-button" id="board-clear-cancel" type="button">Cancelar</button><button class="board-button board-primary" id="board-clear-confirm" type="button">Vaciar lienzo</button></div></dialog>
`;
$('.main-container').append(shell); hydrateIcons(shell);
let profile, session, directoryStop, visible = false, loaded = false, items = [], directoryError = '', joining = false;
let textSaving=false;
let tool='pen', textTarget=null, deleteTarget=null, textBoxes=[], lastLiveAt=0;
let color = '#8c2626', gesture = null, previousStrokeState = '', previousPeopleState = '', previousChatState = '';
const durationInput = $('#board-create-duration');
const modelLayer = $('#board-model-layer'), modelInkButton = $('#board-model-ink');
let sharedModels = new Map(), modelViewer, modelViewerLoad;
const modelSizeRequests = new Map();
const modelForm = $('#board-model-form'), modelPicker = $('#board-model-picker');
let modelKey = '', modelSaving = false;
const cleanupStops=new Map();
const occupancy = new Map(), counts = new Map(), countStops = new Map(), limits = {teacher:12, student:12};
const canvas = $('#board-canvas'), ctx = canvas.getContext('2d');
const boardError = error => /permission|denied/i.test(error.message || '') ? 'No pudimos acceder a los tableros. Publica las reglas actualizadas de database.rules.json en Firebase.' : error.message || 'No fue posible completar la acción. Inténtalo de nuevo.';
function roomError(error = '') { const target = $('#board-room-error'); target.textContent = typeof error === 'string' ? error : boardError(error); target.hidden = !target.textContent; }
async function perform(button, action) { if (button.disabled) return; button.disabled = true; try { await action(); } catch(error) { roomError(error); } finally { button.disabled = false; updateRoom(); } }
// Cleanup runs while Risio has an authenticated session, including other modules.
// Rules independently enforce class, group and empty-group deadlines.
setInterval(()=>{if(session){if(visible)renderCatalog();session.cleanExpired(items,occupancy);}},15000);
function subscribeDirectory() {
  if (directoryStop) return;
  const stopClock=onValue(ref(database,'.info/serverTimeOffset'),snap=>{if(session)session.clockOffset=snap.val()||0;});
  const stopDirectory = onValue(ref(database,`boardDirectory/${profile.university}`), snapshot => {
    items = Object.entries(snapshot.val() || {}).map(([id,b]) => ({...b,id}));
    const groups=new Set(items.filter(b=>b.kind==='student').map(b=>b.id));
    for(const [id,stop] of cleanupStops)if(!groups.has(id)){stop();cleanupStops.delete(id);occupancy.delete(id);}
    for(const id of groups)if(!cleanupStops.has(id)){
      cleanupStops.set(id,()=>{});
      const stop=onValue(ref(database,`boardData/${profile.university}/${id}/slots`),snap=>{
        occupancy.set(id,snap.val()||{});session.cleanExpired(items,occupancy);if(visible)renderCatalog();
      },()=>{});
      cleanupStops.set(id,stop);
    }
    if(session?.meta && !items.some(b=>b.id===session.meta.id)){session.removed=true;session.present=false;session.error='Este tablero se eliminó. Vuelve a la lista para continuar.';session.state={...session.state,strokes:{},texts:{},live:{},highlights:{},messages:{},models:{}};updateRoom();}
    loaded = true; directoryError = ''; renderCatalog();
    session.cleanExpired(items,occupancy);
  }, error => { directoryError = boardError(error); loaded = true; renderCatalog(); });
  directoryStop=()=>{stopDirectory();stopClock();};
}
function renderCatalog() {
  if (!visible) return;
  $('#boards-directory-status').textContent = directoryError || (loaded ? `${items.length} ${items.length === 1 ? 'tablero disponible' : 'tableros disponibles'} en UPB` : 'Cargando tableros…');
  $('#boards-directory-status').dataset.error = String(Boolean(directoryError));
  const wanted = new Set();
  for (const kind of ['teacher','student']) {
    const filter = $(`[data-board-filter="${kind}"]`).value;
    const matches = selectBoards(items.filter(b => b.kind === kind && !boardExpired(b,session.serverNow,occupancy.get(b.id))), {search:$(`[data-board-search="${kind}"]`).value, sort:$(`[data-board-sort="${kind}"]`).value, mine:filter === 'mine', uid:session.uid});
    // Occupancy filters subscribe to all matching candidates, not just the current page.
    const filtered = matches.filter(b => { wanted.add(b.id); const count = counts.get(b.id); return filter === 'online' ? count > 0 : filter === 'available' ? count == null || count < (kind==='teacher'?50:5) : true; });
    $(`[data-board-total="${kind}"]`).textContent = filtered.length;
    $(`[data-board-more="${kind}"]`).hidden = filtered.length <= limits[kind];
    const cards = filtered.slice(0,limits[kind]);
    $(`[data-board-grid="${kind}"]`).innerHTML = cards.length ? cards.map(b => {
      const count = counts.get(b.id), full = count >= (kind==='teacher'?50:5);
      return `<article class="board-card" data-board-card="${escape(b.id)}"><div class="board-card-heading"><span class="board-kind">${icon(kind === 'teacher' ? 'board' : 'users')}${kind === 'teacher' ? 'Clase' : 'Grupo de estudio'}</span><span class="board-card-tag ${full ? 'full' : ''}">${full ? 'Completo' : b.ownerUid === session.uid ? 'Tu tablero' : 'UPB'}</span></div><h3>${escape(b.title)}</h3><p class="board-course">${escape(b.course)}</p><p class="board-creator">${kind === 'teacher' ? 'Profesor' : 'Creado por'} · ${escape(b.ownerName)}</p><div class="board-card-footer"><span>${icon('users')}${count == null ? '…' : count}${kind === 'student' ? ' / 5 conectados' : ' / 50 conectados'}<small>${new Date(b.createdAt).toLocaleDateString('es-CO',{day:'numeric',month:'short',year:'numeric'})}</small></span>${b.ownerUid===session.uid?`<button type="button" class="board-button board-delete-card" data-board-delete="${escape(b.id)}" aria-label="Borrar ${escape(b.title)}">${icon('trash')}</button>`:''}<button class="board-button ${full ? '' : 'board-enter'}" type="button" data-board-open="${escape(b.id)}" ${full || joining ? 'disabled' : ''}>${full ? 'Sin cupo' : 'Entrar'} ${icon('right')}</button></div></article>`;
    }).join('') : `<div class="boards-empty">${icon(kind === 'teacher' ? 'board' : 'users')}<h3>${!loaded ? 'Cargando…' : directoryError ? 'No se pudo cargar esta sección' : matches.length || $(`[data-board-search="${kind}"]`).value || filter !== 'all' ? 'No hay coincidencias' : kind === 'teacher' ? 'La próxima clase empieza aquí' : 'Dale un espacio a tu grupo'}</h3><p>${directoryError ? 'Revisa las reglas y vuelve a abrir Tableros para reintentar.' : 'Crea un tablero o cambia la búsqueda y los filtros.'}</p>${profile.requestedRole === kind ? '<button type="button" class="board-button" data-board-create-empty>Crear tablero</button>' : ''}</div>`;
  }
  hydrateIcons(shell);
  for (const [id,stop] of countStops) if (!wanted.has(id)) { stop(); countStops.delete(id); }
  for (const id of wanted) if (!countStops.has(id)) {
    const item = items.find(b => b.id === id), path = item.kind === 'student' ? 'slots' : 'participants';
    // Register before attaching the listener so a callback cannot add it twice.
    countStops.set(id, () => {});
    const stop = onValue(ref(database,`boardData/${profile.university}/${id}/${path}`), snap => {
      const values=snap.val()||{}; const previous=JSON.stringify(occupancy.get(id));occupancy.set(id,values);
      const n = new Set(activePeople(values).map(p => p.uid)).size;
      if(previous!==JSON.stringify(values))session.cleanExpired(items,occupancy);
      if (counts.get(id) !== n) { counts.set(id,n); renderCatalog(); }
    }, () => { counts.set(id,undefined); });
    countStops.set(id,stop);
  }
}
function durationLabel(minutes, teacher) {
  if (!teacher) return `${minutes} min`;
  return minutes === 60 ? '1 hora' : `${minutes / 60} horas`;
}
function updateCreateDuration() {
  const minutes = durationInput.valueAsNumber;
  const label = durationLabel(minutes, profile.requestedRole === 'teacher');
  $('#board-create-time').value = label;
  durationInput.setAttribute('aria-valuetext', label);
  const progress = (minutes - Number(durationInput.min)) / (Number(durationInput.max) - Number(durationInput.min));
  durationInput.parentElement.style.setProperty('--duration-progress', `${progress * 100}%`);
}
durationInput.addEventListener('input', updateCreateDuration);
function showCreate() {
  const teacher = profile.requestedRole === 'teacher';
  $('#board-create-description').textContent = teacher ? 'Asigna el tablero a tu clase. Tus estudiantes podrán encontrarlo en UPB y pedir permiso para anotar.' : 'Crea un espacio compartido para estudiar con otras personas de UPB.';
  $('#board-create-capacity').textContent = teacher ? 'Clase · 50 personas' : 'Grupo · 5 personas';
  $('#board-create-error').hidden = true;
  $('#board-create-form').reset();
  const durations = teacher ? CLASS_DURATION_MINUTES : STUDENT_DURATION_MINUTES;
  durationInput.min = durations[0];
  durationInput.max = durations.at(-1);
  durationInput.step = durations[1] - durations[0];
  durationInput.value = defaultBoardMinutes(profile.requestedRole);
  $('.board-duration-marks').innerHTML = durations.map(minutes => `<span>${durationLabel(minutes, teacher)}</span>`).join('');
  updateCreateDuration();
  $('#board-create-dialog').showModal();
  $('#board-create-title').focus();
}
async function openRoom(meta) {
  document.body.classList.add('board-room-open');
  setWideView(false);
  boardGestures.reset();
  setSharedModels(new Map());
  modelKey = '';
  joining = true; roomError(); previousStrokeState = ''; previousPeopleState = ''; previousChatState = ''; gesture = null;
  $('#boards-catalog').hidden = true; $('#board-room').hidden = false;
  $('#board-room-title').textContent = meta.title; $('#board-room-subtitle').textContent = `${meta.course} · ${meta.kind === 'teacher' ? 'Clase de ' : 'Grupo de '}${meta.ownerName} · UPB`;
  $('#board-people-search').value = ''; $('#board-chat-input').value = ''; $('#board-room-title').focus();
  color=meta.kind==='teacher' && meta.ownerUid===session.uid?TEACHER_BLUE:'#8c2626';$('#board-color').value=color;
  chooseColor(color);
  try { await session.join(meta); } finally { joining = false; }
  window.scrollTo(0,0); updateRoom();
}
function drawStroke(stroke) {
  const value = parseStroke(stroke); if (!value) return;
  ctx.globalAlpha=value.tool==='highlighter'?.25:1;
  ctx.strokeStyle = readableInk(value.color); ctx.fillStyle = readableInk(value.color); ctx.lineWidth = value.width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const [first, ...points] = value.points;
  if (!points.length) { ctx.beginPath(); ctx.arc(first[0]*1600,first[1]*1000,value.width/2,0,Math.PI*2); ctx.fill(); return; }
  ctx.beginPath(); ctx.moveTo(first[0]*1600,first[1]*1000); for (const point of points) ctx.lineTo(point[0]*1600,point[1]*1000); ctx.stroke();
}
function drawText(id,value) {
  if(typeof value.text!=='string' || !Number.isFinite(value.x) || !Number.isFinite(value.y))return;
  const size=Math.max(14,Math.min(60,value.fontSize||24)),x=value.x*1600,y=value.y*1000,maxWidth=Math.max(60,Math.min(520,1600-x-12));
  ctx.font=`${size}px Arial`;ctx.textBaseline='top';ctx.globalAlpha=1;
  const lines=[];for(const line of value.text.split('\n')){let current='';for(const word of line.split(' ')){if(ctx.measureText(current+word).width>maxWidth && current){lines.push(current.trimEnd());current='';}current+=word+' ';}lines.push(current.trimEnd());}
  const height=lines.length*size*1.35, width=Math.min(maxWidth,Math.max(30,...lines.map(l=>ctx.measureText(l).width)));
  const highlights=Object.values(session.state.highlights[id]||{});
  if(highlights.length){ctx.fillStyle=inkColor(highlights.at(-1));ctx.globalAlpha=.25;lines.forEach((line,i)=>ctx.fillRect(x-3,y+i*size*1.35,Math.max(10,ctx.measureText(line).width)+6,size*1.2));ctx.globalAlpha=1;}
  ctx.fillStyle=readableInk(inkColor(value));lines.forEach((line,i)=>ctx.fillText(line,x,y+i*size*1.35,maxWidth));
  textBoxes.push({id,x:x/1600,y:y/1000,width:width/1600,height:height/1000});
}
function repaint() {
  ctx.globalAlpha=1;ctx.clearRect(0,0,canvas.width,canvas.height);textBoxes=[];
  const strokes=Object.values(session?.state.strokes||{}),live=Object.entries(session?.state.live||{}).filter(([uid])=>uid!==session.uid).map(([,v])=>v);
  for(const stroke of [...strokes,...live].filter(s=>s.tool!=='highlighter'))drawStroke(stroke);
  for(const [id,value]of Object.entries(session?.state.texts||{}))drawText(id,value);
  for(const stroke of [...strokes,...live].filter(s=>s.tool==='highlighter'))drawStroke(stroke);
  if(gesture)drawStroke({...gesture,...rgb(gesture.color),pointsJson:JSON.stringify(gesture.points)});
  ctx.globalAlpha=1;
}
function chooseColor(next){
  if(session.meta?.kind==='teacher'){
    if(session.owner){color=TEACHER_BLUE;return;}
    if(isBlue(next)){roomError('El azul está reservado para el profesor. Escoge otro color.');$('#board-color').value=color;return;}
  }
  color=next;$('#board-color').value=color;for(const button of shell.querySelectorAll('[data-board-color]'))button.setAttribute('aria-pressed',String(button.dataset.boardColor===color));
}
function updateBoardModels() {
  const sizes = new Map();
  for (const id of Object.keys(BOARD_MODELS)) {
    const size = boardModelSize(session.state.models[id]);
    if (size) sizes.set(id, size);
  }
  const shared = [...sizes.keys()];
  const canManage = session.allowsModelSharing;
  const active = !session.removed && !session.expired;
  const editable = session.canShareModels;
  $('#board-models').hidden = !active || (!canManage && !shared.length);
  modelForm.hidden = !canManage;
  setSharedModels(active ? sizes : new Map());
  modelInkButton.hidden = !session.canDraw || !sharedModels.size;
  if (modelInkButton.hidden) setModelInk(false);

  const key = JSON.stringify([shared, canManage, editable]);
  modelForm.querySelector('button').disabled = !editable || shared.length === Object.keys(BOARD_MODELS).length || modelSaving;
  if (key === modelKey) { updateModelSizeButtons(); return; }
  modelKey = key;
  const previous = modelPicker.value;
  const available = Object.entries(BOARD_MODELS).filter(([id]) => !shared.includes(id));
  modelPicker.innerHTML = available.length
    ? '<option value="">Elige un modelo</option>' + available.map(([id, model]) => `<option value="${id}">${model.label}</option>`).join('')
    : '<option value="">Todos los modelos agregados</option>';
  if (available.some(([id]) => id === previous)) modelPicker.value = previous;
  modelPicker.disabled = !editable || !available.length;
  $('#board-models-help').textContent = shared.length ? 'Usa − y + para ajustar el tamaño compartido. Pulsa el nombre para reencuadrar.' : 'Comparte un modelo anatómico con el grupo.';
  const list = $('#board-model-list');
  list.innerHTML = shared.map(id => {
    const { label } = BOARD_MODELS[id];
    return `<li><button type="button" class="board-button" data-board-model="${id}" aria-controls="board-model-layer">${icon('kidney')} ${label}</button>${canManage
      ? `<button type="button" class="board-button" data-board-resize="${id}" data-step="-1" aria-label="Reducir ${label}">${icon('minus')}</button>
        <span class="board-model-size" data-board-size="${id}"></span>
        <button type="button" class="board-button" data-board-resize="${id}" data-step="1" aria-label="Agrandar ${label}">${icon('plus')}</button>
        <button type="button" class="board-button" aria-label="Quitar ${label} del tablero" data-board-unshare="${id}" ${editable ? '' : 'disabled'}>${icon('close')}</button>`
      : ''}</li>`;
  }).join('');
  hydrateIcons(list);
  updateModelSizeButtons();
}

function updateModelSizeButtons() {
  for (const label of shell.querySelectorAll('[data-board-size]')) {
    const size = `${sharedModels.get(label.dataset.boardSize)} %`;
    if (label.textContent !== size) label.textContent = size;
  }
  for (const button of shell.querySelectorAll('[data-board-resize]')) {
    const id = button.dataset.boardResize, size = sharedModels.get(id);
    button.disabled = !size || !session.canShareModels || modelSizeRequests.has(id)
      || (button.dataset.step === '1' ? size >= MAX_MODEL_SIZE : size <= MIN_MODEL_SIZE);
  }
}

function setModelInk(enabled) {
  modelInkButton.setAttribute('aria-pressed', String(enabled));
  modelLayer.classList.toggle('board-model-ink-through', enabled);
  if (enabled) modelViewer?.stopHover();
}
modelInkButton.addEventListener('click', () => setModelInk(modelInkButton.getAttribute('aria-pressed') !== 'true'));

function loadModelViewer() {
  if (!modelViewerLoad) {
    const load = import('./board-model-viewer.js').then(({ mountBoardModels }) => {
      if (modelViewerLoad !== load) return;
      modelViewer = mountBoardModels(modelLayer, $('#board-model-info'));
      modelViewer.sync(sharedModels);
    }).catch(error => {
      if (modelViewerLoad !== load) return;
      modelViewerLoad = null;
      console.error('Error al abrir el visor del tablero:', error);
      roomError('No se pudo abrir el visor 3D en este navegador.');
    });
    modelViewerLoad = load;
  }
  return modelViewerLoad;
}

function setSharedModels(models) {
  if (models.size === sharedModels.size && [...models].every(([id, size]) => sharedModels.get(id) === size)) return;
  sharedModels = models;
  modelLayer.hidden = !models.size;
  if (!models.size) {
    modelSizeRequests.clear();
    modelViewerLoad = null;
    modelViewer?.dispose();
    modelViewer = null;
    setModelInk(false);
  } else if (modelViewer) {
    modelViewer.sync(models);
  } else {
    loadModelViewer();
  }
}

async function focusSharedModel(id) {
  if (!sharedModels.has(id)) return;
  setModelInk(false);
  const loading = loadModelViewer();
  await loading;
  if (modelViewerLoad !== loading || !sharedModels.has(id)) return;
  if (boardGestures.scale !== 1) boardGestures.reset();
  modelViewer?.focus(id);
}

modelForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!modelPicker.value || modelSaving || !session.canShareModels) return;
  const id = modelPicker.value, boardId = session.meta.id;
  modelSaving = true;
  updateBoardModels();
  try {
    await session.shareModel(id, true);
    if (session.meta?.id === boardId) await focusSharedModel(id);
  }
  catch (error) { roomError(error); }
  finally { modelSaving = false; if (session?.meta) updateBoardModels(); }
});
async function changeModelSize(button) {
  if (button.disabled) return;
  const id = button.dataset.boardResize, request = Symbol();
  modelSizeRequests.set(id, request);
  updateModelSizeButtons();
  try {
    await session.resizeModel(id, Number(button.dataset.step));
  } catch (error) {
    if (modelSizeRequests.get(id) === request) roomError(error);
  } finally {
    if (modelSizeRequests.get(id) === request) {
      modelSizeRequests.delete(id);
      updateModelSizeButtons();
    }
  }
}

$('#board-model-list').addEventListener('click', event => {
  const open = event.target.closest('[data-board-model]');
  const remove = event.target.closest('[data-board-unshare]');
  const resize = event.target.closest('[data-board-resize]');
  if (resize) changeModelSize(resize);
  if (open) focusSharedModel(open.dataset.boardModel);
  if (remove) perform(remove, () => session.shareModel(remove.dataset.boardUnshare, false));
});

function updateRoom() {
  if (!session?.meta) return;
  const {state} = session, online = session.online && session.present;
  updateBoardModels();
  if (!session.canDraw && gesture) { gesture = null; session.finishLive().catch(()=>{});repaint(); }
  $('#board-save-state').textContent = !session.online ? 'Sin conexión' : session.error ? 'No conectado al tablero' : !session.present ? 'Conectando…' : session.pending.size ? 'Guardando…' : 'Todo guardado';
  $('#board-save-state').dataset.state = online && !session.pending.size ? 'saved' : 'pending';
  if (session.error) roomError(session.error);
  $('#board-draw-status').textContent = !online ? 'Espera a conectar para participar.' : session.canDraw ? session.meta.kind === 'teacher' ? 'Tienes permiso para anotar.' : 'Todos los integrantes pueden anotar.' : 'Estás viendo la clase. Levanta la mano para pedir permiso.';
  $('#board-blank-help').textContent = session.canDraw ? tool==='text'?'Haz clic en el lienzo para crear una caja de texto.':tool==='highlighter'?'Resalta con el lápiz o haz clic sobre un texto.':'Elige un color para dibujar, o Texto y un lugar en el lienzo.' : 'Los trazos de la clase aparecerán aquí.';
  canvas.classList.toggle('board-readonly', !session.canDraw);
  for (const el of shell.querySelectorAll('[data-board-color], #board-color, #board-width, #board-undo, [data-board-tool]')) el.disabled = !session.canDraw;
  $('#board-text-form [type=submit]').disabled=!session.canDraw || textSaving;
  const classroom=session.meta.kind==='teacher';
  $('#board-color-help').textContent=classroom?(session.owner?'Tu color de profesor: azul.':'Azul reservado para el profesor.'):'Elige un color o abre el selector.';
  if(classroom && session.owner){color=TEACHER_BLUE;$('#board-color').value=color;for(const el of shell.querySelectorAll('[data-board-color], #board-color'))el.disabled=true;for(const el of shell.querySelectorAll('[data-board-color]'))el.setAttribute('aria-pressed',String(el.dataset.boardColor===color));}
  for(const el of shell.querySelectorAll('[data-board-color]'))el.hidden=classroom && !session.owner && isBlue(el.dataset.boardColor);
  $('#board-delete').hidden=!session.owner;
  $('#board-lifetime').hidden=false;
  const lifetime = boardLifetime(session.meta);
  const seconds = Math.max(0, Math.ceil((session.meta.createdAt + lifetime - session.serverNow) / 1000));
  const clock = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, '0')).join(':');
  const idleNotice = classroom ? '' : ' · Caduca tras 2 minutos vacío';
  $('#board-lifetime').textContent = `Tiempo restante: ${clock} · Duración: ${lifetime / 60000} min${idleNotice}`;
  const raised=classroom && session.owner?Object.keys(state.hands).filter(uid=>state.participants[uid]):[];
  const alerts=$('#board-hand-alerts');alerts.hidden=!raised.length;
  const alertKey=JSON.stringify(raised.map(uid=>[uid,state.participants[uid].displayName]));
  if(alerts.dataset.key!==alertKey){alerts.dataset.key=alertKey;alerts.innerHTML=raised.map(uid=>`<div>${icon('hand')}<strong>${escape(state.participants[uid].displayName)} levantó la mano</strong><button type="button" class="board-button board-primary" data-board-grant="${escape(uid)}">Dar permiso para anotar</button></div>`).join('');hydrateIcons(alerts);}
  
  $('#board-clear').hidden = !session.owner; $('#board-clear').disabled = !online;
  $('#board-hand').hidden = session.meta.kind !== 'teacher' || session.owner;
  $('#board-hand').disabled = !online; $('#board-hand').setAttribute('aria-pressed',String(Boolean(state.hands[session.uid])));
  $('#board-hand').innerHTML = iconMarkup('hand') + (state.hands[session.uid] ? ' Bajar la mano' : ' Levantar la mano');
  $('#board-chat-input').disabled = !online; $('#board-chat-form button').disabled = !online;
  const strokeState = JSON.stringify([state.strokes,state.live,state.texts,state.highlights]);
  if (strokeState !== previousStrokeState) { previousStrokeState = strokeState; repaint(); }
  $('#board-blank').hidden = Boolean(sharedModels.size || Object.keys(state.strokes).length || Object.keys(state.texts).length || Object.keys(state.live).length || gesture || !$('#board-text-dialog').hidden);
  const peopleState = JSON.stringify([state.participants,state.permissions,state.hands,$('#board-people-search').value,session.online]);
  if (peopleState !== previousPeopleState) { previousPeopleState = peopleState; renderPeople(); }
  const chatState = JSON.stringify(state.messages);
  if (chatState !== previousChatState) {
    previousChatState = chatState;
    const box = $('#board-chat-list'), bottom = box.scrollHeight - box.scrollTop - box.clientHeight < 70;
    const messages = Object.values(state.messages);
    box.innerHTML = messages.length ? messages.map(m => `<article class="board-chat-message ${m.uid === session.uid ? 'own' : ''}"><div><strong>${escape(m.authorName)}</strong><time>${new Date(m.createdAt).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}</time></div><p>${escape(m.text)}</p></article>`).join('') : '<p class="board-chat-empty">Comparte una pregunta o una idea con el grupo.</p>';
    if (bottom || messages.at(-1)?.uid === session.uid) box.scrollTop = box.scrollHeight;
  }
}
function renderPeople() {
  const {state} = session, query = $('#board-people-search').value.trim().toLocaleLowerCase('es');
  const people = Object.values(state.participants).sort((a,b) => Number(Boolean(state.hands[b.uid])) - Number(Boolean(state.hands[a.uid])) || a.displayName.localeCompare(b.displayName,'es'));
  $('#board-people-count').textContent = `${people.length}${session.meta.kind === 'student' ? ' / 5' : ' / 50'}`;
  $('#board-people-list').innerHTML = people.filter(p => p.displayName.toLocaleLowerCase('es').includes(query)).map(p => {
    const owner = p.uid === session.meta.ownerUid, permitted = state.permissions[p.uid] || owner || session.meta.kind === 'student';
    return `<div class="board-person"><span class="board-avatar">${escape(p.displayName.slice(0,1).toUpperCase())}</span><div><strong>${escape(p.displayName)}${p.uid === session.uid ? ' (tú)' : ''}</strong><small>${state.hands[p.uid] ? 'Mano levantada' : owner ? session.meta.kind === 'teacher' ? 'Profesor · creador' : 'Creador del grupo' : permitted ? 'Puede anotar' : 'Observando'}</small></div>${session.owner && session.meta.kind === 'teacher' && !owner ? `<button class="board-permission" type="button" data-board-permit="${escape(p.uid)}" ${!session.online ? 'disabled' : ''}>${state.permissions[p.uid] ? 'Retirar permiso' : 'Permitir anotar'}</button>` : state.hands[p.uid] ? icon('hand') : ''}</div>`;
  }).join('') || '<p class="board-chat-empty">No hay participantes que coincidan.</p>';
  hydrateIcons($('#board-people-list'));
}
async function list() { document.body.classList.remove('board-room-open'); closeTextEditor(); await session.leave(); setSharedModels(new Map()); gesture = null; $('#board-room').hidden = true; $('#boards-catalog').hidden = false; renderCatalog(); $('#boards-title').focus(); }
async function open() {
  if (!profile || visible) return;
  $('#library-reader-close')?.click(); $('#btn-home').click();
  document.body.classList.remove('home-screen-open','library-screen-open','credits-screen-open');
  document.body.classList.add('boards-screen-open'); visible = true;
  $('#boards-catalog').hidden = false; $('#board-room').hidden = true;
  if (directoryError && directoryStop) { directoryStop(); directoryStop = null; }
  subscribeDirectory(); renderCatalog(); window.scrollTo(0,0); $('#boards-title').focus();
}
async function close() {
  document.body.classList.remove('board-room-open');
  closeTextEditor();await session.leave();setSharedModels(new Map()); for (const stop of countStops.values()) stop(); countStops.clear();
  visible = false; document.body.classList.remove('boards-screen-open');
  $('#btn-home').click(); $('#btn-boards').focus();
}
$('#boards-home').addEventListener('click', event => perform(event.currentTarget, close));
$('#btn-boards').addEventListener('click', open); $('#account-boards').addEventListener('click', open);
$('#boards-create').addEventListener('click',showCreate); $('#board-create-close').addEventListener('click',() => $('#board-create-dialog').close());
$('#board-create-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = $('#board-create-submit'); if(button.disabled) return; button.disabled = true;
  $('#board-create-error').hidden = true;
  try { const data = new FormData(event.currentTarget), meta = await session.create(String(data.get('title')),String(data.get('course')), Number(data.get('durationMinutes'))); $('#board-create-dialog').close(); await openRoom(meta); }
  catch(error) { $('#board-create-error').textContent = boardError(error); $('#board-create-error').hidden = false; }
  finally { button.disabled = false; }
});
shell.addEventListener('click', event => {
  const openButton = event.target.closest('[data-board-open]'); if (openButton) { const meta = items.find(b => b.id === openButton.dataset.boardOpen); if (meta) perform(openButton,() => openRoom(meta)); }
  const del=event.target.closest('[data-board-delete]');if(del)confirmDelete(items.find(b=>b.id===del.dataset.boardDelete));
  const grant=event.target.closest('[data-board-grant]');if(grant)perform(grant,()=>session.permission(grant.dataset.boardGrant,true));
  const selectedTool=event.target.closest('[data-board-tool]');if(selectedTool){tool=selectedTool.dataset.boardTool;if(sharedModels.size && session.canDraw)setModelInk(true);for(const button of shell.querySelectorAll('[data-board-tool]'))button.setAttribute('aria-pressed',String(button===selectedTool));updateRoom();}
  const create = event.target.closest('[data-board-create-empty]'); if(create) showCreate();
  const more = event.target.closest('[data-board-more]'); if(more) { limits[more.dataset.boardMore] += 12; renderCatalog(); }
  const ink = event.target.closest('[data-board-color]'); if(ink) { chooseColor(ink.dataset.boardColor); }
  const permit = event.target.closest('[data-board-permit]'); if(permit) perform(permit,() => session.permission(permit.dataset.boardPermit));
});
for(const input of shell.querySelectorAll('[data-board-search], [data-board-sort], [data-board-filter]')) input.addEventListener(input.tagName === 'INPUT' ? 'input' : 'change', () => { limits.teacher = limits.student = 12; renderCatalog(); });
$('#board-back-list').addEventListener('click', event => perform(event.currentTarget,list));
$('#board-people-search').addEventListener('input',renderPeople);
$('#board-hand').addEventListener('click',event => perform(event.currentTarget,() => session.hand()));
$('#board-undo').addEventListener('click',event => perform(event.currentTarget,() => session.undo()));
$('#board-clear').addEventListener('click',() => $('#board-clear-dialog').showModal());
$('#board-clear-cancel').addEventListener('click',() => $('#board-clear-dialog').close());
$('#board-clear-confirm').addEventListener('click',event => perform(event.currentTarget,async () => { await session.clear(); $('#board-clear-dialog').close(); }));
$('#board-chat-form').addEventListener('submit',event => { event.preventDefault(); const input = $('#board-chat-input'); perform(event.currentTarget.querySelector('button'),async () => { await session.message(input.value); input.value = ''; input.focus(); }); });
function setWideView(enabled) {
  $('#board-room').classList.toggle('board-room-wide', enabled);
  $('#board-wide').setAttribute('aria-pressed', String(enabled));
}
$('#board-wide').addEventListener('click', event => {
  setWideView(event.currentTarget.getAttribute('aria-pressed') !== 'true');
  boardGestures.apply();
});
$('#board-export').addEventListener('click', () => {
  repaint();
  const output = document.createElement('canvas');
  output.width = canvas.width;
  output.height = canvas.height;
  const image = output.getContext('2d');
  image.fillStyle = darkMode() ? '#191b1f' : '#ffffff';
  image.fillRect(0, 0, output.width, output.height);
  modelViewer?.drawTo(image);
  image.drawImage(canvas, 0, 0);
  const link = document.createElement('a');
  link.download = `Risio-tablero-${session.meta.id}.png`;
  link.href = output.toDataURL('image/png');
  link.click();
});
function point(event) { const box = canvas.getBoundingClientRect(); return [Math.max(0,Math.min(1,(event.clientX-box.x)/box.width)),Math.max(0,Math.min(1,(event.clientY-box.y)/box.height))].map(n => Number(n.toFixed(5))); }
function positionTextEditor() {
  if(!textTarget)return;
  const editor=$('#board-text-dialog'), paper=canvas.closest('.board-paper-wrapper');
  const width=Math.min(360,paper.clientWidth-16),view=canvas.getBoundingClientRect(),base=paper.getBoundingClientRect();
  editor.style.width=width+'px';
  editor.style.left=Math.max(8,Math.min(view.left-base.left+textTarget.x*view.width,paper.clientWidth-width-8))+'px';
  editor.style.top=Math.max(8,Math.min(view.top-base.top+textTarget.y*view.height,Math.max(8,paper.clientHeight-300)))+'px';
  $('#board-text-value').style.color=readableInk(textTarget.color);
}
function closeTextEditor() {
  if(textSaving)return;
  $('#board-text-dialog').hidden=true;textTarget=null;updateRoom();
}
new ResizeObserver(positionTextEditor).observe(canvas);
$('#board-text-value').addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();closeTextEditor();}
  if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();$('#board-text-form').requestSubmit();}
});
function hitText(p){return [...textBoxes].reverse().find(b=>p[0]>=b.x && p[0]<=b.x+b.width && p[1]>=b.y && p[1]<=b.y+b.height);}
function cancelBoardInk(){gesture=null;pendingTap=null;session?.finishLive().catch(()=>{});repaint();}
let pendingTap=null;
const boardGestures=new InkGestures(canvas,{viewport:canvas.closest('.board-paper-wrapper'),targets:()=>[$('#board-sheet')],enabled:()=>visible && !$('#board-room').hidden,cancel:cancelBoardInk,changed:positionTextEditor});
window.addEventListener('risio-theme-change',()=>{if(session)repaint();positionTextEditor();});
function startBoardInk(event,fromTap=false){
  if(!$('#board-text-dialog').hidden)return;
  if(!session?.canDraw || (event.pointerType==='mouse' && event.button!==0) || gesture)return;
  const p=point(event),hit=hitText(p);
  if(event.pointerType==='touch' && !fromTap && (tool==='text' || tool==='highlighter' && hit)){pendingTap=event;return;}
  if(tool==='text'){
    if(hit && session.state.texts[hit.id].authorUid!==session.uid){roomError('Solo el autor puede editar esta caja de texto.');return;}
    textTarget=hit?{...session.state.texts[hit.id],id:hit.id,color:inkColor(session.state.texts[hit.id])}:{x:Math.min(.95,p[0]),y:Math.min(.95,p[1]),fontSize:24,color};
    $('#board-text-value').value=textTarget.text||'';$('#board-text-size').value=textTarget.fontSize;$('#board-text-error').hidden=true;positionTextEditor();$('#board-text-dialog').hidden=false;$('#board-blank').hidden=true;$('#board-text-value').focus();return;
  }
  if(tool==='highlighter' && hit){session.highlightText(hit.id,color).catch(roomError);return;}
  event.preventDefault();canvas.setPointerCapture(event.pointerId);
  gesture={pointer:event.pointerId,points:[p],color,width:Number($('#board-width').value)*(tool==='highlighter'?4:1),tool};$('#board-blank').hidden=true;lastLiveAt=performance.now();
  session.liveStroke(gesture.points,color,gesture.width,tool).catch(roomError);repaint();
}
canvas.addEventListener('pointerdown',event=>startBoardInk(event));
canvas.addEventListener('pointermove',event=>{
  if(!gesture || gesture.pointer!==event.pointerId)return;
  const p=point(event),last=gesture.points.at(-1);
  if(Math.hypot(p[0]-last[0],p[1]-last[1])>.001 && gesture.points.length<2000){gesture.points.push(p);repaint();
    if(performance.now()-lastLiveAt>80){lastLiveAt=performance.now();session.liveStroke([...gesture.points],gesture.color,gesture.width,gesture.tool).catch(roomError);}}
});
canvas.addEventListener('pointerup',async event=>{
  if(pendingTap?.pointerId===event.pointerId){const tap=pendingTap;pendingTap=null;startBoardInk(tap,true);return;}
  if(!gesture || gesture.pointer!==event.pointerId)return;const stroke=gesture;gesture=null;
  try{await session.stroke(stroke.points,stroke.color,stroke.width,stroke.tool);}catch(error){roomError(error);}finally{await session.finishLive().catch(()=>{});}
  repaint();updateRoom();
});
canvas.addEventListener('pointercancel',cancelBoardInk);
canvas.addEventListener('lostpointercapture',()=>{if(gesture)cancelBoardInk();});
$('#board-color').addEventListener('input',event=>chooseColor(event.target.value));
$('#board-width').addEventListener('input',event=>$('#board-width-value').value=event.target.value);
$('#board-text-cancel').addEventListener('click',closeTextEditor);
$('#board-text-form').addEventListener('submit',async event=>{
 event.preventDefault();if(textSaving)return;const button=event.currentTarget.querySelector('[type=submit]');button.disabled=true;textSaving=true;
 try{const value=$('#board-text-value').value.trim();if(!value)throw new Error('Escribe un texto.');await session.text({...textTarget,text:value,fontSize:Number($('#board-text-size').value),color:textTarget.color},textTarget.id);textSaving=false;closeTextEditor();}
 catch(error){$('#board-text-error').hidden=false;$('#board-text-error').textContent=boardError(error);}finally{textSaving=false;button.disabled=false;}
});
function confirmDelete(meta){if(!meta)return;deleteTarget=meta;$('#board-delete-error').hidden=true;$('#board-delete-dialog').showModal();}
$('#board-delete').addEventListener('click',()=>confirmDelete(session.meta));
$('#board-delete-cancel').addEventListener('click',()=>$('#board-delete-dialog').close());
$('#board-delete-confirm').addEventListener('click',async event=>{
 const button=event.currentTarget;button.disabled=true;
 try{await session.deleteBoard(deleteTarget);$('#board-delete-dialog').close();if(session.meta?.id===deleteTarget.id){session.removed=true;await list();}}
 catch(error){$('#board-delete-error').hidden=false;$('#board-delete-error').textContent=boardError(error);}finally{button.disabled=false;}
});
setInterval(()=>{if(visible){if(session.meta)updateRoom();else renderCatalog();}},1000);
export const boards = {
  start(nextProfile) { if(profile) return; profile = nextProfile; session = new BoardSession(profile,updateRoom); subscribeDirectory(); },
  async leave() { if(session) await session.leave(); setSharedModels(new Map()); directoryStop?.();directoryStop=null;for(const stop of cleanupStops.values())stop();cleanupStops.clear();for(const stop of countStops.values())stop();countStops.clear(); },
  open
};
