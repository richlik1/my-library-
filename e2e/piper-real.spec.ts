import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { speechStub } from './fixtures';
// @ts-expect-error plain JS helper
import { serveDir } from './model-server.mjs';

/**
 * Runs the REAL Piper voice in the browser. Opt-in: needs the voice files on disk, laid out like
 * huggingface.co/rhasspy/piper-voices (e.g. en/en_US/lessac/medium/en_US-lessac-medium.onnx and .onnx.json):
 *
 *   PIPER_MODEL_DIR=/path/to/piper-voices npx playwright test e2e/piper-real.spec.ts --project=desktop
 *
 * Runs in CI by .github/workflows/voice-tests.yml (which downloads the voice).
 */
const DIR = process.env.PIPER_MODEL_DIR;
test.skip(!DIR || !existsSync(join(DIR, 'en/en_US/lessac/medium/en_US-lessac-medium.onnx')), 'PIPER_MODEL_DIR not set');

test.beforeEach(async ({ page }) => {
  const server = await serveDir(DIR!, 4198);
  page.once('close', () => server.close());
  await page.addInitScript(() => {
    (window as unknown as { __MY_LIBRARY_PIPER_HOST__: string }).__MY_LIBRARY_PIPER_HOST__ = 'http://localhost:4198/';
  });
  await page.addInitScript(speechStub);
  page.on('console', (m) => m.type() === 'error' && console.log('browser error:', m.text().slice(0, 300)));
});

test('real Piper: Sound check speed test', async ({ page }) => {
  test.setTimeout(5 * 60_000);
  await page.goto('./#/settings');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const card = page.getByRole('region', { name: 'Sound check' });
  await card.getByRole('button', { name: 'Test fast natural voice' }).click();
  const status = card.getByRole('status').first();
  await expect(status).toContainText(/^(Works|Didn’t work)/, { timeout: 4 * 60_000 });
  console.log(`Piper speed test: ${await status.textContent()}`);
  await expect(status).toContainText(/^Works\./);
});

test('real Piper: a book plays with the fast natural voice', async ({ page }) => {
  test.setTimeout(5 * 60_000);
  await page.goto('./');
  const para = 'The lighthouse stood at the edge of the world. Every night its keeper climbed the long stairs to light the lamp.';
  await page.getByTestId('file-input').setInputFiles({ name: 'piper.txt', mimeType: 'text/plain', buffer: Buffer.from(`Chapter 1\n\n${Array(8).fill(para).join('\n\n')}`) });
  await page.getByRole('button', { name: 'Save to library' }).click();
  await page.getByRole('button', { name: 'Open piper' }).click();
  await page.getByRole('button', { name: 'Voice and speed' }).click();
  await page.getByRole('radio', { name: 'Fast natural' }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  const t0 = Date.now();
  await page.getByTestId('play').click();
  await expect.poll(async () => (await page.locator('.scrub span').first().textContent())?.trim(), { timeout: 4 * 60_000 }).not.toBe('0:00');
  console.log(`Piper: first sound ${((Date.now() - t0) / 1000).toFixed(1)} s after Play (first use, includes download from the local server)`);
  await expect(page.locator('.chunk.active')).toBeVisible();
});
