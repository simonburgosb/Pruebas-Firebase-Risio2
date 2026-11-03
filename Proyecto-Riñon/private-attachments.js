// API preparada para la siguiente etapa. No agrega todavía un tablero ni un
// botón de importación. Los adjuntos privados nunca se convierten en URLs públicas.
import {auth, storage} from './firebase-client.js';
import {storageRef, uploadBytes, getBytes, deleteObject} from './vendor/firebase-sdk.js';
const allowed = /^(image\/(png|jpeg|webp|gif)|application\/pdf|text\/plain)$/;
export async function uploadPrivateAttachment(file) {
  const user = auth.currentUser;
  if (!user?.emailVerified) throw new Error('Verifica tu correo antes de adjuntar archivos.');
  if (!allowed.test(file.type) || file.size >= 10 * 1024 * 1024) throw new Error('Usa una imagen, PDF o TXT de menos de 10 MB.');
  const path = `private/${user.uid}/${crypto.randomUUID()}`;
  await uploadBytes(storageRef(storage, path), file, {contentType: file.type});
  return {storagePath: path, name: file.name, contentType: file.type, size: file.size};
}
export function readPrivateAttachment(path) { return getBytes(storageRef(storage, path), 10 * 1024 * 1024); }
export function deletePrivateAttachment(path) { return deleteObject(storageRef(storage, path)); }
