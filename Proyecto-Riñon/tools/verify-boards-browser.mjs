import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const {chromium} = createRequire(import.meta.url)('playwright');
const qa=mkdtempSync(join(tmpdir(),'risio-boards-qa-'))+'/';
const server=spawn(process.execPath,[fileURLToPath(new URL('../server.mjs',import.meta.url))],{env:{...process.env,PORT:'8085',RISIO_EMULATORS:'1'},stdio:'ignore'});
const url='http://127.0.0.1:8085',password='RisioTest123!';let browser;const errors=[];
async function createPerson(role,name){
 const email=`${role}-${Date.now()}@example.test`,endpoint='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/';
 const call=async(method,body)=>{const r=await fetch(endpoint+method+'?key=fake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;};
 const user=await call('accounts:signUp',{email,password,returnSecureToken:true});await call('accounts:sendOobCode',{requestType:'VERIFY_EMAIL',idToken:user.idToken});
 const codes=await(await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-risio/oobCodes')).json();await call('accounts:update',{oobCode:codes.oobCodes.find(c=>c.email===email).oobCode});
 const token=await call('accounts:signInWithPassword',{email,password,returnSecureToken:true});
 const response=await fetch(`http://127.0.0.1:9000/profiles/${user.localId}.json?ns=demo-risio&auth=${token.idToken}`,{method:'PUT',body:JSON.stringify({displayName:name,university:'UPB',requestedRole:role,...(role==='student'?{semester:3}:{}),createdAt:Date.now()-10,updatedAt:Date.now()-10})});assert.equal(response.status,200,await response.text());
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.locator('#login-form [name=email]').fill(email);await page.locator('#login-form [name=password]').fill(password);await page.locator('#login-form [type=submit]').click();await page.waitForFunction(()=>Boolean(window.atlasRenal));
 await page.locator('#btn-boards').click();await page.locator('#boards-title').waitFor({state:'visible'});return {page,context};
}
async function createBoard(page,title){await page.locator('#boards-create').click();await page.locator('#board-create-title').fill(title);await page.locator('#board-create-form [name=course]').fill('Fisiología renal · Grupo 01');await page.locator('#board-create-submit').click();await page.getByText('Todo guardado',{exact:true}).waitFor();assert.equal(await page.locator('#board-room-title').textContent(),title);}
async function draw(page){const box=await page.locator('#board-canvas').boundingBox();await page.mouse.move(box.x+box.width*.2,box.y+box.height*.2);await page.mouse.down();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.4,{steps:8});await page.mouse.up();await page.waitForFunction(()=>document.querySelector('#board-blank').hidden);await page.getByText('Todo guardado',{exact:true}).waitFor();}
try{
 for(let i=0;i<40;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.RISIO_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const teacher=await createPerson('teacher','Profesora de prueba'),student=await createPerson('student','Estudiante de prueba'),t=teacher.page,s=student.page;
 await createBoard(t,'Fisiología · Clase compartida');await draw(t);console.log('QA: clase creada y dibujada');
 await s.locator('[data-board-search=teacher]').fill('clase compartida');await s.locator('[data-board-kind=teacher] [data-board-open]').click();await s.getByText('Todo guardado',{exact:true}).waitFor();assert.equal(await s.locator('#board-width').isDisabled(),true);await s.waitForFunction(()=>document.querySelector('#board-blank').hidden);
 await s.locator('#board-hand').click();await t.getByText('Mano levantada',{exact:true}).waitFor();await t.locator('#board-hand-alerts').waitFor({state:'visible'});await t.locator('#board-hand-alerts [data-board-grant]').click();await s.waitForFunction(()=>!document.querySelector('#board-width').disabled);await draw(s);
 // A remote canvas receives a stroke before pointerup.
 const liveBox=await t.locator('#board-canvas').boundingBox();await t.mouse.move(liveBox.x+liveBox.width*.6,liveBox.y+liveBox.height*.6);await t.mouse.down();await t.mouse.move(liveBox.x+liveBox.width*.8,liveBox.y+liveBox.height*.7,{steps:6});
 await s.waitForFunction(async()=>{const {database}=await import('./firebase-client.js');const {ref,get}=await import('./vendor/firebase-sdk.js');const meta=document.querySelector('#board-room-title').textContent;const boards=(await get(ref(database,'boardDirectory/UPB'))).val();const id=Object.keys(boards).find(id=>boards[id].title===meta);return (await get(ref(database,`boardData/UPB/${id}/live`))).exists();});await t.mouse.up();
 await s.locator('#board-color').fill('#ed7a35');await s.locator('#board-color').dispatchEvent('input');
 await s.locator('[data-board-tool=text]').click();const textBox=await s.locator('#board-canvas').boundingBox();await s.mouse.click(textBox.x+textBox.width*.2,textBox.y+textBox.height*.55);await s.locator('#board-text-value').fill('Reabsorción de glucosa');await s.locator('#board-text-form [type=submit]').click();await s.locator('#board-text-dialog').waitFor({state:'hidden'});
 await t.locator('[data-board-tool=highlighter]').click();const teacherBox=await t.locator('#board-canvas').boundingBox();await t.mouse.click(teacherBox.x+teacherBox.width*.21,teacherBox.y+teacherBox.height*.56);
 assert.equal(await t.locator('#board-color').isDisabled(),true);
 await s.locator('#board-chat-input').fill('¿Repasamos la filtración?');await s.locator('#board-chat-form button').click();await t.getByText('¿Repasamos la filtración?',{exact:true}).waitFor();await t.getByRole('button',{name:'Retirar permiso',exact:true}).click();await s.waitForFunction(()=>document.querySelector('#board-width').disabled);console.log('QA: sincronización, chat y permisos');
 await t.screenshot({path:qa+'class-desktop.png',fullPage:true});await s.locator('#board-back-list').click();await createBoard(s,'Repaso renal · Estudiantes');await s.locator('[data-board-tool=pen]').click();await draw(s);await s.locator('#board-back-list').click();
 await s.locator('[data-board-search=student]').fill('sin coincidencias');assert.equal(await s.locator('[data-board-kind=student] .board-card').count(),0);await s.locator('[data-board-search=student]').fill('repaso renal');await s.locator('[data-board-filter=student]').selectOption('mine');assert.equal(await s.locator('[data-board-kind=student] .board-card').count(),1);
 await s.screenshot({path:qa+'catalog-desktop.png',fullPage:true});await s.setViewportSize({width:390,height:844});assert.equal(await s.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await s.screenshot({path:qa+'catalog-mobile.png',fullPage:true});
 await s.locator('[data-board-kind=student] [data-board-open]').click();await s.getByText('Todo guardado',{exact:true}).waitFor();await s.waitForFunction(()=>document.querySelector('#board-blank').hidden);assert.equal(await s.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await s.screenshot({path:qa+'room-mobile.png',fullPage:true});
 await s.locator('#board-delete').click();await s.locator('#board-delete-confirm').click();await s.locator('#boards-catalog').waitFor({state:'visible'});assert.equal(await s.locator('[data-board-kind=student] .board-card').count(),0);await s.locator('#boards-home').click();await s.locator('#btn-boards').waitFor({state:'visible'});await t.locator('#board-back-list').click();await t.locator('#boards-home').click();assert.deepEqual(errors,[]);
 console.log('OK browser: creación profesor/estudiante, lienzo sincronizado, mano, permiso/revocación, chat, búsqueda, filtros, persistencia al reabrir, navegación y móvil sin desbordamiento ni errores JS.');
}finally{await browser?.close();server.kill('SIGTERM');}
