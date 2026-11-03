# Risio · Configuración, seguridad y tableros

## Cambios de esta entrega

- La configuración web de Firebase ya no está incrustada en `firebase-client.js`.
- `.env.local` y los archivos generados de configuración se excluyen de Git. El ZIP no contiene tu configuración de producción.
- El servidor local bloquea archivos de entorno, pruebas, dependencias y código de servidor. `build:web` prepara únicamente los archivos que debe recibir un navegador.
- Las cuentas mantienen inicio, registro UPB, semestre para estudiantes, verificación de correo, recuperación y notas personales privadas.
- Los tableros estudiantiles admiten cinco personas simultáneas, incluido el creador. El creador puede borrarlos desde la tarjeta o desde el lienzo, con confirmación. El borrado incluye textos, trazos, chat, permisos y presencia.
- Los grupos estudiantiles caducan a los **45 minutos desde su creación**. Si quedan vacíos por **2 minutos**, también se eliminan. Las clases docentes no tienen esta caducidad.
- Colores personalizados, grosor de 1 a 30 con slider, texto y resaltador en ambos tipos. El resaltador puede dibujar sobre el contenido o activar/desactivar el resaltado de una caja de texto al hacer clic en ella. Cada persona edita sus propias cajas de texto; todos los que tienen permiso pueden resaltarlas.
- En clases docentes el propietario usa azul fijo. Los demás no pueden utilizar colores cuyo componente azul sea mayor que el rojo y el verde. Esta restricción se valida en el servidor, además de la interfaz. En grupos estudiantiles están disponibles todos los colores.
- El dibujo comparte avances aproximadamente cada 80 ms y guarda el trazo al terminar. Su fluidez depende de la conexión. Las vistas previas de trazos se limpian al terminar, cancelar o desconectarse. Los textos se sincronizan al guardar la caja, no por pulsación de tecla.
- Las manos levantadas aparecen para el profesor en una franja destacada sobre el lienzo con **Dar permiso para anotar**, además de la lista de participantes.

## 1. Conexión local sin publicar la configuración en Git

1. Copia `.env.example` como `.env.local` en la raíz `Modelo-interactivo-3D-del-rinon`.
2. En Firebase Console → Configuración del proyecto → Tus aplicaciones → SDK web, copia los campos del objeto de configuración web. Completa el JSON de `RISIO_FIREBASE_CONFIG` en una sola línea. Debe contener `apiKey`, `authDomain`, `databaseURL`, `projectId`, `storageBucket`, `messagingSenderId` y `appId`. No incluyas cuentas de servicio ni claves privadas.
3. Ejecuta `npm start` y abre `http://localhost:8080`. El servidor lee el archivo local y entrega al SDK solo esos campos públicos.
4. Habilita Authentication → Correo/Contraseña y autoriza los dominios reales de publicación y los de desarrollo necesarios. Mantén la verificación de correo obligatoria.
5. Publica TODO `database.rules.json` en Realtime Database. Si usas adjuntos privados, publica también `storage.rules`. No uses reglas de prueba abiertas.

Se requiere Node 20.12 o posterior para leer el archivo de entorno local; se recomienda Node 22 para desarrollo y funciones. El SDK del navegador viene compilado: no hace falta reinstalarlo para ejecutar el visor.

## 2. Activar borrado automático y creación de grupos

El código del servidor está en `functions/`. Usa Firebase Admin únicamente dentro del servidor y la identidad del entorno de Google; no contiene archivos de cuenta de servicio.

**Esta etapa requiere plan Blaze para desplegar Cloud Functions y Cloud Scheduler.** No se ha activado facturación ni se ha desplegado nada en tu proyecto real desde esta entrega.

Desde la raíz del proyecto:

```bash
npm install
npm --prefix functions ci
npx firebase login
npx firebase use --add
npx firebase deploy --only database,functions
```

Selecciona tu proyecto existente cuando lo solicite Firebase. No selecciones `demo-risio`, que pertenece solo a las pruebas locales. Las funciones están en `us-central1`; si cambias la región, cambia también `getFunctions` en el cliente y las regiones de los disparadores. El disparador de Realtime Database debe desplegarse en una región compatible con la instancia de tu base.

| Función | Trabajo |
| --- | --- |
| `createStudentBoard` | Comprueba correo verificado, perfil UPB y rol Estudiante; crea título, materia y tiempos con reloj de servidor |
| `deleteStudentBoard` | Comprueba que la persona autenticada creó el grupo y elimina todos sus datos |
| `trackStudentPresence` | Actualiza desde servidor cuándo empieza o termina un intervalo sin participantes |
| `cleanStudentBoards` | Cada minuto elimina grupos vencidos o vacíos durante dos minutos |

Las reglas impiden que el navegador extienda la duración o modifique el reloj de inactividad. También impiden crear un grupo estudiantil saltándose la función. **Hasta desplegar las funciones, las clases docentes siguen usando su creación directa, pero los grupos estudiantiles no podrán crearse ni borrarse.** La interfaz no sustituye el borrado del servidor.

El acceso al contenido de un grupo vence a los 45 minutos incluso si se manipula el reloj local. El borrado físico se ejecuta en el siguiente barrido de cada minuto y puede demorarse más si hay un fallo del servicio. La inactividad se cuenta desde que Firebase registra que no quedan participantes; detectar una conexión perdida puede llevar tiempo. No se depende de que algún navegador permanezca abierto.

El proceso marca el grupo como en eliminación antes de quitar sus datos para impedir nuevas entradas durante la limpieza. Los borrados y reintentos son idempotentes. Los grupos antiguos también se limpian según su fecha de creación, mientras las clases docentes se conservan.

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
- `boardData/UNIVERSIDAD/ID/_lifecycle`: reloj y estado de eliminación; solo escribe el servidor.
- `teacherApprovals`: ruta heredada reservada; no se exige aprobación para crear un tablero de profesor.

En las clases, el profesor creador anota por defecto y concede o retira permiso a otros participantes. Los permisos concedidos se mantienen hasta retirarlos. Los grupos de estudiantes tienen cinco reservas simultáneas validadas con transacciones; cerrar o salir libera la reserva al registrarse la desconexión. El chat conserva los mensajes; se muestran los últimos 100. No se han añadido importaciones de imágenes, PDF o documentos al tablero en esta entrega.

## 5. Verificación

```bash
npm test
npm run test:security
npm run test:firebase
npm run test:boards
```

Las pruebas de Firebase necesitan Java 17 o posterior con la CLI incluida y usan únicamente `demo-risio`. `test:boards` necesita instalar previamente las dependencias de `functions/`. Comprueba permisos, cinco cupos simultáneos, expiración, borrado íntegro, texto, color docente, grosor y trazos en vivo. Prueba los manejadores reales de las funciones contra emuladores de Auth/Database; el transporte local de prueba no sustituye verificar el despliegue real.

Para la prueba visual, con Playwright/Chromium disponibles: `RISIO_BOARDS_BROWSER_TEST=1 npm run test:boards`. `RISIO_CHROMIUM_PATH` permite indicar un Chromium instalado. Los recorridos incluyen sincronización de profesor y estudiante, manos destacadas, texto, resaltado, borrado y móvil. No se crean usuarios ni datos de pruebas en producción. No se ha hecho una prueba de carga masiva.

## Documentación oficial

- https://firebase.google.com/docs/projects/api-keys
- https://firebase.google.com/support/guides/security-checklist
- https://firebase.google.com/docs/functions/get-started
- https://firebase.google.com/docs/functions/schedule-functions
- https://firebase.google.com/docs/database/web/offline-capabilities
