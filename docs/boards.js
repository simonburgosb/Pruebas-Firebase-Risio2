import {auth, database} from './firebase-client.js';
import {ref, onValue} from './vendor/firebase-sdk.js';
import {hydrateIcons, iconMarkup} from './icons.js';
import {BoardSession} from './board-session.js';
import {selectBoards, parseStroke} from './board-utils.js';

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
    <header class="board-room-header"><div><button id="board-back-list" type="button" class="board-text-button">${icon('left')} Todos los tableros</button><h1 id="board-room-title" tabindex="-1"></h1><p id="board-room-subtitle"></p></div><div class="board-room-actions"><span id="board-save-state" role="status" aria-live="polite"></span><button id="board-export" class="board-button" type="button">${icon('save')} Descargar PNG</button></div></header>
    <p id="board-room-error" role="alert" hidden></p>
    <div class="board-workspace"><div class="board-drawing-area">
      <div class="board-toolbar" role="toolbar" aria-label="Herramientas del tablero"><span class="board-tool-label">${icon('pencil')} Lápiz</span><div class="board-colors" aria-label="Color del lápiz">${[['#8c2626','Rojo'],['#302b28','Negro'],['#23756a','Verde'],['#285c9b','Azul']].map(([color,label],i) => `<button type="button" data-board-color="${color}" aria-label="${label}" aria-pressed="${i === 0}" style="--ink:${color}"></button>`).join('')}</div><label class="board-width">Grosor<select id="board-width"><option value="2">Fino</option><option value="4" selected>Medio</option><option value="8">Grueso</option></select></label><button id="board-undo" class="board-button" type="button" title="Deshacer mi último trazo">${icon('undo')} Deshacer</button><button id="board-clear" class="board-button" type="button" hidden>${icon('trash')} Vaciar</button></div>
      <div class="board-paper-wrapper"><canvas id="board-canvas" width="1600" height="1000" aria-label="Lienzo compartido para anotar"></canvas><div class="board-blank" id="board-blank">${icon('pencil')}<strong>Aquí empiezan las ideas</strong><span id="board-blank-help">Escribe o dibuja en este espacio.</span></div></div>
      <div class="board-canvas-footer"><span id="board-draw-status"></span><button id="board-hand" class="board-button" type="button" aria-pressed="false" hidden>${icon('hand')} Levantar la mano</button></div>
    </div><aside class="board-sidebar" aria-label="Participantes y chat"><section class="board-people"><h2>${icon('users')} Participantes <span id="board-people-count">0</span></h2><label class="board-search">${icon('search')}<input id="board-people-search" type="search" placeholder="Buscar participante" aria-label="Buscar participante"></label><div id="board-people-list"></div></section><section class="board-chat"><h2>${icon('chat')} Chat del tablero</h2><div id="board-chat-list" class="board-chat-list" role="log" aria-label="Mensajes del tablero" aria-live="polite"></div><form id="board-chat-form"><label class="sr-board-only" for="board-chat-input">Mensaje</label><input id="board-chat-input" maxlength="1000" placeholder="Escribe un mensaje…" required autocomplete="off"><button class="board-button" type="submit" aria-label="Enviar mensaje">${icon('right')}</button></form></section></aside></div>
  </section>
  <dialog id="board-create-dialog" class="board-dialog"><form id="board-create-form"><div class="board-dialog-heading"><span class="board-eyebrow">UN NUEVO ESPACIO</span><button type="button" class="board-icon-button" id="board-create-close" aria-label="Cerrar">${icon('close')}</button></div><h2>Crear tablero</h2><p id="board-create-description"></p><label>Título del tablero<input id="board-create-title" name="title" required minlength="2" maxlength="100" placeholder="Ej. Nombre de la clase o de la materia"></label><label>Clase o materia<input name="course" required minlength="2" maxlength="100" placeholder="Ej. Fisiología renal · Grupo 01"></label><div class="board-create-university">${icon('users')} UPB <span id="board-create-capacity"></span></div><p id="board-create-error" role="alert" hidden></p><button id="board-create-submit" class="board-button board-primary" type="submit">Crear y abrir tablero</button></form></dialog>
  <dialog id="board-clear-dialog" class="board-dialog"><h2>¿Vaciar el lienzo compartido?</h2><p>Se eliminarán todos los trazos de este tablero. Los mensajes del chat se conservarán.</p><div class="board-room-actions"><button class="board-button" id="board-clear-cancel" type="button">Cancelar</button><button class="board-button board-primary" id="board-clear-confirm" type="button">Vaciar lienzo</button></div></dialog>
