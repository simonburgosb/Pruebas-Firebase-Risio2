# Risio · Configuración, seguridad y tableros

## Cambios de esta entrega Spark

- Registro, verificación, notas privadas y tableros conservados.
- Creación y borrado directo en Realtime Database, sin funciones de pago.
- Cinco personas simultáneas por grupo, incluyendo al creador.
- Vencimiento de 45 minutos con reloj de servidor y reglas; limpieza al abrir o mantener abierta la sección Tableros.
- Colores, grosor, texto, resaltador, chat, manos y permisos conservados.
- Azul reservado al profesor en clases docentes.
- `.env.local` sigue siendo privado y no se incluye en el ZIP.

## 1. Conexión local sin publicar la configuración en Git

1. Copia `.env.example` como `.env.local` en la raíz `Modelo-interactivo-3D-del-rinon`.
2. En Firebase Console → Configuración del proyecto → Tus aplicaciones → SDK web, copia los campos del objeto de configuración web. Completa el JSON de `RISIO_FIREBASE_CONFIG` en una sola línea. Debe contener `apiKey`, `authDomain`, `databaseURL`, `projectId`, `storageBucket`, `messagingSenderId` y `appId`. No incluyas cuentas de servicio ni claves privadas.
3. Ejecuta `npm start` y abre `http://localhost:8080`. El servidor lee el archivo local y entrega al SDK solo esos campos públicos.
4. Habilita Authentication → Correo/Contraseña y autoriza los dominios reales de publicación y los de desarrollo necesarios. Mantén la verificación de correo obligatoria.
5. Publica TODO `database.rules.json` en Realtime Database. Si usas adjuntos privados, publica también `storage.rules`. No uses reglas de prueba abiertas.

Se requiere Node 20.12 o posterior para leer el archivo de entorno local; se recomienda Node 22 para desarrollo y funciones. El SDK del navegador viene compilado: no hace falta reinstalarlo para ejecutar el visor.

## 2. Versión Spark: tableros sin Cloud Functions

No se necesita Functions, Scheduler, Storage ni el plan Blaze para los tableros de esta versión.

1. Configura `.env.local` e inicia con `npm start` como se indica arriba.
2. Firebase Console → Realtime Database → Reglas: reemplaza las reglas completas por el archivo `database.rules.json` de ESTA versión y pulsa Publicar.
3. Recarga Risio e inicia sesión con correo verificado. Crea tu grupo desde Tableros.

Los grupos se crean directamente con fecha de servidor. El propietario puede borrarlos con confirmación. Las reglas mantienen cinco cupos, universidad y permisos; nadie puede cambiar la fecha ni extender los 45 minutos.

**Caducidad y borrado son diferentes:** las reglas evalúan el reloj de Firebase en cada operación y deniegan nuevas lecturas del contenido, entradas y escrituras al vencer. La interfaz oculta los vencidos y vacía el lienzo de la sesión al alcanzar el plazo; las copias ya descargadas no pueden revocarse. Una sesión con Tableros abierto revisa cada 15 segundos y elimina metadatos y contenido con una actualización atómica. Si todos cierran la app, el borrado físico ocurre cuando alguien verificado de la misma universidad vuelve a abrir Tableros con conexión. El grupo permanece inaccesible aunque aún esté almacenado. No se promete una tarea programada sin clientes.

En esta versión se elimina la caducidad anticipada de dos minutos vacíos: Spark no proporciona aquí un proceso de servidor que mida y limpie esa inactividad. La presencia sí se libera con `onDisconnect` al detectar la desconexión. Las clases docentes se conservan.

La distribución Spark no incluye `functions/` ni sus pruebas. No ejecutes comandos de despliegue de funciones. Si prefieres publicar reglas por CLI: `npx firebase deploy --only database --project TU_PROYECTO`.

## 3. Publicación estática y GitHub

Para generar los archivos que se publicarán:

```bash
npm run build:web
```

Publica únicamente el contenido de `dist/`. Este directorio no incluye `.env.local`, funciones, pruebas, servidor Node ni dependencias de desarrollo. En CI, configura `RISIO_FIREBASE_CONFIG` como variable/secret de despliegue y ejecuta el mismo comando. No publiques la raíz completa del repositorio como sitio web. `dist/` se regenera y está excluido de Git.

