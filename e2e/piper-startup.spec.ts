import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { speechStub } from './fixtures';
// @ts-expect-error plain JS helper
import { serveDir } from './model-server.mjs';

/**
 * How long the real fast voice takes to start, as a listener sees it. Opt-in like piper-real.spec.ts.
 * The voice is served at ~4 MB/s (a good phone connection), so the first download takes ~15 s.
 */
const DIR = process.env.PIPER_MODEL_DIR;
test.skip(!DIR || !existsSync(join(DIR, 'en/en_US/lessac/medium/en_US-lessac-medium.onnx')), 'PIPER_MODEL_DIR not set');

const para = 'The lighthouse stood at the edge of the world. Every night its keeper climbed the long stairs to light the lamp.';
const bookText = (n: number) => `Chapter 1\n\n${Array(6).fill(`${para} Book ${n}.`).join('\n\n')}\n\nChapter 2\n\n${Array(6).fill(para).join('\n\n')}`;
const time = async (page: Page) => (await page.locator('.scrub span').first().textContent())?.trim();

async function addBook(page: Page, n: number) {
  await page.getByTestId('file-input').setInputFiles({ name: `book${n}.txt`, mimeType: 'text/plain', buffer: Buffer.from(bookText(n)) });
  await page.getByRole('button', { name: 'Save to library' }).click();
  await page.getByRole('button', { name: `Open book${n}` }).click();
}

test('real Piper start-up: first use offers the device voice while downloading; later opens start in seconds', async ({ page }) => {
  test.setTimeout(8 * 60_000);
  const server = await serveDir(DIR!, 4200, 4e6);
  page.once('close', () => server.close());
  await page.addInitScript(() => {
    (window as unknown as { __MY_LIBRARY_PIPER_HOST__: string }).__MY_LIBRARY_PIPER_HOST__ = 'http://localhost:4200/';
  });
  await page.addInitScript(speechStub);
  await page.goto('./');

  // First use: the voice downloads once. The player shows progress and offers the device voice meanwhile.
  await addBook(page, 1);
  await page.getByRole('button', { name: 'Voice and speed' }).click();
  await page.getByRole('radio', { name: 'Fast natural' }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  let t0 = Date.now();
  await page.getByTestId('play').click();
  await expect(page.getByText(/Downloading the voice \(\d+ of 63 MB\)/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Listen with the device voice meanwhile' })).toBeVisible();
  await expect.poll(() => time(page), { timeout: 4 * 60_000 }).not.toBe('0:00');
  const firstUse = (Date.now() - t0) / 1000;
  await page.getByRole('button', { name: 'Pause' }).click();

  // Later: the app is opened again. A new book uses the fast voice by itself and starts quickly.
  await page.goto('./#/');
  await page.reload();
  await page.waitForTimeout(3000); // the time it takes to pick a book
  await addBook(page, 2);
  await expect(page.getByRole('button', { name: 'Voice and speed' })).toContainText('Lessac');
  t0 = Date.now();
  await page.getByTestId('play').click();
  await expect.poll(() => time(page), { timeout: 60_000 }).not.toBe('0:00');
  const later = (Date.now() - t0) / 1000;
  console.log(`first sound after Play: first use ${firstUse.toFixed(1)} s (includes the 63 MB download at 4 MB/s); later opens ${later.toFixed(1)} s`);
  expect(later).toBeLessThan(4);
});

test('real Piper start-up: switching to the device voice during the download, then back when it is ready', async ({ page }) => {
  test.setTimeout(6 * 60_000);
  const server = await serveDir(DIR!, 4201, 4e6);
  page.once('close', () => server.close());
  await page.addInitScript(() => {
    (window as unknown as { __MY_LIBRARY_PIPER_HOST__: string }).__MY_LIBRARY_PIPER_HOST__ = 'http://localhost:4201/';
  });
  await page.addInitScript(speechStub);
  await page.goto('./');
  await addBook(page, 3);
  await page.getByRole('button', { name: 'Voice and speed' }).click();
  await page.getByRole('radio', { name: 'Fast natural' }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByTestId('play').click();
  await page.getByRole('button', { name: 'Listen with the device voice meanwhile' }).click({ timeout: 30_000 });
  // The device voice reads right away.
  await page.getByTestId('play').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.length), { timeout: 10_000 }).toBeGreaterThan(0);
  // When the download finishes, the natural voice is offered back.
  await page.getByRole('button', { name: 'Switch' }).click({ timeout: 3 * 60_000 });
  await expect(page.getByRole('button', { name: 'Voice and speed' })).toContainText('Lessac');
});

test('real Piper: the Home card downloads the voice ahead of time, then books use it and start quickly', async ({ page }) => {
  test.setTimeout(6 * 60_000);
  const server = await serveDir(DIR!, 4202, 4e6);
  page.once('close', () => server.close());
  await page.addInitScript(() => {
    (window as unknown as { __MY_LIBRARY_PIPER_HOST__: string }).__MY_LIBRARY_PIPER_HOST__ = 'http://localhost:4202/';
  });
  await page.addInitScript(speechStub);
  await page.goto('./');
  await page.getByRole('button', { name: 'Try a sample book' }).click().catch(() => undefined);
  await page.goto('./');
  const card = page.getByRole('region', { name: 'Get the natural voice' });
  await card.getByRole('button', { name: 'Download' }).click();
  await expect(card.getByRole('status')).toContainText(/Downloading the voice/);
  await expect(page.getByRole('region', { name: 'Natural voice ready' })).toBeVisible({ timeout: 3 * 60_000 });
  // A new book now reads with the natural voice, without choosing it, and starts quickly.
  await addBook(page, 4);
  await expect(page.getByRole('button', { name: 'Voice and speed' })).toContainText('Lessac');
  const t0 = Date.now();
  await page.getByTestId('play').click();
  await expect.poll(() => time(page), { timeout: 60_000 }).not.toBe('0:00');
  console.log(`first sound after Play once the voice was downloaded from Home: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  expect(Date.now() - t0).toBeLessThan(4000);
  // The card is gone once the voice works.
  await page.getByRole('button', { name: 'Close player' }).click();
  await expect(page.getByRole('region', { name: /natural voice/i })).toHaveCount(0);
});
