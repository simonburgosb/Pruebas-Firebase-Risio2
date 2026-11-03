import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url));
const scan=directory=>{for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
 if(['node_modules','.git','dist'].includes(entry.name) || entry.name.startsWith('.env'))continue;
 const file=path.join(directory,entry.name);if(entry.isDirectory()){scan(file);continue;}
 if(!/\.(js|mjs|cjs|json|md|yml|txt)$/.test(entry.name))continue;
 const text=fs.readFileSync(file,'utf8');
 assert.ok(!/AIza[0-9A-Za-z_-]{30,}/.test(text),'Clave real incrustada: '+path.relative(root,file));
 assert.ok(!/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(text),'Clave privada en: '+path.relative(root,file));
 assert.ok(!/"type"\s*:\s*"service_account"/.test(text),'Cuenta de servicio en: '+path.relative(root,file));
 assert.ok(!/gh[pousr]_[A-Za-z0-9]{25,}/.test(text),'Token GitHub en: '+path.relative(root,file));
}};
scan(root);
const server=spawn(process.execPath,[fileURLToPath(new URL('../server.mjs',import.meta.url))],{env:{...process.env,PORT:'8086',RISIO_EMULATORS:'1'},stdio:'ignore'});
try{
 for(let i=0;i<40;i++){try{if((await fetch('http://127.0.0.1:8086/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 for(const route of ['/.env.local','/tools/verify-auth-browser.mjs','/server.mjs','/node_modules/package.json','/%2eenv.local'])assert.equal((await fetch('http://127.0.0.1:8086'+route)).status,404,route);
 const response=await fetch('http://127.0.0.1:8086/firebase-config.json');const config=await response.json();assert.ok(Object.keys(config).every(k=>['apiKey','authDomain','databaseURL','projectId','storageBucket','messagingSenderId','appId'].includes(k)));
 assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 console.log('OK seguridad: sin claves incrustadas/privadas/tokens, configuración limitada a campos web, archivos de entorno y pruebas no se sirven por HTTP.');
}finally{server.kill('SIGTERM');}
