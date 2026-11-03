// Esta configuración identifica la app web. El acceso lo protegen las reglas,
// no la confidencialidad de apiKey. Nunca pongas credenciales Admin en el navegador.
import {initializeApp, getAuth, getDatabase, getStorage, connectAuthEmulator,
  connectDatabaseEmulator, connectStorageEmulator} from './vendor/firebase-sdk.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyDxBTK58WuV8iRMyUOKYB6wDss4K5shCNg',
  authDomain: 'risio-6431a.firebaseapp.com',
  databaseURL: 'https://risio-6431a-default-rtdb.firebaseio.com',
  projectId: 'risio-6431a',
  storageBucket: 'risio-6431a.firebasestorage.app',
  messagingSenderId: '347871511314',
  appId: '1:347871511314:web:439e353421d0732a1269cb',
  measurementId: 'G-WFYVHDQ1X4'
};

// El modo de emuladores solo existe en el servidor de desarrollo iniciado
// explícitamente con RISIO_EMULATORS=1. No se activa mediante parámetros URL.
const response = await fetch('./risio-runtime.json', {cache: 'no-store'});
const runtime = response.ok ? await response.json() : {};
const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
export const emulatorMode = localHost && runtime.emulators === true;
export const app = initializeApp(emulatorMode ? {...firebaseConfig,
  projectId: 'demo-risio', databaseURL: 'http://127.0.0.1:9000?ns=demo-risio',
  authDomain: 'localhost', storageBucket: 'demo-risio.appspot.com'} : firebaseConfig);
export const auth = getAuth(app);
auth.languageCode = 'es';
export const database = getDatabase(app);
export const storage = getStorage(app);
if (emulatorMode) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', {disableWarnings: true});
  connectDatabaseEmulator(database, '127.0.0.1', 9000);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}

export function withTimeout(promise, message = 'La conexión está tardando demasiado. Revisa internet e inténtalo de nuevo.', ms = 15000) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  })]).finally(() => clearTimeout(timer));
}
