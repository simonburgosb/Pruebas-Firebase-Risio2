// Un solo bundle ESM local para conservar el servidor estático y npm start.
export {initializeApp} from 'firebase/app';
export {getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification,
  sendPasswordResetEmail, updateProfile, reload, getIdToken, signOut,
  connectAuthEmulator} from 'firebase/auth';
export {getDatabase, ref, get, set, update, remove, push, onValue, query, limitToLast, runTransaction, onDisconnect, serverTimestamp,
  connectDatabaseEmulator} from 'firebase/database';
export {getStorage, ref as storageRef, uploadBytes, getBytes, deleteObject,
  connectStorageEmulator} from 'firebase/storage';

export {getFunctions, httpsCallable, connectFunctionsEmulator} from 'firebase/functions';
