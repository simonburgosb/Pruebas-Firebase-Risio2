// Se ejecuta exclusivamente contra los emuladores demo-risio.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const {chromium} = createRequire(import.meta.url)('playwright');
const qaDirectory = mkdtempSync(join(tmpdir(), 'risio-qa-'));
const server = spawn(process.execPath, [fileURLToPath(new URL('../server.mjs', import.meta.url))],
  {env: {...process.env, PORT: '8085', RISIO_EMULATORS: '1'}, stdio: 'ignore'});
let browser;
const url = 'http://127.0.0.1:8085';
async function oob(email, type) {
  console.log('QA: recuperar enlace', type);
  const data = await (await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-risio/oobCodes')).json();
  const found = data.oobCodes.filter(code => code.email === email && code.requestType === type).at(-1);
  assert.ok(found, `Se generó ${type}`); return found;
}
async function verify(email) {
  console.log('QA: verificar correo');
  const code = await oob(email, 'VERIFY_EMAIL');
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=fake',
    {method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({oobCode: code.oobCode})});
  assert.equal(response.status, 200);
}
try {
  for (let i=0;i<50;i++) { try { if ((await fetch(url)).ok) break; } catch {} await new Promise(r => setTimeout(r,100)); }
  browser = await chromium.launch({headless: true, executablePath: process.env.RISIO_CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
  const page = await context.newPage(); page.setDefaultTimeout(30000); const errors = [];
  page.on('pageerror', e => {errors.push(e.message); console.log('QA pageerror:', e.message);});
  page.on('console', msg => {if(msg.type()==='error')console.log('QA console:',msg.text());});
  await page.goto(url); await page.locator('[data-auth-view=login]').waitFor({state:'visible'});
  assert.equal(await page.locator('#app').isVisible(), false);
  await page.getByRole('button', {name:'Crear cuenta', exact:true}).click();
  const form = page.locator('#register-form');
  assert.ok(await form.locator('[name=role]').isDisabled());
  await form.locator('[name=displayName]').fill('Estudiante de prueba');
  await form.locator('[name=university]').selectOption('UPB');
  await form.locator('[name=role]').selectOption('teacher');
  assert.equal(await form.locator('[data-semester-field]').isVisible(), false);
  await form.locator('[name=role]').selectOption('student');
  await form.locator('[name=semester]').selectOption('3');
  const email = `student-${Date.now()}@example.test`, password = 'RisioTest123!';
  await form.locator('[name=email]').fill(email);
  await form.locator('[name=password]').fill(password); await form.locator('[name=passwordConfirm]').fill(password);
  await form.locator('[type=submit]').click();
  await page.locator('[data-auth-view=verify]').waitFor({state:'visible'});
  await page.waitForFunction(() => !document.querySelector('#register-form [type=submit]').disabled);
  assert.equal(await page.locator('#app').isVisible(), false);
  console.log('QA: comprobar sin verificar');
  await page.locator('#verify-refresh').click();
  await page.getByText('Tu correo aún no aparece verificado.', {exact:false}).waitFor();
  console.log('QA: bloqueo confirmado');
  await verify(email); await page.locator('#verify-refresh').click();
  console.log('QA: entrar app');
  await page.locator('#app').waitFor({state:'visible', timeout:30000});
  console.log('QA: app visible');
  await page.waitForFunction(() => Boolean(window.atlasRenal) || !document.querySelector('[data-auth-view=connection]').hidden, null, {timeout:30000});
  console.log('QA: resultado entrada:', await page.locator('#auth-message').textContent());
  assert.ok(await page.evaluate(() => Boolean(window.atlasRenal)), 'El visor debe inicializarse');
  await page.locator('#account-sync').getByText('Anotaciones sincronizadas').waitFor();
  console.log('QA: visor cargado');
  // Dibujar en el visor real y comprobar persistencia en una sesión nueva.
  await page.locator('[data-home-tab="1"]').click();
  await page.locator('#btn-draw').click();
  const canvas = page.locator('#annotation-canvas'); const box = await canvas.boundingBox();
  await page.mouse.move(box.x+box.width*.2,box.y+box.height*.3); await page.mouse.down();
  await page.mouse.move(box.x+box.width*.4,box.y+box.height*.4,{steps:8}); await page.mouse.up();
  await page.waitForFunction(async () => {
    const {notes} = await import('./account-notes.js'); return !notes.pending && notes.read('viewer:anatomy:kidney').length > 0;
  });
  console.log('QA: trazo 3D guardado');
  const otherDevice = await browser.newContext({viewport:{width:1440,height:1000}});
  const other = await otherDevice.newPage(); other.setDefaultTimeout(30000); await other.goto(url);
  await other.locator('[data-auth-view=login]').waitFor({state:'visible'});
  await other.locator('#login-form [name=email]').fill(email); await other.locator('#login-form [name=password]').fill(password);
  await other.locator('#login-form [type=submit]').click(); await other.locator('#app').waitFor({state:'visible'});
  await other.waitForFunction(async () => (await import('./account-notes.js')).notes.read('viewer:anatomy:kidney').length > 0);
  assert.equal(await other.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('risio:notes:v1:'))), true);
  console.log('QA: segundo dispositivo sincronizado');
  // Esquemas: segunda capa real de anotación en la biblioteca.
  await page.locator('#btn-home').click(); await page.locator('#btn-library').click();
  await page.locator('[data-library-tab=diagrams]').click();
  await page.locator('#library-diagram-list button').first().click();
  await page.locator('#library-reader-annotate').click();
  const inkBox = await page.locator('#library-reader-ink').boundingBox();
  await page.mouse.move(inkBox.x+50,inkBox.y+50); await page.mouse.down();
  await page.mouse.move(inkBox.x+100,inkBox.y+100,{steps:5}); await page.mouse.up();
  await page.waitForFunction(async () => {const {notes} = await import('./account-notes.js'); return !notes.pending && notes.read('library:image:anatomia-renal:1').length > 0;});
  await other.waitForFunction(async () => (await import('./account-notes.js')).notes.read('library:image:anatomia-renal:1').length > 0);
  console.log('QA: biblioteca guardada');
  // Capturas solo para QA interna; nunca se entregan con datos de usuarios.
  await page.locator('#library-reader-close').click();
  await page.locator('#btn-account').click(); await page.locator('#account-logout').click();
  await page.locator('[data-auth-view=login]').waitFor({state:'visible'});
  await page.getByRole('button',{name:'Olvidé mi contraseña'}).click();
  await page.locator('#reset-form [name=email]').fill(email); await page.locator('#reset-form [type=submit]').click();
  await page.getByText('Si existe una cuenta con ese correo', {exact:false}).waitFor();
  await oob(email, 'PASSWORD_RESET');
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Volver a iniciar sesión'}).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({path:join(qaDirectory, 'login-mobile.png'), fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:join(qaDirectory, 'login-desktop.png'),fullPage:true});
  assert.deepEqual(errors, []);
  await otherDevice.close(); await context.close();
  console.log('OK: registro UPB/roles/semestre, bloqueo sin verificación, correo real del emulador, login, dibujo 3D y biblioteca, sincronización entre dispositivos, logout, recuperación y móvil; sin errores JavaScript.');
} catch(error) { console.error('QA FAILED:', error); throw error; }
finally { await Promise.race([browser?.close(), new Promise(resolve => setTimeout(resolve,5000))]); server.kill('SIGTERM'); }
