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
