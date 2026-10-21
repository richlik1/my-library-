import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { expect, test } from '@playwright/test';
import { speechStub } from './fixtures';
// @ts-expect-error plain JS helper
import { serveModel } from './model-server.mjs';

/**
 * Runs the REAL Kokoro model in the browser (ONNX Runtime WebAssembly), with
 * Hugging Face downloads served from a local folder. Opt-in, because it needs
 * the 92 MB model on disk:
 *
 *   KOKORO_TEST_MODEL_DIR=/path/to/Kokoro-82M-v1.0-ONNX npx playwright test e2e/kokoro-real.spec.ts --project=desktop
 *
 * The folder must contain config.json, tokenizer.json, tokenizer_config.json
 * and onnx/model_quantized.onnx (as on huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX).
 */
const MODEL_DIR = process.env.KOKORO_TEST_MODEL_DIR;
const require = createRequire(import.meta.url);

test.skip(!MODEL_DIR || !existsSync(join(MODEL_DIR, 'onnx/model_quantized.onnx')), 'KOKORO_TEST_MODEL_DIR not set');

test('real Kokoro voice generates and plays a chapter in the browser', async ({ page }) => {
  test.setTimeout(10 * 60_000);
  // The model is served by a local server through the app's model-host option; the small
  // voice files (fetched from a fixed Hugging Face URL by kokoro-js) are intercepted.
  const server = await serveModel(MODEL_DIR!, 'onnx-community/Kokoro-82M-v1.0-ONNX', 4199);
  test.info().attach('model-host', { body: 'http://localhost:4199' });
  const voicesDir = join(dirname(require.resolve('kokoro-js')), '../voices');
  const served: string[] = [];
  await page.addInitScript(() => {
    (window as unknown as { __MY_LIBRARY_MODEL_HOST__: string }).__MY_LIBRARY_MODEL_HOST__ = 'http://localhost:4199';
  });
  page.on('request', (r) => r.url().startsWith('http://localhost:4199/') && served.push(r.url().split('/resolve/main/')[1]));
  await page.route('https://huggingface.co/**', async (route) => {
    const rel = /\/resolve\/main\/(voices\/.+)$/.exec(new URL(route.request().url()).pathname)?.[1];
    const file = rel ? join(voicesDir, rel.slice(7)) : '';
    if (file && existsSync(file)) {
      served.push(rel!);
      return route.fulfill({ path: file, headers: { 'access-control-allow-origin': '*' } });
    }
    return route.fulfill({ status: 404, body: 'not found' });
  });
  test.info().annotations.push({ type: 'cleanup', description: 'model server' });
  page.once('close', () => server.close());
  page.on('console', (m) => m.type() === 'error' && console.log('browser error:', m.text().slice(0, 300)));
  await page.addInitScript(speechStub);
  await page.goto('./');
  const para =
    'The lighthouse stood at the edge of the world. Every night its keeper climbed the long stairs to light the lamp, and every morning he climbed down again, tired but content.';
  const text = ['Chapter 1', '', 'A short opening line for the first chapter.', '', 'Chapter 2', '', para, '', para].join('\n');
  await page.getByTestId('file-input').setInputFiles({ name: 'real.txt', mimeType: 'text/plain', buffer: Buffer.from(text) });
  await page.getByRole('button', { name: 'Save to library' }).click();
  await page.getByRole('button', { name: 'Open real' }).click();
  await page.getByRole('button', { name: /Voice/ }).click();
  const t0 = Date.now();
  await page.getByRole('radio', { name: 'Natural voice' }).click();
  await expect(page.getByText(/1 of 2 chapters ready/)).toBeVisible({ timeout: 9 * 60_000 });
  const firstSeconds = (Date.now() - t0) / 1000;
  // Chapter 2 is generated ahead automatically; time it on its own (model already loaded).
  const t1 = Date.now();
  await expect(page.getByText(/2 of 2 chapters ready/)).toBeVisible({ timeout: 9 * 60_000 });
  const secondSeconds = (Date.now() - t1) / 1000;
  const genSeconds = firstSeconds;
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByTestId('play').click();
  await expect.poll(async () => (await page.locator('.scrub span').first().textContent())?.trim(), { timeout: 20_000 }).not.toBe('0:00');
  const remaining = (await page.locator('.scrub span').last().textContent())?.trim();
  await page.getByLabel('Next chapter', { exact: true }).click();
  await expect.poll(async () => (await page.locator('.scrub span').last().textContent())?.trim(), { timeout: 20_000 }).not.toBe('-0:00');
  const ch2 = (await page.locator('.scrub span').last().textContent())?.trim();
  console.log(
    `Kokoro in Chromium/WASM: first chapter incl. model load ${genSeconds.toFixed(1)} s (audio ${remaining}); ` +
      `chapter 2 generated in ${secondSeconds.toFixed(1)} s for ${ch2} of audio; served ${served.join(', ')}`,
  );
  expect(served).toContain('onnx/model_quantized.onnx');
});
