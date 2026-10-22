import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
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

async function useLocalModel(page: Page) {
  // The model is served by a local server through the app's model-host option; the small
  // voice files (fetched from a fixed Hugging Face URL by kokoro-js) are intercepted.
  const server = await serveModel(MODEL_DIR!, 'onnx-community/Kokoro-82M-v1.0-ONNX', 4199);
  const voicesDir = join(dirname(require.resolve('kokoro-js')), '../voices');
  const served: string[] = [];
  await page.addInitScript(() => {
    (window as unknown as { __MY_LIBRARY_MODEL_HOST__: string }).__MY_LIBRARY_MODEL_HOST__ = 'http://localhost:4199';
  });
  page.on('request', (r) => r.url().startsWith('http://localhost:4199/') && served.push(r.url().split('/resolve/main/')[1]));
  // Requests from the voice worker are not seen by page.route, so voice files are served by the local server too.
  await page.context().route('https://huggingface.co/**', async (route) => {
    const rel = /\/resolve\/main\/(voices\/.+)$/.exec(new URL(route.request().url()).pathname)?.[1];
    const file = rel ? join(voicesDir, rel.slice(7)) : '';
    if (file && existsSync(file)) {
      served.push(rel!);
      return route.fulfill({ path: file, headers: { 'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin' } });
    }
    return route.fulfill({ status: 404, body: 'not found' });
  });
  page.once('close', () => server.close());
  page.on('console', (m) => m.type() === 'error' && console.log('browser error:', m.text().slice(0, 300)));
  await page.addInitScript(speechStub);
  return served;
}

test('real Kokoro: speed test in Settings', async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await useLocalModel(page);
  await page.goto('./#/settings');
  // The service worker adds the headers for multi-core voice from the second load on.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => crossOriginIsolated)).toBe(true);
  await page.getByRole('button', { name: 'Test natural voice speed' }).click();
  const status = page.getByRole('status').filter({ hasText: /listening speed|couldn’t start/ });
  await expect(status).toBeVisible({ timeout: 9 * 60_000 });
  const text = await status.textContent();
  console.log(`Speed test (crossOriginIsolated=${await page.evaluate(() => crossOriginIsolated)}): ${text}`);
  expect(text).toContain('listening speed');
});

test('real Kokoro voice generates and plays a chapter in the browser', async ({ page }) => {
  test.setTimeout(10 * 60_000);
  const served = await useLocalModel(page);
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
  await page.getByRole('button', { name: 'Close', exact: true }).click();
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

test('real Kokoro: time from Play to first sound on a long chapter', async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await useLocalModel(page);
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const para =
    'The lighthouse stood at the edge of the world. Every night its keeper climbed the long stairs to light the lamp, and every morning he climbed down again, tired but content.';
  await page.getByTestId('file-input').setInputFiles({ name: 'long.txt', mimeType: 'text/plain', buffer: Buffer.from(`Chapter 1\n\n${Array(12).fill(para).join('\n\n')}`) });
  await page.getByRole('button', { name: 'Save to library' }).click();
  await page.getByRole('button', { name: 'Open long' }).click();
  await page.getByRole('button', { name: /Voice/ }).click();
  await page.getByRole('radio', { name: 'Natural voice' }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  const t0 = Date.now();
  await page.getByTestId('play').click();
  await expect.poll(async () => (await page.locator('.scrub span').first().textContent())?.trim(), { timeout: 9 * 60_000 }).not.toBe('0:00');
  console.log(`Real Kokoro: first sound ${((Date.now() - t0) / 1000).toFixed(1)} s after Play (first use, includes model start) on a 24-sentence chapter`);
});

test('real Kokoro: if the multi-core voice gets stuck, it switches to one core and still speaks', async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await useLocalModel(page);
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__MY_LIBRARY_VOICE_HANG__ = 'threads';
    w.__MY_LIBRARY_VOICE_SYNTH_MS__ = 10_000;
  });
  await page.goto('./#/settings');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => crossOriginIsolated)).toBe(true);
  await page.getByRole('button', { name: 'Test natural voice speed' }).click();
  const status = page.getByRole('status').filter({ hasText: /listening speed|couldn’t run/ });
  const seen: string[] = [];
  const watch = setInterval(async () => {
    const t = await page.locator('[role=status]').last().textContent().catch(() => '');
    if (t && seen.at(-1) !== t.replace(/ \(\d+ s\)$/, '')) seen.push(t.replace(/ \(\d+ s\)$/, ''));
  }, 500);
  await expect(status).toBeVisible({ timeout: 9 * 60_000 });
  clearInterval(watch);
  const text = await status.textContent();
  console.log(`Stuck-voice steps: ${seen.join(' | ')}; mode=${await page.evaluate(() => localStorage.getItem('ml-voice-mode'))}`);
  console.log(`Stuck-voice fallback: ${text}`);
  expect(text).toContain('one processor core, in the background');
  expect(await page.evaluate(() => localStorage.getItem('ml-voice-mode'))).toBe('single');
});
