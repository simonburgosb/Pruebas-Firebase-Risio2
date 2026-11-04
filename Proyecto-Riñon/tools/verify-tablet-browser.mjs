import fs from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {chromium} from 'playwright';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
const server=spawn(process.execPath,[fileURLToPath(new URL('../server.mjs',import.meta.url))],{env:{...process.env,PORT:'8088',RISIO_EMULATORS:'1'},stdio:'ignore'});let browser;
try{
 for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:8088/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:process.env.RISIO_CHROMIUM_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],headless:true});
 const context=await browser.newContext({viewport:{width:1024,height:640},hasTouch:true,isMobile:true,deviceScaleFactor:1}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/account-notes.js',r=>r.fulfill({contentType:'text/javascript',body:`const map=new Map();window.tabletNotes={map,saves:0};export const notes={subscribe:()=>{},read:k=>structuredClone(map.get(k)||[]),save:(k,v)=>{window.tabletNotes.saves++;map.set(k,structuredClone(v));}};`}));
 await page.route('**/firebase-client.js',r=>r.fulfill({contentType:'text/javascript',body:`export const auth={currentUser:{uid:'tablet'}};export const database={};export const withTimeout=p=>p;`}));
 await page.route('**/vendor/firebase-sdk.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(new URL('./tablet-firebase-fixture.mjs',import.meta.url),'utf8')}));
 await page.route('**/auth-ui.js',r=>r.fulfill({contentType:'text/javascript',body:`document.querySelector('#auth-gate').hidden=true;document.body.classList.remove('auth-locked');document.querySelector('#app').inert=false;document.querySelector('#app').removeAttribute('aria-hidden');await Promise.all([import('./main.js'),import('./library.js')]);const {boards}=await import('./boards.js');boards.start({displayName:'Prueba tablet',university:'UPB',requestedRole:'student'});window.tabletReady=true;`}));
 await page.goto('http://127.0.0.1:8088/');await page.waitForFunction(()=>window.tabletReady,{timeout:90000});
 await page.locator('#account-bar .theme-toggle').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 await page.reload();await page.waitForFunction(()=>window.tabletReady);assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 await page.locator('[data-home-tab="1"]').click();await page.locator('#btn-draw').click();
 const cdp=await context.newCDPSession(page);let box=await page.locator('#annotation-canvas').boundingBox();
 const pt=(id,x,y)=>({id,x:box.x+box.width*x,y:box.y+box.height*y}),touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 await touch('touchStart',[pt(1,.3,.4)]);await touch('touchMove',[pt(1,.4,.5)]);await touch('touchEnd',[]);
 const saves=await page.evaluate(()=>window.tabletNotes.saves);assert.ok(saves>0);
 await touch('touchStart',[pt(1,.35,.5)]);await touch('touchStart',[pt(1,.35,.5),pt(2,.55,.5)]);await touch('touchMove',[pt(1,.25,.45),pt(2,.65,.55)]);await touch('touchEnd',[pt(1,.25,.45)]);await touch('touchMove',[pt(1,.2,.4)]);await touch('touchEnd',[]);
 assert.equal(await page.evaluate(()=>window.tabletNotes.saves),saves,'Pinch must not persist a stroke');assert.match(await page.locator('#annotation-canvas').evaluate(el=>el.style.transform),/scale\(2/);
 await page.locator('#model-stage .ink-reset').click();assert.match(await page.locator('#annotation-canvas').evaluate(el=>el.style.transform),/scale\(1\)/);
 // Stylus contact rejects a simultaneous palm/finger without losing the pen stroke.
 box=await page.locator('#annotation-canvas').boundingBox();
 const pen=async(type,x,y)=>cdp.send('Input.dispatchMouseEvent',{type,pointerType:'pen',button:type==='mouseMoved'?'none':'left',buttons:type==='mouseReleased'?0:1,x:box.x+box.width*x,y:box.y+box.height*y,force:.5});
 const beforePen=await page.evaluate(()=>window.tabletNotes.saves);
 await pen('mousePressed',.3,.4);await touch('touchStart',[pt(10,.6,.6)]);await pen('mouseMoved',.4,.5);await pen('mouseReleased',.4,.5);await touch('touchEnd',[]);
 assert.equal(await page.evaluate(()=>window.tabletNotes.saves),beforePen+1,'Pen saves once; palm creates no extra stroke');
 for(const size of [{width:1024,height:600},{width:768,height:900},{width:820,height:680}]){
  await page.setViewportSize(size);
  for(const tab of ['1','2','3']){await page.locator(`.tab-btn[data-tab="${tab}"]`).click();await page.waitForTimeout(150);const rect=await page.locator('#model-stage').boundingBox();assert.ok(rect.height>100 && rect.y>=0 && rect.y+rect.height<=size.height+2,`Viewer ${size.width}x${size.height}, tab ${tab}: ${JSON.stringify(rect)}`);}
 }
 await page.setViewportSize({width:1024,height:640});await page.locator('.tab-btn[data-tab="3"]').click();await page.screenshot({path:join(tmpdir(),'risio-tablet-dark-filtration.png')});
 await page.locator('#account-bar .theme-toggle').click();await page.waitForTimeout(300);await page.screenshot({path:join(tmpdir(),'risio-tablet-light-filtration.png')});
 await page.locator('#btn-home').click();await page.locator('#btn-library').click();await page.locator('#library-tab-diagrams').click();await page.locator('#library-diagram-list button').first().click();await page.locator('#library-reader-annotate').click();
 box=await page.locator('#library-reader-ink').boundingBox();const beforeLibrary=await page.evaluate(()=>window.tabletNotes.saves);
 await touch('touchStart',[pt(1,.35,.5)]);await touch('touchStart',[pt(1,.35,.5),pt(2,.55,.5)]);await touch('touchMove',[pt(1,.25,.5),pt(2,.65,.5)]);await touch('touchEnd',[]);
 assert.equal(await page.evaluate(()=>window.tabletNotes.saves),beforeLibrary,'Library pinch does not save ink');
 assert.match(await page.locator('#library-reader-ink').evaluate(el=>el.style.transform),/scale\(2/);await page.locator('#library-reader-close').click();await page.locator('#btn-library-home').click();
 await page.locator('#btn-boards').click();await page.locator('#boards-create').click();await page.locator('#board-create-title').fill('Grupo tablet');await page.locator('#board-create-form [name=course]').fill('Pruebas');await page.locator('#board-create-submit').click();await page.waitForFunction(()=>document.querySelector('#board-save-state').textContent==='Todo guardado');
 box=await page.locator('#board-canvas').boundingBox();
 await touch('touchStart',[pt(1,.35,.5)]);await touch('touchStart',[pt(1,.35,.5),pt(2,.55,.5)]);await touch('touchMove',[pt(1,.25,.5),pt(2,.65,.5)]);await touch('touchEnd',[]);
 const count=await page.evaluate(()=>Object.values(window.tabletBoardData.boardData?.UPB||{}).reduce((n,b)=>n+Object.keys(b.strokes||{}).length,0));assert.equal(count,0,'Board pinch saves no permanent stroke');
 await page.locator('#board-canvas').evaluate(el=>el.parentElement.querySelector('.ink-reset').click());
 for(const size of [{width:1024,height:640},{width:768,height:900}]){await page.setViewportSize(size);await page.waitForTimeout(150);const rect=await page.locator('#board-canvas').boundingBox();assert.ok(rect.height>100 && rect.y+rect.height<=size.height,JSON.stringify(rect));}
 await page.setViewportSize({width:1024,height:640});await page.locator('#account-bar .theme-toggle').click();await page.waitForTimeout(300);await page.screenshot({path:join(tmpdir(),'risio-tablet-dark-board.png')});
 await page.locator('[data-board-tool="text"]').click();await page.locator('#board-canvas').click({position:{x:80,y:80}});await page.locator('#board-text-value').fill('Texto con teclado de tablet');await page.setViewportSize({width:1024,height:380});await page.waitForTimeout(200);
 const editor=await page.locator('#board-text-dialog').boundingBox();assert.ok(editor.y>=0 && editor.y+editor.height<=380,'Text editor fits a reduced keyboard viewport');
 await page.setViewportSize({width:1024,height:640});await page.locator('#board-text-cancel').click();
 assert.deepEqual(errors,[]);console.log('OK: theme persistence, one-finger drawing, pinch/pan draft cancellation, reset, tablet viewer and board fit, library/board pinch, simulated pen/palm, keyboard editor, no JS errors.');
}finally{await browser?.close();server.kill();}
