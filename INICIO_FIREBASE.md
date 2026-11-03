# Risio · Cuentas, anotaciones y tableros compartidos

Esta entrega añade Firebase al proyecto existente. Conserva los modelos, las simulaciones, la Biblioteca, los créditos de MEDIDED y el botón de captura PNG.

## Qué está implementado

- Inicio de sesión, registro, verificación obligatoria de correo, reenvío y recuperación de contraseña.
- Universidad: UPB. Elegir la universidad habilita Estudiante o Profesor. El semestre (1–12) aparece y se exige únicamente a estudiantes.
- Dos perfiles, porque fueron los dos roles descritos. No se inventó un tercer perfil.
- Al crear la cuenta no se abre la aplicación: primero se muestra Verifica tu correo. Después de abrir el enlace, se pulsa Ya verifiqué mi correo. También se puede cerrar y volver a iniciar sesión.
- Perfil académico por UID. Si una interrupción dejó la cuenta sin perfil, se solicita completarlo después de verificar el correo.
- Anotaciones privadas en Anatomía (por cada modelo), Glucosa (riñón y nefrona), Filtración, PDF (por documento y página), ilustraciones y videos (por clase y segundo).
- Indicador de guardado, reintento al recuperar internet y copia local de cambios pendientes separada por UID.
- Al volver a entrar desde otro dispositivo, los trazos se recuperan de Realtime Database. Las notas de video conservan sus momentos para poder reabrirlas.
- Reglas de acceso para perfiles y anotaciones, y reglas privadas de Storage para la siguiente etapa.

Los tableros compartidos ya están incluidos: se abren desde **Tableros** en el inicio o desde el botón persistente junto a Mi cuenta. No requieren aprobación administrativa. La importación de fotos y documentos al tablero queda pendiente; esta entrega permite dibujo y chat, sin usar Storage.

## Activación inicial en tu proyecto

La configuración de `risio-6431a` ya está en `Proyecto-Riñon/firebase-client.js`. No necesitas volver a copiarla ni crear otra base de datos.

