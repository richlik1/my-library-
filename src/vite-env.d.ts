/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

declare const __APP_VERSION__: string;

declare module 'pdfjs-dist/legacy/build/pdf.worker.min.mjs' {
  export const WorkerMessageHandler: unknown;
}
