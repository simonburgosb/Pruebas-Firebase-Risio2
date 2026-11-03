import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
await build({
  entryPoints: [fileURLToPath(new URL('./firebase-entry.js', import.meta.url))],
  outfile: fileURLToPath(new URL('../vendor/firebase-sdk.js', import.meta.url)),
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
  minify: true, legalComments: 'eof'
});
console.log('SDK de Firebase preparado en vendor/firebase-sdk.js');
