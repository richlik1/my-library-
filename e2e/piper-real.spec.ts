import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
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
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log(`browser ${m.type()}:`, m.text().slice(0, 300)));
  page.on('pageerror', (e) => console.log('page error:', e.message));
  // Optional: a slower processor, like a phone (Chromium only).
  if (process.env.CPU_SLOWDOWN && page.context().browser()?.browserType().name() === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU_SLOWDOWN) });
  }
});

test('real Piper: Sound check speed test', async ({ page }) => {
  test.setTimeout(5 * 60_000);
  await page.goto('./#/settings');
  // Wait (briefly) for the service worker, then reload so the page runs as installed.
  await page.evaluate(() => Promise.race([navigator.serviceWorker?.ready, new Promise((r) => setTimeout(r, 10_000))]));
  await page.reload();
  console.log(`crossOriginIsolated=${await page.evaluate(() => crossOriginIsolated)}`);
  const card = page.getByRole('region', { name: 'Sound check' });
  await card.getByRole('button', { name: 'Test fast natural voice' }).click();
  const status = card.getByRole('status').first();
  const seen: string[] = [];
  const watch = setInterval(async () => {
    const t = await status.textContent().catch(() => null);
    if (t && seen.at(-1) !== t) seen.push(t);
  }, 1000);
  try {
    await expect(status).toContainText(/^(Works|Didn’t work)/, { timeout: 4 * 60_000 });
  } finally {
    clearInterval(watch);
    console.log(`Piper steps: ${seen.join(' | ')}`);
    const log = await card.locator('.voice-log').textContent().catch(() => '(no log)');
    console.log(`Piper sound-check report:\n${log}`);
  }
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

/** Longest time (ms) the page couldn't respond to a tap during `ms` of watching. */
const worstTapDelay = (page: Page, ms: number) =>
  page.evaluate(
    (ms) =>
      new Promise<number>((resolve) => {
        let worst = 0;
        let last = performance.now();
        const t = setInterval(() => {
          const now = performance.now();
          worst = Math.max(worst, now - last - 50);
          last = now;
        }, 50);
        setTimeout(() => {
          clearInterval(t);
          resolve(Math.round(worst));
        }, ms);
      }),
    ms,
  );

test('real Piper: buttons respond and Pause stops the sound while the voice is making audio', async ({ page }) => {
  test.setTimeout(5 * 60_000);
  await page.goto('./');
  const para = 'The lighthouse stood at the edge of the world. Every night its keeper climbed the long stairs to light the lamp.';
  await page.getByTestId('file-input').setInputFiles({ name: 'buttons.txt', mimeType: 'text/plain', buffer: Buffer.from(`Chapter 1\n\n${Array(12).fill(para).join('\n\n')}\n\nChapter 2\n\n${Array(12).fill(para).join('\n\n')}`) });
  await page.getByRole('button', { name: 'Save to library' }).click();
  await page.getByRole('button', { name: 'Open buttons' }).click();
  await page.getByRole('button', { name: 'Voice and speed' }).click();
  await page.getByRole('radio', { name: 'Fast natural' }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByTestId('play').click();
  const time = async () => (await page.locator('.scrub span').first().textContent())?.trim();
  await expect.poll(time, { timeout: 4 * 60_000 }).not.toBe('0:00');

  // The voice is making the rest of the book now; the page must stay responsive.
  const worst = await worstTapDelay(page, 10_000);
  console.log(`longest wait for a tap while the voice works: ${worst} ms`);
  expect(worst).toBeLessThan(500);

  // Pause stops the sound, and it stays stopped.
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible({ timeout: 1000 });
  const paused = await page.evaluate(() => [...document.querySelectorAll('audio')].every((a) => a.paused));
  const at = await time();
  await page.waitForTimeout(3000);
  expect(await time()).toBe(at);
  expect(paused).toBe(true);

  // Other buttons work: forward 30 s, next chapter, play again.
  await page.getByRole('button', { name: 'Forward 30 seconds' }).click();
  await expect.poll(time).not.toBe(at);
  await page.getByTestId('play').click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 1000 });
  const resumed = await time();
  await expect.poll(time, { timeout: 15_000 }).not.toBe(resumed);
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible({ timeout: 1000 });
});

test('real Piper: a stuck voice is reported, offers the device voice, and never freezes the screen', async ({ page }) => {
  test.setTimeout(5 * 60_000);
  await page.addInitScript(() => {
    (window as unknown as { __MY_LIBRARY_VOICE_HANG__: string }).__MY_LIBRARY_VOICE_HANG__ = 'piper';
  });
  await page.goto('./#/settings');
  const card = page.getByRole('region', { name: 'Sound check' });
  await card.getByRole('button', { name: 'Test fast natural voice' }).click();
  const status = card.getByRole('status').first();
  const worst = await worstTapDelay(page, 20_000);
  console.log(`longest wait for a tap while the voice is stuck: ${worst} ms`);
  expect(worst).toBeLessThan(500);
  await expect(status).toContainText(/^(Works|Didn’t work)/, { timeout: 4 * 60_000 });
  console.log(`stuck voice report:\n${await card.locator('.voice-log').textContent().catch(() => '(no log)')}`);
  await expect(status).toContainText(/^Didn’t work/);
  await expect(card.locator('.voice-log')).toContainText('piper: failed after');
});
