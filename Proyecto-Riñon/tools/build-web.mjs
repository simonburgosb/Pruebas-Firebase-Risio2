import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {publicConfig} from './config.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),output=path.resolve(root,'../dist');
const config=publicConfig();if(!config.apiKey || config.apiKey==='REEMPLAZAR')throw new Error('Falta RISIO_FIREBASE_CONFIG.');
fs.rmSync(output,{recursive:true,force:true});fs.mkdirSync(output,{recursive:true});
for(const entry of fs.readdirSync(root,{withFileTypes:true})){
 if(entry.name.startsWith('.') || ['tools','node_modules','package.json','package-lock.json','firebase-config.json'].includes(entry.name) || entry.name.endsWith('.mjs'))continue;
 fs.cpSync(path.join(root,entry.name),path.join(output,entry.name),{recursive:true});
}
fs.writeFileSync(path.join(output,'firebase-config.json'),JSON.stringify(config));
console.log('Sitio listo en dist: sin pruebas, servidor, funciones ni archivos de entorno. La configuración web es pública.');