`;
$('.main-container').append(shell); hydrateIcons(shell);
let profile, session, directoryStop, visible = false, loaded = false, items = [], directoryError = '', joining = false;
let color = '#8c2626', gesture = null, previousStrokeState = '', previousPeopleState = '', previousChatState = '';
const counts = new Map(), countStops = new Map(), limits = {teacher:12, student:12};
const canvas = $('#board-canvas'), ctx = canvas.getContext('2d');
const boardError = error => /permission|denied/i.test(error.message || '') ? 'No pudimos acceder a los tableros. Publica las reglas actualizadas de database.rules.json en Firebase.' : error.message || 'No fue posible completar la acción. Inténtalo de nuevo.';
function roomError(error = '') { const target = $('#board-room-error'); target.textContent = typeof error === 'string' ? error : boardError(error); target.hidden = !target.textContent; }
async function perform(button, action) { if (button.disabled) return; button.disabled = true; try { await action(); } catch(error) { roomError(error); } finally { button.disabled = false; updateRoom(); } }
function subscribeDirectory() {
  if (directoryStop) return;
  directoryStop = onValue(ref(database,`boardDirectory/${profile.university}`), snapshot => {
    items = Object.entries(snapshot.val() || {}).map(([id,b]) => ({...b,id})); loaded = true; directoryError = ''; renderCatalog();
  }, error => { directoryError = boardError(error); loaded = true; renderCatalog(); });
}
function renderCatalog() {
  if (!visible) return;
  $('#boards-directory-status').textContent = directoryError || (loaded ? `${items.length} ${items.length === 1 ? 'tablero disponible' : 'tableros disponibles'} en UPB` : 'Cargando tableros…');
  $('#boards-directory-status').dataset.error = String(Boolean(directoryError));
  const wanted = new Set();
  for (const kind of ['teacher','student']) {
    const filter = $(`[data-board-filter="${kind}"]`).value;
    const matches = selectBoards(items.filter(b => b.kind === kind), {search:$(`[data-board-search="${kind}"]`).value, sort:$(`[data-board-sort="${kind}"]`).value, mine:filter === 'mine', uid:session.uid});
    // Occupancy filters subscribe to all matching candidates, not just the current page.
    const filtered = matches.filter(b => { wanted.add(b.id); const count = counts.get(b.id); return filter === 'online' ? count > 0 : filter === 'available' ? count == null || count < 5 : true; });
    $(`[data-board-total="${kind}"]`).textContent = filtered.length;
    $(`[data-board-more="${kind}"]`).hidden = filtered.length <= limits[kind];
    const cards = filtered.slice(0,limits[kind]);
    $(`[data-board-grid="${kind}"]`).innerHTML = cards.length ? cards.map(b => {
      const count = counts.get(b.id), full = kind === 'student' && count >= 5;
      return `<article class="board-card" data-board-card="${escape(b.id)}"><div class="board-card-heading"><span class="board-kind">${icon(kind === 'teacher' ? 'board' : 'users')}${kind === 'teacher' ? 'Clase' : 'Grupo de estudio'}</span><span class="board-card-tag ${full ? 'full' : ''}">${full ? 'Completo' : b.ownerUid === session.uid ? 'Tu tablero' : 'UPB'}</span></div><h3>${escape(b.title)}</h3><p class="board-course">${escape(b.course)}</p><p class="board-creator">${kind === 'teacher' ? 'Profesor' : 'Creado por'} · ${escape(b.ownerName)}</p><div class="board-card-footer"><span>${icon('users')}${count == null ? '…' : count}${kind === 'student' ? ' / 5 conectados' : ' conectados'}<small>${new Date(b.createdAt).toLocaleDateString('es-CO',{day:'numeric',month:'short',year:'numeric'})}</small></span><button class="board-button ${full ? '' : 'board-enter'}" type="button" data-board-open="${escape(b.id)}" ${full || joining ? 'disabled' : ''}>${full ? 'Sin cupo' : 'Entrar'} ${icon('right')}</button></div></article>`;
    }).join('') : `<div class="boards-empty">${icon(kind === 'teacher' ? 'board' : 'users')}<h3>${!loaded ? 'Cargando…' : directoryError ? 'No se pudo cargar esta sección' : matches.length || $(`[data-board-search="${kind}"]`).value || filter !== 'all' ? 'No hay coincidencias' : kind === 'teacher' ? 'La próxima clase empieza aquí' : 'Dale un espacio a tu grupo'}</h3><p>${directoryError ? 'Revisa las reglas y vuelve a abrir Tableros para reintentar.' : 'Crea un tablero o cambia la búsqueda y los filtros.'}</p>${profile.requestedRole === kind ? '<button type="button" class="board-button" data-board-create-empty>Crear tablero</button>' : ''}</div>`;
  }
  hydrateIcons(shell);
  for (const [id,stop] of countStops) if (!wanted.has(id)) { stop(); countStops.delete(id); }
  for (const id of wanted) if (!countStops.has(id)) {
    const item = items.find(b => b.id === id), path = item.kind === 'student' ? 'slots' : 'participants';
    // Register before attaching the listener so a callback cannot add it twice.
    countStops.set(id, () => {});
    const stop = onValue(ref(database,`boardData/${profile.university}/${id}/${path}`), snap => {
      const n = new Set(Object.values(snap.val() || {}).map(p => p.uid)).size;
      if (counts.get(id) !== n) { counts.set(id,n); renderCatalog(); }
    }, () => { counts.set(id,undefined); });
    countStops.set(id,stop);
  }
}
function showCreate() {
  const teacher = profile.requestedRole === 'teacher';
  $('#board-create-description').textContent = teacher ? 'Asigna el tablero a tu clase. Tus estudiantes podrán encontrarlo en UPB y pedir permiso para anotar.' : 'Crea un espacio compartido para estudiar con otras personas de UPB.';
  $('#board-create-capacity').textContent = teacher ? 'Clase · sin límite fijado por Risio' : 'Grupo · máximo 5 personas conectadas';
  $('#board-create-error').hidden = true; $('#board-create-form').reset(); $('#board-create-dialog').showModal(); $('#board-create-title').focus();
}
async function openRoom(meta) {
  joining = true; roomError(); previousStrokeState = ''; previousPeopleState = ''; previousChatState = ''; gesture = null;
  $('#boards-catalog').hidden = true; $('#board-room').hidden = false;
  $('#board-room-title').textContent = meta.title; $('#board-room-subtitle').textContent = `${meta.course} · ${meta.kind === 'teacher' ? 'Clase de ' : 'Grupo de '}${meta.ownerName} · UPB`;
  $('#board-people-search').value = ''; $('#board-chat-input').value = ''; $('#board-room-title').focus();
  try { await session.join(meta); } finally { joining = false; }
  window.scrollTo(0,0); updateRoom();
}
function drawStroke(stroke) {
  const value = parseStroke(stroke); if (!value) return;
  ctx.strokeStyle = value.color; ctx.fillStyle = value.color; ctx.lineWidth = value.width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const [first, ...points] = value.points;
  if (!points.length) { ctx.beginPath(); ctx.arc(first[0]*1600,first[1]*1000,value.width/2,0,Math.PI*2); ctx.fill(); return; }
  ctx.beginPath(); ctx.moveTo(first[0]*1600,first[1]*1000); for (const point of points) ctx.lineTo(point[0]*1600,point[1]*1000); ctx.stroke();
}
function repaint() { ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,1600,1000); for (const stroke of Object.values(session?.state.strokes || {})) drawStroke(stroke); if (gesture) drawStroke({pointsJson:JSON.stringify(gesture.points),color:gesture.color,width:gesture.width}); }
function updateRoom() {
  if (!session?.meta) return;
  const {state} = session, online = session.online && session.present;
  if (!session.canDraw && gesture) { gesture = null; repaint(); }
  $('#board-save-state').textContent = !session.online ? 'Sin conexión' : session.error ? 'No conectado al tablero' : !session.present ? 'Conectando…' : session.pending.size ? 'Guardando…' : 'Todo guardado';
  $('#board-save-state').dataset.state = online && !session.pending.size ? 'saved' : 'pending';
  if (session.error) roomError(session.error);
  $('#board-draw-status').textContent = !online ? 'Espera a conectar para participar.' : session.canDraw ? session.meta.kind === 'teacher' ? 'Tienes permiso para anotar.' : 'Todos los integrantes pueden anotar.' : 'Estás viendo la clase. Levanta la mano para pedir permiso.';
  $('#board-blank-help').textContent = session.canDraw ? 'Escribe o dibuja en este espacio.' : 'Los trazos de la clase aparecerán aquí.';
  canvas.classList.toggle('board-readonly', !session.canDraw);
  for (const el of shell.querySelectorAll('[data-board-color], #board-width, #board-undo')) el.disabled = !session.canDraw;
  $('#board-clear').hidden = !session.owner; $('#board-clear').disabled = !online;
  $('#board-hand').hidden = session.meta.kind !== 'teacher' || session.owner;
  $('#board-hand').disabled = !online; $('#board-hand').setAttribute('aria-pressed',String(Boolean(state.hands[session.uid])));
  $('#board-hand').innerHTML = iconMarkup('hand') + (state.hands[session.uid] ? ' Bajar la mano' : ' Levantar la mano');
  $('#board-chat-input').disabled = !online; $('#board-chat-form button').disabled = !online;
  const strokeState = JSON.stringify(state.strokes);
  if (strokeState !== previousStrokeState) { previousStrokeState = strokeState; repaint(); }
  $('#board-blank').hidden = Boolean(Object.keys(state.strokes).length || gesture);
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
  $('#board-people-count').textContent = `${people.length}${session.meta.kind === 'student' ? ' / 5' : ''}`;
  $('#board-people-list').innerHTML = people.filter(p => p.displayName.toLocaleLowerCase('es').includes(query)).map(p => {
    const owner = p.uid === session.meta.ownerUid, permitted = state.permissions[p.uid] || owner || session.meta.kind === 'student';
    return `<div class="board-person"><span class="board-avatar">${escape(p.displayName.slice(0,1).toUpperCase())}</span><div><strong>${escape(p.displayName)}${p.uid === session.uid ? ' (tú)' : ''}</strong><small>${state.hands[p.uid] ? 'Mano levantada' : owner ? session.meta.kind === 'teacher' ? 'Profesor · creador' : 'Creador del grupo' : permitted ? 'Puede anotar' : 'Observando'}</small></div>${session.owner && session.meta.kind === 'teacher' && !owner ? `<button class="board-permission" type="button" data-board-permit="${escape(p.uid)}" ${!session.online ? 'disabled' : ''}>${state.permissions[p.uid] ? 'Retirar permiso' : 'Permitir anotar'}</button>` : state.hands[p.uid] ? icon('hand') : ''}</div>`;
  }).join('') || '<p class="board-chat-empty">No hay participantes que coincidan.</p>';
  hydrateIcons($('#board-people-list'));
}
async function list() { await session.leave(); gesture = null; $('#board-room').hidden = true; $('#boards-catalog').hidden = false; renderCatalog(); $('#boards-title').focus(); }
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
  await session.leave(); for (const stop of countStops.values()) stop(); countStops.clear();
  directoryStop?.(); directoryStop = null; visible = false; document.body.classList.remove('boards-screen-open');
  $('#btn-home').click(); $('#btn-boards').focus();
}
$('#boards-home').addEventListener('click', event => perform(event.currentTarget, close));
$('#btn-boards').addEventListener('click', open); $('#account-boards').addEventListener('click', open);
$('#boards-create').addEventListener('click',showCreate); $('#board-create-close').addEventListener('click',() => $('#board-create-dialog').close());
$('#board-create-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = $('#board-create-submit'); if(button.disabled) return; button.disabled = true;
  $('#board-create-error').hidden = true;
  try { const data = new FormData(event.currentTarget), meta = await session.create(String(data.get('title')),String(data.get('course'))); $('#board-create-dialog').close(); await openRoom(meta); }
  catch(error) { $('#board-create-error').textContent = boardError(error); $('#board-create-error').hidden = false; }
  finally { button.disabled = false; }
});
shell.addEventListener('click', event => {
  const openButton = event.target.closest('[data-board-open]'); if (openButton) { const meta = items.find(b => b.id === openButton.dataset.boardOpen); if (meta) perform(openButton,() => openRoom(meta)); }
  const create = event.target.closest('[data-board-create-empty]'); if(create) showCreate();
  const more = event.target.closest('[data-board-more]'); if(more) { limits[more.dataset.boardMore] += 12; renderCatalog(); }
  const ink = event.target.closest('[data-board-color]'); if(ink) { color = ink.dataset.boardColor; for(const b of shell.querySelectorAll('[data-board-color]')) b.setAttribute('aria-pressed',String(b === ink)); }
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
$('#board-export').addEventListener('click',() => { repaint(); const link = document.createElement('a'); link.download = `Risio-tablero-${session.meta.id}.png`; link.href = canvas.toDataURL('image/png'); link.click(); });
function point(event) { const box = canvas.getBoundingClientRect(); return [Math.max(0,Math.min(1,(event.clientX-box.x)/box.width)),Math.max(0,Math.min(1,(event.clientY-box.y)/box.height))].map(n => Number(n.toFixed(5))); }
canvas.addEventListener('pointerdown',event => {
  if(!session?.canDraw || (event.pointerType === 'mouse' && event.button !== 0) || gesture) return;
  event.preventDefault(); canvas.setPointerCapture(event.pointerId);
  gesture = {pointer:event.pointerId,points:[point(event)],color,width:Number($('#board-width').value)}; $('#board-blank').hidden = true; repaint();
});
canvas.addEventListener('pointermove',event => { if(!gesture || gesture.pointer !== event.pointerId) return; const p = point(event), last = gesture.points.at(-1); if(Math.hypot(p[0]-last[0],p[1]-last[1]) > .001 && gesture.points.length < 2000) { gesture.points.push(p); repaint(); } });
canvas.addEventListener('pointerup',async event => {
  if(!gesture || gesture.pointer !== event.pointerId) return;
  const stroke = gesture; gesture = null;
  try { await session.stroke(stroke.points,stroke.color,stroke.width); } catch(error) { roomError(error); }
  repaint(); updateRoom();
});
canvas.addEventListener('pointercancel',() => { gesture = null; repaint(); updateRoom(); });
export const boards = {
  start(nextProfile) { if(profile) return; profile = nextProfile; session = new BoardSession(profile,updateRoom); },
  async leave() { if(session) await session.leave(); },
  open
};
