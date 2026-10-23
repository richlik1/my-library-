import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { speechStub } from './fixtures';
// @ts-expect-error plain JS helper
import { serveDir } from './model-server.mjs';

/**
 * Real Piper voice, long listening: the book must keep playing well past the first minute, across the
 * parts of a chapter and into the next chapter, and the place must be saved. Opt-in like piper-real.spec.ts.
 */
const DIR = process.env.PIPER_MODEL_DIR;
test.skip(!DIR || !existsSync(join(DIR, 'en/en_US/lessac/medium/en_US-lessac-medium.onnx')), 'PIPER_MODEL_DIR not set');

const sentences = [
  'The lighthouse stood at the edge of the world.',
  'Every night its keeper climbed the long stairs to light the lamp.',
  'Ships passed far out at sea and never knew his name.',
  'In the morning he wrote the weather in a small grey book.',
  'Gulls argued on the rail while the kettle boiled.',
  'Once a year a boat brought flour, oil and letters from the mainland.',
];
const chapter = (n: number) => `Chapter ${n}\n\n${Array.from({ length: 4 }, (_, i) => sentences.map((s) => `${s.replace('.', '')} in part ${i + 1}.`).join(' ')).join('\n\n')}`;

const mediaTime = (page: Page) =>
  page.evaluate(() => {
    const t = (document.querySelector('.scrub span')?.textContent ?? '0:00').trim().split(':').map(Number);
    return t.length === 2 ? t[0] * 60 + t[1] : 0;
  });

test('real Piper: keeps playing past the first minute and into the next chapter, and saves the place', async ({ page }) => {
  test.setTimeout(10 * 60_000);
  const server = await serveDir(DIR!, 4199);
  page.once('close', () => server.close());
  await page.addInitScript(() => {
    (window as unknown as { __MY_LIBRARY_PIPER_HOST__: string }).__MY_LIBRARY_PIPER_HOST__ = 'http://localhost:4199/';
  });
  await page.addInitScript(speechStub);
  page.on('pageerror', (e) => console.log('page error:', e.message));
  await page.goto('./');
  await page.getByTestId('file-input').setInputFiles({ name: 'long.txt', mimeType: 'text/plain', buffer: Buffer.from(`${chapter(1)}\n\n${chapter(2)}\n\n${chapter(3)}`) });
  await page.getByRole('button', { name: 'Save to library' }).click();
  await page.getByRole('button', { name: 'Open long' }).click();
  await page.getByRole('button', { name: 'Voice and speed' }).click();
  await page.getByRole('radio', { name: 'Fast natural' }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByTestId('play').click();

  // Listen for 3.5 minutes of wall time; log what the player shows every 10 s.
  const t0 = Date.now();
  let heard = 0;
  let lastChange = Date.now();
  let lastKey = '';
  let stalls = 0;
  while (Date.now() - t0 < 210_000) {
    await page.waitForTimeout(10_000);
    const title = (await page.locator('.player-title .ct').textContent())?.trim();
    const t = await mediaTime(page);
    const playing = await page.getByRole('button', { name: 'Pause' }).isVisible();
    const key = `${title}|${t}`;
    if (key !== lastKey) {
      heard += 10;
      lastChange = Date.now();
      lastKey = key;
    } else if (Date.now() - lastChange > 20_000) stalls++;
    console.log(`${Math.round((Date.now() - t0) / 1000)} s: ${title} at ${t} s, ${playing ? 'playing' : 'NOT playing'}`);
    expect(playing, 'the player stopped by itself').toBe(true);
  }
  console.log(`listened about ${heard} s in 210 s; stalls longer than 20 s: ${stalls}`);
  expect(stalls).toBe(0);
  await expect(page.locator('.player-title .ct')).toContainText(/Chapter [23]/);

  // The place is saved: after a restart the book opens where it was.
  await page.getByRole('button', { name: 'Pause' }).click();
  const title = (await page.locator('.player-title .ct').textContent())!;
  const before = (await page.locator('.chunk.active').textContent())!;
  await page.reload();
  await expect(page.locator('.player-title .ct')).toHaveText(title);
  await expect(page.locator('.chunk.active')).toHaveText(before);
});