**La configuración web generada es pública por diseño.** La apiKey de Firebase identifica el proyecto; no concede por sí sola permiso a leer cuentas, notas o archivos. Ocultarla en una variable de entorno evita dejarla en el código fuente, pero el navegador necesita recibirla y se puede inspeccionar. Las direcciones de Realtime Database y Storage tampoco son contraseñas. Ocultar realmente todos los endpoints requeriría un servidor intermediario para todas las operaciones, una arquitectura distinta a la conexión directa del SDK.

### Alerta de GitHub de la captura

La alerta señala una Google API Key en una versión anterior de `firebase-client.js`. Se retiró la clave del código actual. Esto **no revoca la clave, no elimina el commit antiguo ni cierra la alerta**.

En tu consola:

1. Revisa esa clave en Google Cloud → APIs y servicios → Credenciales. Limítala a las APIs de Firebase que usa el proyecto y a los orígenes web autorizados cuando sea compatible con tu configuración. Comprueba que no habilite uso sin restricciones de otras APIs facturables.
2. Si la clave también se utilizaba en otros servicios, o decides reemplazarla, crea una nueva clave restringida, actualiza tu variable de despliegue, comprueba registro/login/base/Storage y después revoca la anterior. No revoques la única clave antes de configurar su reemplazo.
3. Publica las reglas incluidas, revisa los dominios de Authentication y comprueba las cuotas. La auditoría de esta entrega revisó los archivos; no verificó tu configuración efectiva de Google Cloud ni el historial completo de GitHub.
4. Revisa y resuelve la alerta en GitHub después de atender la clave y documentar que era una configuración web. Si una credencial privada real aparece en cualquier historial, revócala y sanea ese historial de forma coordinada. No basta con `.gitignore` para retirar algo que ya estaba versionado.

No se encontraron claves privadas de servidor, tokens GitHub ni cuentas de servicio en los archivos entregados revisados. Las contraseñas presentes en `tools/verify-*-browser.mjs` son datos ficticios usados exclusivamente con emuladores locales; no son las contraseñas de tus usuarios. Los correos y contraseñas de usuarios reales se manejan con Firebase Authentication, no se escriben en el código ni en Realtime Database. Los tokens de sesión gestionados por el SDK en el navegador son necesarios para mantener la sesión.

## 4. Datos y permisos

- `profiles/UID`: perfil académico. Solo lo consulta su propietario. UPB se declara al registrarse; no verifica matrícula.
- `annotations/UID/RECURSO`: trazos privados de modelos, PDFs, imágenes y videos. Requiere cuenta con correo verificado. La cola local por UID conserva pendientes; espera al indicador de sincronización antes de salir.
- `boardDirectory/UNIVERSIDAD/ID`: título, clase/materia, creador y fecha. Solo se lista desde cuentas verificadas de esa universidad.
- `boardData/UNIVERSIDAD/ID`: participantes/cupos, trazos, vistas previas en vivo, textos, resaltados, mensajes, manos y permisos. El contenido requiere participar; las listas de presencia pueden verse desde el catálogo de la misma universidad.
- `_lifecycle`: ruta heredada bloqueada; esta versión usa únicamente la fecha inmutable de `boardDirectory` para caducar.
- `teacherApprovals`: ruta heredada reservada; no se exige aprobación para crear un tablero de profesor.

En las clases, el profesor creador anota por defecto y concede o retira permiso a otros participantes. Los permisos concedidos se mantienen hasta retirarlos. Los grupos de estudiantes tienen cinco reservas simultáneas validadas con transacciones; cerrar o salir libera la reserva al registrarse la desconexión. El chat conserva los mensajes; se muestran los últimos 100. No se han añadido importaciones de imágenes, PDF o documentos al tablero en esta entrega.

## 5. Verificación

```bash
npm test
npm run test:security
npm run test:firebase
npm run test:boards
```

Las pruebas de Firebase necesitan Java 17 o posterior y `npm install`; usan solo `demo-risio`. `test:boards` comprueba creación directa, universidad, cinco cupos simultáneos, expiración, borrado por propietario, limpieza por otro usuario tras vencer, texto, color docente, grosor y trazos. No llama funciones ni crea datos en producción.

## Documentación oficial

- https://firebase.google.com/docs/projects/api-keys
- https://firebase.google.com/support/guides/security-checklist
- https://firebase.google.com/docs/functions/get-started
- https://firebase.google.com/docs/functions/schedule-functions
- https://firebase.google.com/docs/database/web/offline-capabilities
