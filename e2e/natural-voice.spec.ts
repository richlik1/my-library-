import { expect, test, type Page } from '@playwright/test';
import { speechStub, testEngine } from './fixtures';

const BOOK = ['Chapter 1', '', 'The first chapter has one short sentence.', '', 'Chapter 2', '', 'The second chapter starts here and keeps going.'].join('\n');

async function openBookWithNaturalVoice(page: Page) {
  await page.goto('./');
  await page.getByTestId('file-input').setInputFiles({ name: 'two.txt', mimeType: 'text/plain', buffer: Buffer.from(BOOK) });
  await page.getByRole('button', { name: 'Save to library' }).click();
  await page.getByRole('button', { name: 'Open two' }).click();
  await page.getByRole('button', { name: /Voice/ }).click();
  await page.getByRole('radio', { name: 'Natural voice' }).click();
  await expect(page.getByText(/of 2 chapters ready/)).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
}

const timeShown = async (page: Page) => (await page.locator('.scrub span').first().textContent())?.trim();

test.beforeEach(async ({ page }) => {
  await page.addInitScript(speechStub);
  await page.addInitScript(testEngine);
});

test('natural voice: generate, play audio file, skip, auto-advance, resume', async ({ page }) => {
  await openBookWithNaturalVoice(page);
  await expect(page.getByLabel('Back 15 seconds')).toBeVisible();
  // Switching to the natural voice starts preparing the current chapter right away.

  await page.getByTestId('play').click();
  // Generates chapter 1, then plays it as an audio file.
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect.poll(() => timeShown(page), { timeout: 15_000 }).not.toBe('0:00');
  // The sentence being heard is highlighted.
  await expect(page.locator('.chunk.active')).toBeVisible();

  // The next chapter is generated ahead of time.
  await expect.poll(() => page.evaluate(() => (window as unknown as { __engineCalls: string[] }).__engineCalls.join('|')), { timeout: 15_000 }).toContain(
    'The second chapter starts here',
  );

  // +30 s passes the end of this short chapter and moves to the next one.
  await page.getByLabel('Forward 30 seconds').click();
  await expect(page.locator('.player-title .ct')).toContainText('Chapter 2');
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();

  // Let it play a moment, pause, and check the place is kept after a reload.
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.reload();
  await expect(page.locator('.player-title .ct')).toContainText('Chapter 2');
  // Audio was cached: no new generation needed, play starts right away.
  const callsBefore = await page.evaluate(() => (window as unknown as { __engineCalls: string[] }).__engineCalls.length);
  await page.getByTestId('play').click();
  await expect.poll(() => timeShown(page), { timeout: 10_000 }).not.toBe('0:00');
  expect(await page.evaluate(() => (window as unknown as { __engineCalls: string[] }).__engineCalls.length)).toBe(callsBefore);
});

test('natural voice: plays through to the next chapter by itself', async ({ page }) => {
  await openBookWithNaturalVoice(page);
  await page.getByRole('button', { name: /Voice/ }).click();
  await page.getByRole('button', { name: 'Generate whole book' }).click();
  await expect(page.getByText(/2 of 2 chapters ready/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByTestId('play').click();
  // Chapter 1 is about 3 s long; it should roll into chapter 2 without a tap.
  await expect(page.locator('.player-title .ct')).toContainText('Chapter 2', { timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
});

test('natural voice: pronunciations are used, a chapter can be regenerated and saved', async ({ page }) => {
  await page.goto('./#/settings');
  await page.getByRole('radio', { name: 'Long' }).click();
  await page.getByLabel('Word').fill('chapter');
  await page.getByLabel('Say it as').fill('CHAP-TER');
  await page.getByLabel('Say it as').press('Enter');
  await expect(page.getByLabel('Pronunciations')).toContainText('CHAP-TER');

  await openBookWithNaturalVoice(page);
  await page.getByRole('button', { name: /Voice/ }).click();
  await expect(page.getByRole('button', { name: 'This chapter is ready' })).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => (window as unknown as { __engineCalls: string[] }).__engineCalls.join('|'))).toContain('CHAP-TER');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Save this chapter/ }).click();
  expect((await download).suggestedFilename()).toMatch(/^two - 01 .*\.wav$/);

  const before = await page.evaluate(() => (window as unknown as { __engineCalls: string[] }).__engineCalls.length);
  await page.getByRole('button', { name: 'Regenerate this chapter' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __engineCalls: string[] }).__engineCalls.length), { timeout: 15_000 }).toBeGreaterThan(before);
  await expect(page.getByRole('button', { name: 'This chapter is ready' })).toBeVisible({ timeout: 15_000 });
});

test('natural voice: a long chapter starts playing after its first sentences and continues part by part', async ({ page }) => {
  // Slower, shorter-audio stand-in: 60 ms of work and 12 ms of audio per character.
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, { synthesize: (t: string) => Promise<unknown> } & Record<string, unknown>>;
    const engine = w.__MY_LIBRARY_TEST_ENGINE__;
    engine.synthesize = async (text: string) => {
      (w.__engineCalls as unknown as string[]).push(text);
      await new Promise((r) => setTimeout(r, 60));
      const sr = 8000;
      const s = new Float32Array(Math.round(text.length * 0.012 * sr));
      for (let i = 0; i < s.length; i++) s[i] = 0.05 * Math.sin((2 * Math.PI * 220 * i) / sr);
      return { samples: s, sampleRate: sr };
    };
  });
  const sentences = Array.from({ length: 40 }, (_, i) => `Sentence ${i + 1} of the long chapter.`).join(' ');
  await page.goto('./');
  await page.getByTestId('file-input').setInputFiles({ name: 'long.txt', mimeType: 'text/plain', buffer: Buffer.from(`Chapter 1\n\n${sentences}`) });
  await page.getByRole('button', { name: 'Save to library' }).click();
  await page.getByRole('button', { name: 'Open long' }).click();
  await page.getByRole('button', { name: /Voice/ }).click();
  await page.getByRole('radio', { name: 'Natural voice' }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByTestId('play').click();
  // Playing begins while the chapter is still being made.
  await expect.poll(() => timeShown(page), { timeout: 10_000 }).not.toBe('0:00');
  const calls = await page.evaluate(() => (window as unknown as { __engineCalls: string[] }).__engineCalls.length);
  expect(calls).toBeLessThan(40);
  // ...and carries on into later parts without stopping.
  await expect(page.locator('.chunk.active')).toContainText(/Sentence (1[0-9]|2[0-9]) /, { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
});
