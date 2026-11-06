import {auth, database, withTimeout} from './firebase-client.js';
import {get, ref, serverTimestamp, set} from './vendor/firebase-sdk.js';
import {gradeWorkshop, renalBook, workshops} from './renal-assessments.js';

const $ = id => document.getElementById(id);
const panel = $('library-assessments');
const catalog = $('assessment-catalog');
const detail = $('assessment-detail');
const form = $('assessment-form');
const result = $('assessment-result');
const status = $('assessment-status');
const loadRetry = $('assessment-retry-load');
let selection = null;
let saving = false;

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function readingLink(page, label) {
  const link = node('button', label, 'assessment-reference');
  link.type = 'button';
  link.dataset.renalPage = page;
  link.setAttribute('aria-haspopup', 'dialog');
  return link;
}

function focus(element) {
  if (!panel.hidden && document.body.classList.contains('library-screen-open')) element.focus();
}

function renderForm(workshop) {
  const questions = workshop.questions.map((question, index) => {
    const group = node('fieldset', '', 'assessment-question');
    group.append(node('legend', `${index + 1}. ${question.prompt}`));
    group.append(readingLink(question.page, `Consultar página ${question.page} del PDF`));
    question.options.forEach((option, value) => {
      const label = node('label', '', 'assessment-option');
      const radio = node('input');
      radio.type = 'radio';
      radio.name = 'q' + (index + 1);
      radio.value = value;
      radio.required = true;
      label.append(radio, node('span', option));
      group.append(label);
    });
    return group;
  });
  $('assessment-questions').replaceChildren(...questions);
  status.textContent = '';
  result.hidden = true;
  form.hidden = false;
}

function renderResult(workshop, answers) {
  const {correct, total, percent} = gradeWorkshop(workshop, answers);
  $('assessment-result-count').textContent = `${correct} de ${total} respuestas correctas`;
  $('assessment-percent').textContent = `${percent} %`;
  const fill = $('assessment-kidney-fill');
  const height = 136 * percent / 100;
  fill.setAttribute('y', 137 - height);
  fill.setAttribute('height', height);
  const review = workshop.questions.map((question, index) => {
    const answer = answers['q' + (index + 1)];
    const right = answer === question.correct;
    const item = node('li', '', 'assessment-review-item');
    item.dataset.correct = String(right);
    item.append(
      node('p', right ? 'Correcta' : 'Incorrecta', 'assessment-verdict'),
      node('h4', `${index + 1}. ${question.prompt}`),
      node('p', `Tu respuesta · ${question.options[answer]}`)
    );
    if (!right) item.append(node('p', `Respuesta correcta · ${question.options[question.correct]}`));
    item.append(node('p', question.explanation), readingLink(question.page, `Revisar página ${question.page} del PDF`));
    return item;
  });
  $('assessment-review').replaceChildren(...review);
  form.hidden = true;
  result.hidden = false;
}

async function openWorkshop(workshop, trigger) {
  const uid = auth.currentUser?.uid;
  if (!uid || saving) return;
  const current = {workshop, uid, trigger, ref: ref(database, `assessmentAttempts/${uid}/${workshop.id}`)};
  selection = current;
  catalog.hidden = true;
  detail.hidden = false;
  form.hidden = true;
  result.hidden = true;
  loadRetry.hidden = true;
  $('assessment-title').textContent = workshop.title;
  $('assessment-description').textContent = `Capítulo ${workshop.chapter} · ${workshop.questions.length} preguntas · ${workshop.summary}`;
  const reading = $('assessment-reading');
  reading.dataset.renalPage = workshop.pages[0];
  reading.textContent = `${renalBook.title} · ${renalBook.author} · páginas ${workshop.pages.join('–')} del PDF`;
  status.textContent = 'Cargando tu último intento…';
  focus($('assessment-title'));
  try {
    const snapshot = await withTimeout(get(current.ref));
    if (selection !== current || auth.currentUser?.uid !== uid) return;
    if (snapshot.exists()) {
      renderResult(workshop, snapshot.val().answers);
      status.textContent = 'Último intento guardado en tu cuenta.';
    } else renderForm(workshop);
  } catch (error) {
    if (selection !== current || auth.currentUser?.uid !== uid) return;
    status.textContent = accessMessage(error, 'No se pudo cargar tu último intento. Revisa tu conexión y vuelve a intentar.');
    loadRetry.hidden = false;
  }
}

function accessMessage(error, fallback) {
  return /permission.denied/i.test(error.code || error.message || '')
    ? 'Firebase rechazó el acceso. Publica las reglas actualizadas de Realtime Database.'
    : fallback;
}

const back = $('assessment-back');
back.addEventListener('click', () => {
  const trigger = selection?.trigger;
  selection = null;
  detail.hidden = true;
  catalog.hidden = false;
  focus(trigger || $('assessment-catalog-title'));
});

loadRetry.addEventListener('click', () => {
  if (selection) openWorkshop(selection.workshop, selection.trigger);
});

$('assessment-repeat').addEventListener('click', () => {
  if (!selection) return;
  renderForm(selection.workshop);
  focus(form.querySelector('input'));
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const current = selection;
  if (saving || !current || auth.currentUser?.uid !== current.uid || !form.reportValidity()) return;
  const answers = Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, Number(value)]));
  saving = true;
  const controls = [...form.querySelectorAll('button, input'), back];
  controls.forEach(control => control.disabled = true);
  status.textContent = 'Guardando tu intento…';
  try {
    await withTimeout(set(current.ref, {answers, submittedAt: serverTimestamp()}));
    if (selection !== current || auth.currentUser?.uid !== current.uid) return;
    renderResult(current.workshop, answers);
    status.textContent = 'Intento guardado en tu cuenta.';
    focus($('assessment-result-title'));
  } catch (error) {
    if (selection !== current || auth.currentUser?.uid !== current.uid) return;
    status.textContent = accessMessage(error, 'No se pudo confirmar el guardado. Tus selecciones siguen aquí. Vuelve a entregar el taller.');
  } finally {
    saving = false;
    controls.forEach(control => control.disabled = false);
  }
});

for (const workshop of workshops) {
  const card = node('article', '', 'assessment-card');
  const title = node('h3', workshop.title);
  const launch = node('button', 'Abrir taller', 'assessment-button');
  launch.type = 'button';
  launch.setAttribute('aria-label', `Abrir taller de ${workshop.title}`);
  launch.addEventListener('click', () => openWorkshop(workshop, launch));
  card.append(node('p', `Capítulo ${workshop.chapter} · páginas ${workshop.pages.join('–')}`, 'assessment-chapter'),
    title, node('p', workshop.summary), launch);
  $('assessment-cards').append(card);
}
