import {database, withTimeout} from './firebase-client.js';
import {ref, onValue, set, serverTimestamp} from './vendor/firebase-sdk.js';
import {AccountAnnotationStore} from './annotation-store.js';

const statusElement = document.querySelector('#account-sync');
export const notes = new AccountAnnotationStore({
  listen(uid, success, failure) {
    return onValue(ref(database, `annotations/${uid}`), snap => success(snap.val()), failure);
  },
  write(uid, id, document) {
    return withTimeout(set(ref(database, `annotations/${uid}/${id}`), {...document, updatedAt: serverTimestamp()}), undefined, 12000);
  }
}, {getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value)}, state => {
  if (!statusElement) return;
  statusElement.dataset.state = state.cloudError || (state.cacheFailed && state.pending) ? 'error' : state.pending ? 'pending' : 'saved';
  statusElement.textContent = state.cacheFailed && state.pending ? 'No se pudo guardar la copia local' : state.cloudError ? 'Sin sincronizar · reintentar' :
    state.pending ? `Guardando ${state.pending} ${state.pending === 1 ? 'anotación' : 'anotaciones'}…` : state.loading ? 'Conectando anotaciones…' : 'Anotaciones sincronizadas';
  statusElement.title = state.cloudError ? 'Tus cambios pendientes permanecen en este dispositivo. Pulsa para reintentar.' :
    state.cacheFailed && state.pending ? 'No cierres esta pestaña hasta que la sincronización termine.' : 'Tus anotaciones pertenecen únicamente a tu cuenta.';
});
statusElement?.addEventListener('click', () => notes.flush());
window.addEventListener('online', () => notes.flush());
window.addEventListener('pagehide', () => notes.flush());
window.addEventListener('beforeunload', event => {
  window.dispatchEvent(new Event('risio-finish-annotations'));
  if (notes.pending) { event.preventDefault(); event.returnValue = ''; }
});