1. Abre [Firebase Console](https://console.firebase.google.com/project/risio-6431a/overview). En **Authentication → Método de acceso**, habilita **Correo electrónico/Contraseña**. No hace falta habilitar el acceso sin contraseña por enlace.
2. En **Authentication → Configuración → Dominios autorizados**, añade `localhost`, `127.0.0.1` y el dominio donde publiques Risio, si aún no aparecen. No añadas `http://`, puertos ni rutas. Al publicar en GitHub Pages, se usa el dominio `usuario.github.io`, sin el nombre del repositorio.
3. En **Realtime Database → Reglas**, pega TODO `database.rules.json` y pulsa **Publicar**. Debe ser la base `risio-6431a-default-rtdb`. No uses reglas abiertas de prueba.
4. En **Authentication → Plantillas**, personaliza el nombre del remitente y las plantillas de verificación y recuperación como Risio. Esta versión usa la página de acciones que ofrece Firebase: el usuario confirma allí y vuelve a Risio. No necesita una Cloud Function para enviar esos correos.
5. Descomprime y abre una terminal dentro de `Modelo-interactivo-3D-del-rinon`. Ejecuta `npm start` y abre `http://localhost:8080`. Crea una cuenta de prueba con un correo al que tengas acceso, abre la verificación y vuelve a Risio para continuar.
6. Para adjuntos futuros, habilita **Storage** y publica `storage.rules` en su pestaña Reglas. Firebase actualmente exige **Blaze** para Cloud Storage. Login, perfiles y trazos usan Authentication/Realtime Database y no necesitan Storage. Esta versión no cambia el plan ni activa facturación automáticamente.

Estas acciones de consola no quedaron aplicadas desde esta entrega: la configuración web compartida identifica la app, pero no concede administración del proyecto. Antes de probar correos reales, realiza los pasos 1–4.

El SDK ya viene compilado localmente en `vendor/firebase-sdk.js`: `npm start` funciona sin recompilar. Para reinstalar las dependencias de desarrollo o actualizar el bundle:

```bash
npm install
npm run build:firebase
npm start
```

La selección de UPB identifica el perfil declarado; no comprueba matrícula ni exige un dominio de correo institucional. La verificación confirma que el correo pertenece al usuario.

El proyecto mantiene su servidor estático de Node. No necesita Vite. Para instalar las dependencias actuales de desarrollo se recomienda Node 22 LTS; el SDK empaquetado y el servidor pueden ejecutarse con Node 20.

## Cómo se guarda la información

| Ruta en Realtime Database | Contenido | Acceso del navegador |
| --- | --- | --- |
| `profiles/UID` | Nombre, UPB, perfil solicitado, semestre y fechas | Solo la propia cuenta; se permite completar el perfil antes de verificar |
| `annotations/UID/ID_DEL_RECURSO` | Recurso, trazos normalizados y fecha | Solo la propia cuenta con correo verificado y perfil UPB |
| `teacherApprovals/UID` | Ruta reservada heredada; no controla los tableros | El propietario puede consultar su estado; ningún cliente puede escribirlo |

Los trazos se guardan al terminar cada gesto, al deshacer y al borrar. Las coordenadas normalizadas permiten recuperarlos con otro tamaño de pantalla. No se suben capturas de pantalla para guardar los trazos: se guarda su estructura. Un recurso admite hasta 900 KB de datos de dibujo. El PNG de Guardar continúa descargándose al computador.

El navegador mantiene una cola local `risio:notes:v1:UID`. Cuando no hay internet, los cambios quedan pendientes y se reintentan al reconectar o al volver a entrar con la misma cuenta y el mismo navegador. **Una nota pendiente aún no está disponible en otro dispositivo**: espera a ver Anotaciones sincronizadas. No se debe borrar el almacenamiento del navegador mientras haya pendientes. Si se bloquea el almacenamiento local, la interfaz lo indica. Cerrar sesión espera la sincronización para evitar pérdidas.

Para editar un mismo recurso desde dos dispositivos se aplica el último guardado recibido; esta fase no fusiona trazos simultáneos. El tablero de clase requiere eventos por trazo, como se propone abajo.

Las anotaciones antiguas guardadas sin cuenta no se asignan automáticamente al primer usuario que ingrese: no existe una forma segura de saber a quién pertenecen en un equipo compartido. Permanecen en sus claves anteriores del navegador. Esta actualización conserva los archivos del proyecto, pero las notas privadas por cuenta comienzan desde el registro.

La apiKey de una app web Firebase forma parte de su configuración pública. La privacidad depende de las reglas y Authentication. Nunca se incluye una cuenta de servicio ni el SDK Admin en el navegador. No se activa Analytics automáticamente.

## Tableros: cómo usarlos

1. Inicia sesión con una cuenta verificada y abre **Tableros** en el inicio o junto a **Mi cuenta**.
2. Hay dos secciones: **Clases de profesores** y **Grupos de estudiantes**. Cada una tiene búsqueda por título, materia o creador, filtros propios y orden por recién creados, más antiguos o título A–Z. Se muestran 12 tarjetas por sección y Ver más permite ampliar la lista.
3. Pulsa **Crear tablero**. Escribe el título (placeholder: «Ej. Nombre de la clase o de la materia») y la clase o materia. La universidad se toma de tu perfil; el tipo de tablero se toma de tu rol. Se crea y abre directamente, sin aprobación de un administrador.
4. En las clases docentes, el profesor creador puede anotar, buscar participantes y conceder o retirar permiso. Los demás observan, conversan por chat y levantan la mano para pedir permiso.
5. En los grupos estudiantiles todos los participantes pueden anotar. Hay **cinco cupos simultáneos en total, incluido el creador**. Un sexto participante debe esperar; cerrar o salir libera el cupo cuando Firebase detecta la desconexión. No se reservan puestos permanentes. Una misma cuenta no puede ocupar varios cupos en el mismo grupo.
6. Los tableros de profesores **no tienen un máximo impuesto por Risio**; siguen sujetos a los límites y al plan de Firebase. No se ha hecho una prueba de carga masiva.
7. Los trazos y mensajes permanecen guardados después de salir. El lápiz tiene cuatro colores y tres grosores; Deshacer retira tu último trazo y el creador puede vaciar el lienzo con confirmación. Descargar PNG exporta el lienzo.

**Para activar esta actualización**, vuelve a publicar TODO `database.rules.json` en Realtime Database. Las reglas de la entrega anterior no incluyen `boardDirectory` ni `boardData`. No hace falta habilitar Storage ni facturación para el dibujo y chat. No se modificó la consola de producción desde esta entrega.

### Universidad y permisos

El catálogo, presencia, trazos y chat se separan por universidad y las reglas comparan esa universidad con el perfil autenticado. UPB es la única habilitada hoy. Los usuarios de otra organización no pueden listar ni abrir esos tableros. La selección de universidad sigue siendo declarativa: no verifica matrícula.

Elegir Profesor permite crear tableros docentes directamente, tal como se solicitó. No hay aprobación adicional ni uso de `teacherApprovals` para crear clases. El creador controla únicamente sus tableros; no puede consultar las anotaciones personales de otro usuario. Cualquier cuenta verificada de la misma universidad puede encontrar y entrar en una clase, sin invitación. Los nombres visibles y la presencia del tablero son visibles a esa universidad; los perfiles y notas privadas siguen protegidos.

Los permisos para anotar se comprueban tanto en la interfaz como en las reglas. Un estudiante no puede concederse permiso en una clase ni modificar los trazos de otros. Los permisos concedidos permanecen al volver a entrar hasta que el profesor los retire. La mano levantada también permanece hasta bajarla o conceder permiso.

### Datos y sincronización

| Ruta | Contenido |
| --- | --- |
| `boardDirectory/UNIVERSIDAD/ID` | Título, materia, tipo, creador y fecha |
| `boardData/UNIVERSIDAD/ID/slots/s0…s4` | Cinco reservas simultáneas para grupos estudiantiles |
| `boardData/UNIVERSIDAD/ID/participants/UID` | Presencia sin cupo máximo para clases docentes |
| `boardData/UNIVERSIDAD/ID/strokes/ID` | Un registro por trazo; permite dibujar simultáneamente |
| `boardData/UNIVERSIDAD/ID/messages/ID` | Mensajes persistentes; se muestran los últimos 100 |
| `boardData/UNIVERSIDAD/ID/permissions/UID` | Permiso para anotar concedido por el profesor creador |
| `boardData/UNIVERSIDAD/ID/hands/UID` | Solicitudes de mano levantada |

Los cinco cupos se asignan mediante transacciones y se validan en el servidor; un sexto cupo no existe en las reglas. `onDisconnect` libera presencia al desconectar. Un tablero solo puede abrirse una vez por cuenta al mismo tiempo; si está abierto en otra pestaña, hay que salir allí primero. La reconexión intenta recuperar un cupo, pero puede encontrar el grupo completo.

El lienzo compartido necesita conexión para participar; espera a **Todo guardado** antes de salir. Las anotaciones personales conservan su cola local independiente. Esta versión no permite importar imágenes/PDF ni gestionar archivos compartidos, y no es un editor completo de FigJam. No necesita otro plugin ni otra base de datos para las herramientas incluidas.

## Comprobaciones

En esta entrega pasaron las pruebas de simulación y cinco pruebas de cola por cuenta, las comprobaciones de reglas en los emuladores y el recorrido en Chromium de registro, bloqueo hasta verificar, entrada al visor, dibujo 3D y Biblioteca, sincronización entre dos sesiones, cierre de sesión, recuperación y presentación móvil. Los correos y los usuarios de prueba existieron únicamente en el emulador `demo-risio`. No se probó el envío de un correo real ni se cambiaron los servicios en producción.

- `npm test`: simulaciones, estructuras, paneles, fórmulas, captura y pruebas de cola por cuenta.
- `npm run test:boards`: reglas de creación directa, aislamiento universitario, carrera de seis usuarios por cinco cupos, liberación por desconexión, persistencia, clases con más de cinco personas, chat, mano y permisos.
- `RISIO_BOARDS_BROWSER_TEST=1 npm run test:boards`: recorrido real en Chromium de creación de ambos tipos, sincronización entre profesor y estudiante, permisos, chat, búsqueda y diseño móvil. Requiere Playwright y Chromium; `RISIO_CHROMIUM_PATH` permite usar un ejecutable instalado.
- `npm run test:firebase`: reglas reales con emuladores de Authentication, Realtime Database y Storage. Requiere Java 17 o superior con la versión de CLI fijada en el proyecto.
- `RISIO_BROWSER_TEST=1 npm run test:firebase`: recorrido visual con Playwright y Chromium instalados (`npm install --no-save playwright` y `npx playwright install chromium`). Solo usa `demo-risio`; no crea cuentas en producción.
- Para probar manualmente los emuladores: `npx firebase emulators:start --project demo-risio --only auth,database,storage` y, en otra terminal, `RISIO_EMULATORS=1 npm start`. Este modo se habilita únicamente en el servidor local y muestra una etiqueta de pruebas.

## Fuentes oficiales consultadas

- [Gestión de usuarios: verificación y recuperación](https://firebase.google.com/docs/auth/web/manage-users).
- [Autenticación por correo y contraseña](https://firebase.google.com/docs/auth/web/password-auth).
- [Lectura y escritura; límites de persistencia offline en web](https://firebase.google.com/docs/database/web/read-and-write).
- [Condiciones y autenticación en reglas de Realtime Database](https://firebase.google.com/docs/database/security/rules-conditions).
- [Presencia y desconexión](https://firebase.google.com/docs/database/web/offline-capabilities).
- [Cloud Storage en web y requisito de Blaze](https://firebase.google.com/docs/storage/web/start).
- [Claims de privilegios desde servidor](https://firebase.google.com/docs/auth/admin/custom-claims).
