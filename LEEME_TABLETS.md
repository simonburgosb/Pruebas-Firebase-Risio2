# Risio · Temas y anotaciones en tablets

## Temas

El diseño anterior se conserva como modo claro y sigue siendo el valor inicial. El selector aparece en el acceso, la barra de cuenta y el lector de Biblioteca. La preferencia se recuerda en ese navegador y dispositivo, incluso después de cerrar sesión. Si el navegador impide guardar preferencias, el selector sigue funcionando durante la sesión.

El modo oscuro usa fondos carbón, superficies grises cálidas, textos claros y acentos rojizos. Los PDF, imágenes y modelos mantienen sus colores originales. Las páginas PDF conservan papel blanco. Los colores guardados de los trazos no se modifican: sobre lienzos oscuros se aclaran al dibujarlos para mantener visibilidad.

## Escribir y navegar

Activa Anotar en el visor o en Biblioteca. Los tableros conservan sus permisos.

- Un dedo o un lápiz digital escribe.
- Dos dedos amplían y reducen (100–400 %) y desplazan el contenido ampliado.
- Al apoyar el segundo dedo se descarta el trazo provisional. No se guarda como anotación ni trazo compartido definitivo.
- Tras un gesto de dos dedos, levanta ambos antes de empezar a escribir.
- Mientras el lápiz está apoyado, se ignoran contactos táctiles adicionales para evitar marcas de la palma. El navegador debe identificar el dispositivo como lápiz mediante Pointer Events.
- Restablecer vista devuelve tamaño y posición iniciales. El zoom es local y no altera los apuntes de otras personas.
- En PDF, a tamaño inicial, los dos dedos también desplazan la página por su contenedor.
- Fuera de Anotar se mantienen los controles anteriores.

Contenido y tinta comparten transformación. Las coordenadas se calculan usando el lienzo transformado para poder escribir después del zoom.

## Ventana de navegador

Se usa el alto disponible con las barras del navegador y el teclado, y se contemplan las áreas seguras. En tablets, los paneles largos y el chat se desplazan dentro de su espacio. No se requiere pantalla completa. En teléfonos se permite desplazamiento vertical para mantener controles legibles.

## Actualizar

Reemplaza los archivos conservando .env.local. Para GitHub Pages, vuelve a generar y publicar dist/ mediante el flujo habitual. No hay cambios de reglas Firebase. Recarga con Ctrl+F5 o actualiza la pestaña en la tablet.

## Validación

Probado en Chromium con ventanas de 1024×600, 1024×640, 768×900 y 820×680: persistencia del tema, escritura táctil, cancelación al pellizcar, navegación de dos dedos, reinicio de vista, lápiz simulado con contacto adicional, Biblioteca y tableros. La prueba de interfaz usa notas y Firebase en memoria, sin cuentas reales.

Queda pendiente la validación física en iPad/Safari, Apple Pencil y tablets Android concretas. La simulación no reproduce todas las diferencias de hardware y rechazo de palma.
