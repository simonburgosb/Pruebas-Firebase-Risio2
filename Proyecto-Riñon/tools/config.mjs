import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
export function publicConfig() {
  const local = fileURLToPath(new URL('../../.env.local',import.meta.url));
  if (fs.existsSync(local) && process.loadEnvFile) process.loadEnvFile(local);
  let input; try { input=JSON.parse(process.env.RISIO_FIREBASE_CONFIG || '{}'); } catch { throw new Error('RISIO_FIREBASE_CONFIG debe ser un JSON válido.'); }
  const keys=['apiKey','authDomain','databaseURL','projectId','storageBucket','messagingSenderId','appId'];
  return Object.fromEntries(keys.filter(k=>typeof input[k]==='string').map(k=>[k,input[k]]));
}
