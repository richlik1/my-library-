// PDF.js worker entry: add Safari fixes, then start the real worker.
import './streamPolyfill';
import 'pdfjs-dist/legacy/build/pdf.worker.min.mjs';
