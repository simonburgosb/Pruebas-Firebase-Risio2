import {auth, database, emulatorMode, withTimeout} from './firebase-client.js';
import {setPersistence, browserLocalPersistence, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, updateProfile,
  reload, getIdToken, signOut, ref, get, set, serverTimestamp} from './vendor/firebase-sdk.js';
import {notes} from './account-notes.js';
import {hydrateIcons} from './icons.js';
import {boards} from './boards.js';

const $ = s => document.querySelector(s);
const gate = $('#auth-gate'), app = $('#app'), message = $('#auth-message');
let actionBusy = false, opening = false, modulesLoaded = false, currentProfile = null;
let view = 'login', resendAfter = 0;
const humanErrors = {
  'auth/invalid-credential': 'El correo o la contraseña no coinciden.',
  'auth/user-not-found': 'El correo o la contraseña no coinciden.',
  'auth/wrong-password': 'El correo o la contraseña no coinciden.',
  'auth/invalid-email': 'Revisa el formato de tu correo electrónico.',
  'auth/email-already-in-use': 'Ese correo ya está registrado. Inicia sesión o recupera tu contraseña.',
  'auth/weak-password': 'Usa una contraseña de al menos 8 caracteres.',
  'auth/password-does-not-meet-requirements': 'La contraseña no cumple la política configurada para Risio.',
  'auth/too-many-requests': 'Hay demasiados intentos. Espera unos minutos y vuelve a intentarlo.',
  'auth/network-request-failed': 'No fue posible conectar. Revisa tu conexión a internet.',
  'auth/operation-not-allowed': 'Activa Correo/Contraseña en Firebase Authentication para usar el registro.',
  'auth/unauthorized-domain': 'Este dominio debe añadirse a los dominios autorizados de Firebase Authentication.',
  'auth/invalid-api-key': 'La configuración de Firebase no fue aceptada. Revisa la clave del proyecto.',
  'auth/user-disabled': 'Esta cuenta está deshabilitada. Contacta al equipo de Risio.',
  'PERMISSION_DENIED': 'Firebase rechazó el acceso. Publica las reglas de database.rules.json en Realtime Database.'
};
function showMessage(text = '', error = false) {
  message.textContent = text; message.dataset.error = String(error); message.hidden = !text;
}
function errorMessage(error) { return humanErrors[error.code] || (/permission_denied/i.test(error.message || '') ? humanErrors.PERMISSION_DENIED : error.message || 'No se pudo completar la operación. Inténtalo de nuevo.'); }
function screen(name, text = '') {
  view = name;
  for (const item of document.querySelectorAll('[data-auth-view]')) item.hidden = item.dataset.authView !== name;
  gate.hidden = false; app.inert = true; app.setAttribute('aria-hidden', 'true');
  document.body.classList.add('auth-locked');
  showMessage(text);
  gate.querySelector(`[data-auth-view="${name}"] h1`)?.focus({preventScroll: true});
}
function profileFields(form) {
  const data = new FormData(form), role = data.get('role'), university = data.get('university');
  const displayName = String(data.get('displayName') || '').trim();
  if (displayName.length < 2 || displayName.length > 80) throw new Error('Escribe tu nombre, entre 2 y 80 caracteres.');
  if (university !== 'UPB' || !['student', 'teacher'].includes(role)) throw new Error('Selecciona UPB y tu perfil.');
  const semester = role === 'student' ? Number(data.get('semester')) : null;
  if (role === 'student' && (!Number.isInteger(semester) || semester < 1 || semester > 12)) throw new Error('Selecciona el semestre que estás cursando.');
  return {displayName, university, requestedRole: role, ...(semester ? {semester} : {})};
}
function validProfile(profile) {
  return profile?.university === 'UPB' && typeof profile.displayName === 'string' && profile.displayName.trim().length >= 2 &&
    ['student', 'teacher'].includes(profile.requestedRole) && (profile.requestedRole === 'teacher' || (Number.isInteger(profile.semester) && profile.semester >= 1 && profile.semester <= 12));
}
async function saveProfile(form) {
  const profile = profileFields(form);
  await withTimeout(set(ref(database, `profiles/${auth.currentUser.uid}`), {...profile, createdAt: serverTimestamp(), updatedAt: serverTimestamp()}));
  return profile;
}
function verifiedScreen(text = '') {
  $('#verify-email').textContent = auth.currentUser?.email || '';
  screen('verify', text);
}
async function openApplication(profile) {
  if (opening) return;
  opening = true;
  try {
    currentProfile = profile;
    $('#account-name').textContent = profile.displayName;
    $('#account-details').textContent = profile.requestedRole === 'student' ? `UPB · Estudiante · Semestre ${profile.semester}` : 'UPB · Profesor';
    $('#account-email').textContent = auth.currentUser.email;
    $('#account-professor-notice').hidden = profile.requestedRole !== 'teacher';
    await notes.start(auth.currentUser.uid);
    boards.start(profile);
    // El visor necesita sus dimensiones reales al construir la cámara.
    gate.hidden = true; document.body.classList.remove('auth-locked');
    app.inert = false; app.removeAttribute('aria-hidden');
    if (!modulesLoaded) {
      await Promise.all([import('./library.js'), import('./main.js')]);
      modulesLoaded = true;
    }
    $('#btn-account').focus({preventScroll: true});
  } catch (error) { screen('connection'); showMessage(errorMessage(error), true); }
  finally { opening = false; }
}
async function routeUser(user) {
  if (actionBusy) return;
  if (!user) { screen('login'); return; }
  if (!user.emailVerified) { verifiedScreen(); return; }
  screen('loading');
  try {
    await withTimeout(getIdToken(user, true));
    const snapshot = await withTimeout(get(ref(database, `profiles/${user.uid}`)));
    if (auth.currentUser?.uid !== user.uid) return;
    const profile = snapshot.val();
    if (!validProfile(profile)) { screen('profile'); return; }
    await openApplication(profile);
  } catch (error) { screen('connection'); showMessage(errorMessage(error), true); }
}
async function perform(button, action) {
  if (actionBusy) return;
  actionBusy = true; showMessage();
  const label = button.textContent; button.disabled = true; button.setAttribute('aria-busy', 'true'); button.textContent = 'Un momento…';
  try { await action(); }
  catch (error) { showMessage(errorMessage(error), true); }
  finally { actionBusy = false; button.disabled = false; button.removeAttribute('aria-busy'); button.textContent = label; }
}
function formHandler(id, action) {
  const form = $(id);
  form.addEventListener('submit', event => { event.preventDefault(); perform(form.querySelector('[type=submit]'), () => action(form)); });
}
for (const button of document.querySelectorAll('[data-auth-go]')) button.addEventListener('click', () => screen(button.dataset.authGo));
for (const form of document.querySelectorAll('[data-profile-form]')) {
  const university = form.elements.university, role = form.elements.role, semester = form.elements.semester;
  const update = () => {
    role.disabled = university.value !== 'UPB';
    if (role.disabled) role.value = '';
    const student = role.value === 'student' && !role.disabled;
    semester.disabled = !student; semester.required = student;
    form.querySelector('[data-semester-field]').hidden = !student;
    if (!student) semester.value = '';
  };
  university.addEventListener('change', update); role.addEventListener('change', update); update();
}
formHandler('#login-form', async form => {
  const result = await signInWithEmailAndPassword(auth, form.elements.email.value.trim(), form.elements.password.value);
  form.elements.password.value = '';
  actionBusy = false; await routeUser(result.user); actionBusy = true;
});
formHandler('#register-form', async form => {
  profileFields(form);
  const password = form.elements.password.value;
  if (password.length < 8) throw new Error('Usa una contraseña de al menos 8 caracteres.');
  if (password !== form.elements.passwordConfirm.value) throw new Error('Las contraseñas no coinciden.');
  const {user} = await createUserWithEmailAndPassword(auth, form.elements.email.value.trim(), password);
  // Si falla el perfil, la cuenta se conserva y puede completarse al verificar.
  let profileError = null;
  try { await saveProfile(form); await updateProfile(user, {displayName: form.elements.displayName.value.trim()}); }
  catch (error) { profileError = error; }
  form.elements.password.value = ''; form.elements.passwordConfirm.value = '';
  verifiedScreen();
  try { await sendEmailVerification(user); resendAfter = Date.now() + 60000; }
  catch (error) { showMessage(`Tu cuenta se creó, pero no pudimos enviar el correo. ${errorMessage(error)} Usa Reenviar verificación.`, true); return; }
  showMessage(profileError ? `Te enviamos la verificación. Completarás el perfil después. ${errorMessage(profileError)}` : 'Te enviamos un enlace. Revisa tu bandeja de entrada y la carpeta de correo no deseado.', Boolean(profileError));
});
formHandler('#reset-form', async form => {
  try { await sendPasswordResetEmail(auth, form.elements.email.value.trim()); }
  catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
  showMessage('Si existe una cuenta con ese correo, recibirás un enlace para cambiar la contraseña. Revisa también el correo no deseado.');
});
formHandler('#profile-form', async form => {
  const profile = await saveProfile(form); await openApplication(profile);
});
$('#verify-refresh').addEventListener('click', event => perform(event.currentTarget, async () => {
  const user = auth.currentUser;
  if (!user) { screen('login'); return; }
  await withTimeout(reload(user));
  if (!user.emailVerified) { verifiedScreen('Tu correo aún no aparece verificado. Abre primero el enlace que recibiste.'); return; }
  actionBusy = false; await routeUser(user); actionBusy = true;
}));
$('#verify-resend').addEventListener('click', event => perform(event.currentTarget, async () => {
  if (Date.now() < resendAfter) throw new Error(`Espera ${Math.ceil((resendAfter - Date.now()) / 1000)} segundos antes de pedir otro correo.`);
  await sendEmailVerification(auth.currentUser); resendAfter = Date.now() + 60000;
  showMessage('Te enviamos un nuevo enlace de verificación.');
}));
for (const button of document.querySelectorAll('[data-auth-signout]')) button.addEventListener('click', () => perform(button, async () => {
  await boards.leave(); await signOut(auth); notes.stop(); location.reload();
}));
$('#auth-retry').addEventListener('click', event => perform(event.currentTarget, async () => {
  actionBusy = false; await routeUser(auth.currentUser); actionBusy = true;
}));
const accountDialog = $('#account-dialog');
$('#btn-account').addEventListener('click', () => { $('#account-dialog-message').textContent = ''; accountDialog.showModal(); });
$('#account-close').addEventListener('click', () => accountDialog.close());
$('#account-logout').addEventListener('click', async event => {
  event.currentTarget.disabled = true;
  window.dispatchEvent(new Event('risio-finish-annotations'));
  $('#account-dialog-message').textContent = notes.pending ? 'Guardando tus cambios pendientes…' : '';
  try { await withTimeout(notes.flush(), 'Hay cambios pendientes. Revisa la conexión y vuelve a cerrar sesión.', 12000);
    if (notes.pending) throw new Error('Tus anotaciones siguen pendientes de sincronizar. Revisa la conexión y vuelve a intentarlo.');
    await boards.leave(); await signOut(auth); notes.stop(); location.reload();
  } catch (error) { $('#account-dialog-message').textContent = errorMessage(error); event.currentTarget.disabled = false; }
});
// Los cambios de sesión en otra pestaña borran el visor y sus notas de memoria.
onAuthStateChanged(auth, user => {
  if (modulesLoaded && (!user || notes.uid !== user.uid || !user.emailVerified)) { location.reload(); return; }
  routeUser(user);
});
hydrateIcons();
if (emulatorMode) { $('#auth-environment').hidden = false; }
try { await setPersistence(auth, browserLocalPersistence); }
catch { showMessage('Este navegador no permite conservar la sesión. Podrás ingresar de nuevo con tu correo.'); }
