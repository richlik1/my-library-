// Copies PDF.js character maps and standard fonts into /public so they are
// served (and cached for offline use) from the app's own origin — no CDN.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let pkgDir;
try {
  pkgDir = dirname(require.resolve('pdfjs-dist/package.json'));
} catch {
  console.log('[copy-pdfjs-assets] pdfjs-dist not installed yet, skipping');
  process.exit(0);
}
const out = join(process.cwd(), 'public', 'pdfjs');
mkdirSync(out, { recursive: true });
for (const dir of ['cmaps', 'standard_fonts']) {
  const src = join(pkgDir, dir);
  if (existsSync(src)) cpSync(src, join(out, dir), { recursive: true });
}
console.log('[copy-pdfjs-assets] copied PDF.js cmaps and fonts to public/pdfjs');

// ONNX Runtime WebAssembly files for the Kokoro natural voice, so the app
// never fetches code from a CDN (works offline once cached).
try {
  const tdist = dirname(require.resolve('@huggingface/transformers'));
  const ort = join(process.cwd(), 'public', 'ort');
  mkdirSync(ort, { recursive: true });
  for (const f of ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) cpSync(join(tdist, f), join(ort, f));
  // Plain WebAssembly build for the Piper fast voice (same ONNX Runtime package).
  const odist = join(dirname(require.resolve('onnxruntime-web')), '..', 'dist');
  for (const f of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) cpSync(join(odist, f), join(ort, f));
  console.log('[copy-pdfjs-assets] copied ONNX Runtime WebAssembly files to public/ort');
} catch {
  console.log('[copy-pdfjs-assets] @huggingface/transformers not installed yet, skipping ONNX Runtime files');
}
