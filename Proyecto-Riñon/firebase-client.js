// Esta configuración identifica la app web. El acceso lo protegen las reglas,
// no la confidencialidad de apiKey. Nunca pongas credenciales Admin en el navegador.
import {initializeApp, getAuth, getDatabase, getStorage, connectAuthEmulator,
  connectDatabaseEmulator, connectStorageEmulator, getFunctions, connectFunctionsEmulator} from './vendor/firebase-sdk.js';

// Configuración pública inyectada al desplegar; no se guarda en el repositorio.
const configResponse = await fetch('./firebase-config.json', {cache:'no-store'});
export const firebaseConfig = configResponse.ok ? await configResponse.json() : {};

// El modo de emuladores solo existe en el servidor de desarrollo iniciado
// explícitamente con RISIO_EMULATORS=1. No se activa mediante parámetros URL.
const response = await fetch('./risio-runtime.json', {cache: 'no-store'});
const runtime = response.ok ? await response.json() : {};
const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
export const emulatorMode = localHost && runtime.emulators === true;
if (!emulatorMode && !firebaseConfig.apiKey) {
  document.querySelector('#auth-message').textContent = 'Falta la configuración de conexión. Sigue INICIO_FIREBASE.md para configurar Risio.';
  document.querySelector('#auth-message').hidden = false;
}
export const app = initializeApp(emulatorMode ? {...firebaseConfig,
  apiKey:'demo-api-key', appId:'demo-app', projectId: 'demo-risio', databaseURL: 'http://127.0.0.1:9000?ns=demo-risio',
  authDomain: 'localhost', storageBucket: 'demo-risio.appspot.com'} : firebaseConfig);
export const auth = getAuth(app);
auth.languageCode = 'es';
export const database = getDatabase(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'us-central1');
if (emulatorMode) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', {disableWarnings: true});
  connectDatabaseEmulator(database, '127.0.0.1', 9000);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

export function withTimeout(promise, message = 'La conexión está tardando demasiado. Revisa internet e inténtalo de nuevo.', ms = 15000) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  })]).finally(() => clearTimeout(timer));
}
