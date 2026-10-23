import { PDFDocument, StandardFonts } from 'pdf-lib';
import { expect, test, type Page } from '@playwright/test';
import { speechStub, testEngine } from './fixtures';

/**
 * Milestone 1 — the core loop, tested as one workflow:
 * import a PDF → cleaned text → natural-voice audio → play → current sentence highlighted →
 * save a lesson → go offline → restart → resume at the same place and play from the cache.
 */

/** A 3-page PDF with a running header, page numbers and a word hyphenated across lines. */
async function fieldGuidePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle('Field Guide');
  doc.setAuthor('A. Ranger');
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const pages = [
    ['Chapter 1', '', 'The trail begins at the old light-', 'house near the bay. Walkers start early.', '', 'Bring water and a map for the hills.'],
    ['Chapter 2', '', 'The ridge path climbs slowly through pine forest.', 'Rest at the stone bench before the summit.'],
    ['Chapter 3', '', 'The descent follows the river back to town.', 'The cafe by the bridge serves warm soup.'],
  ];
  pages.forEach((lines, i) => {
    const page = doc.addPage([420, 600]);
    page.drawText('FIELD GUIDE · Coastal Walks', { x: 40, y: 570, size: 9, font });
    lines.forEach((line, j) => line && page.drawText(line, { x: 40, y: 520 - j * 16, size: 12, font }));
    page.drawText(String(i + 1), { x: 205, y: 30, size: 9, font });
  });
  return Buffer.from(await doc.save());
}

const engineCalls = (page: Page) => page.evaluate(() => (window as unknown as { __engineCalls: string[] }).__engineCalls.length);
const timeShown = async (page: Page) => (await page.locator('.scrub span').first().textContent())?.trim();

test.beforeEach(async ({ page }) => {
  await page.addInitScript(speechStub);
  await page.addInitScript(testEngine);
});

test('core loop: import → clean text → natural voice → highlight → save lesson → offline restart → resume', async ({ page, context }) => {
  // The app is installed for offline use (service worker ready).
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);

  // 1. Import.
  await page.getByTestId('file-input').setInputFiles({ name: 'field-guide.pdf', mimeType: 'application/pdf', buffer: await fieldGuidePdf() });
  await expect(page.getByRole('dialog', { name: 'Book added' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Save to library' }).click();
  await page.getByRole('button', { name: 'Open Field Guide' }).click();

  // 2. Cleaned text: no running header or page numbers; hyphenation joined; chapters detected.
  const reader = page.locator('.reader');
  await expect(reader).toContainText('The trail begins at the old lighthouse near the bay.');
  await expect(reader).not.toContainText('FIELD GUIDE');
  await expect(page.locator('.player-title .ct')).toContainText('Chapter 1 · 1/3');

  // 3. Natural voice: audio is generated and played as an audio file.
  await page.getByRole('button', { name: 'Voice and speed' }).click();
  await page.getByRole('radio', { name: 'Natural voice' }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('.chunk', { hasText: 'Bring water and a map' }).click();
  await page.getByRole('menu').getByRole('button', { name: 'Play here' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect.poll(() => timeShown(page), { timeout: 15_000 }).not.toBe('0:00');

  // 4. The sentence being heard is highlighted; no estimated word highlight for this voice.
  await expect(page.locator('.chunk.active')).toContainText('Bring water and a map for the hills.');
  await expect(page.locator('.chunk.active .word')).toHaveCount(0);

  // 5. Save it as a lesson without stopping narration.
  await page.getByRole('button', { name: 'Save this sentence as a lesson' }).click();
  await expect(page.getByText('Saved to your quotes as a lesson')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  // The message never covers the buttons at the top.
  const toastBox = (await page.locator('.toast').first().boundingBox())!;
  for (const name of ['Close player', 'Ask My Book', 'Book details']) {
    const b = (await page.getByRole('button', { name }).boundingBox())!;
    expect(b.y + b.height <= toastBox.y || b.y >= toastBox.y + toastBox.height, `${name} is not covered`).toBe(true);
  }
  await page.getByRole('button', { name: 'Pause' }).click();

  // 6. Offline, then restart the app.
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.player-title .ct')).toContainText('Chapter 1');

  // 7. Resume at the same sentence and play from the cached audio (no new generation).
  await expect(page.locator('.chunk.active')).toContainText('Bring water and a map for the hills.');
  await page.getByTestId('play').click();
  await expect.poll(() => timeShown(page), { timeout: 10_000 }).not.toBe('0:00');
  expect(await engineCalls(page)).toBe(0); // counter restarts with the page; nothing was generated again
  await page.getByRole('button', { name: 'Pause' }).click();

  // 8. The lesson is there offline, pointing at the right book and chapter.
  await page.goto('./#/quotes');
  const card = page.getByRole('article', { name: 'Quote from Field Guide' });
  await expect(card).toContainText('Bring water and a map for the hills.');
  await expect(card).toContainText('Field Guide, A. Ranger · Chapter 1');
  await expect(card).toContainText('lesson');
  await context.setOffline(false);
});

test('fixing a chapter’s text: notes follow their words and the new text is read', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('file-input').setInputFiles({ name: 'field-guide.pdf', mimeType: 'application/pdf', buffer: await fieldGuidePdf() });
  await expect(page.getByRole('dialog', { name: 'Book added' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Save to library' }).click();
  await page.getByRole('button', { name: 'Open Field Guide' }).click();
  await page.locator('.chunk', { hasText: 'Bring water and a map' }).click();
  await page.getByRole('menu').getByRole('button', { name: 'Highlight' }).click();

  await page.locator('.player-title').click();
  await page.getByRole('button', { name: /Fix the text of this chapter/ }).click();
  const editor = page.getByRole('textbox', { name: 'Text', exact: true });
  await editor.fill(`A short note added by me.\n\n${await editor.inputValue()}`);
  await page.getByRole('button', { name: 'Save corrected text' }).click();
  await expect(page.getByText('Text saved')).toBeVisible();
  await expect(page.locator('.reader')).toContainText('A short note added by me.');
  // The highlight moved with its sentence.
  await expect(page.locator('.reader mark', { hasText: 'Bring water and a map' })).toBeVisible();
  // Device voice reads the corrected text from the start.
  await page.locator('.chunk', { hasText: 'A short note added by me.' }).click();
  await page.getByRole('menu').getByRole('button', { name: 'Play here' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.at(-1)))
    .toBe('A short note added by me.');
});
