import fs from 'node:fs';
import {publicConfig} from './config.mjs';
const config=publicConfig();
if (!config.apiKey || config.apiKey==='REEMPLAZAR') throw new Error('Configura RISIO_FIREBASE_CONFIG antes de generar el despliegue.');
fs.writeFileSync(new URL('../firebase-config.json',import.meta.url),JSON.stringify(config));
console.log('Configuración pública generada. Su contenido será visible en el navegador.');
