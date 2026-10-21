import { expect, test, type Page } from '@playwright/test';
import { samplePdf, scannedPdf, speechStub } from './fixtures';

const spoken = (page: Page) => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
const savedOffset = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const req = indexedDB.open('my-library');
        req.onsuccess = () => {
          const all = req.result.transaction('progress').objectStore('progress').getAll();
          all.onsuccess = () => resolve(all.result[0]?.offset ?? -1);
        };
      }),
  );
const finish = (page: Page) => page.evaluate(() => (window as unknown as { __finish: () => void }).__finish());

test.beforeEach(async ({ page }) => {
  await page.addInitScript(speechStub);
});

async function importSample(page: Page) {
  await page.goto('./');
  await expect(page.getByText('Your private audiobook shelf')).toBeVisible();
  await page.getByTestId('file-input').setInputFiles({ name: 'lighthouse.pdf', mimeType: 'application/pdf', buffer: await samplePdf() });
  await expect(page.getByRole('dialog', { name: 'Book added' })).toBeVisible();
  await expect(page.getByLabel('Title')).toHaveValue('The Lighthouse Keeper');
  await page.getByLabel('Category').selectOption('Fiction');
  await page.getByRole('button', { name: 'Save to library' }).click();
  await expect(page.getByRole('button', { name: 'Open The Lighthouse Keeper' })).toBeVisible();
}

test('upload a PDF, read it aloud, pause and resume where I stopped', async ({ page }) => {
  await importSample(page);
  await page.getByRole('button', { name: 'Open The Lighthouse Keeper' }).click();
  await expect(page.locator('.reader')).toContainText('The lighthouse stood at the edge of the world.');

  await page.getByTestId('play').click();
  await expect.poll(() => spoken(page)).toEqual(['Chapter 1']);
  await finish(page);
  await expect.poll(() => spoken(page)).toContain('The lighthouse stood at the edge of the world.');
  await expect(page.locator('.chunk.active')).toHaveText('The lighthouse stood at the edge of the world.');
  await finish(page);
  await expect.poll(async () => (await spoken(page)).at(-1)).toBe('Every night its keeper climbed the long stairs.');

  // Pause, leave, and come back: playback resumes at the same sentence.
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect.poll(() => savedOffset(page)).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator('.chunk.active')).toHaveText('Every night its keeper climbed the long stairs.');
  await page.getByTestId('play').click();
  await expect.poll(async () => (await spoken(page)).at(-1)).toBe('Every night its keeper climbed the long stairs.');

  // Skip forward/back by sentence and to the next chapter.
  await page.getByRole('button', { name: 'Forward one sentence' }).click();
  await expect.poll(async () => (await spoken(page)).at(-1)).toBe('He never missed a single evening.');
  await page.getByLabel('Next chapter', { exact: true }).click();
  await expect.poll(async () => (await spoken(page)).at(-1)).toBe('Chapter 2');
  await expect(page.locator('.player-title .ct')).toContainText('Chapter 2');

  // The library shows progress and "continue listening".
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Back to library' }).click();
  await expect(page.getByText('Continue listening')).toBeVisible();
  await expect(page.locator('.hero-eyebrow')).toContainText('% complete');
});

test('voice and speed changes are applied to narration', async ({ page }) => {
  await importSample(page);
  await page.getByRole('button', { name: 'Open The Lighthouse Keeper' }).click();
  await page.getByRole('button', { name: /Voice/ }).click();
  await page.getByRole('button', { name: '1.5×' }).click();
  await page.getByRole('button', { name: /^Daniel/ }).click();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByTestId('play').click();
  await expect.poll(() => spoken(page)).toHaveLength(1);
  const u = await page.evaluate(() => {
    const c = (window as unknown as { __current: { rate: number; voice: { name: string } } }).__current;
    return { rate: c.rate, voice: c.voice?.name };
  });
  expect(u).toEqual({ rate: 1.5, voice: 'Daniel (Enhanced)' });
});

test('highlights, notes and bookmarks are saved', async ({ page }) => {
  await importSample(page);
  await page.getByRole('button', { name: 'Open The Lighthouse Keeper' }).click();
  await page.locator('.chunk', { hasText: 'The lighthouse stood' }).click();
  await page.getByRole('menu').getByRole('button', { name: 'Highlight' }).click();
  await expect(page.locator('mark.hl-gold')).toHaveText('The lighthouse stood at the edge of the world.');

  await page.locator('.chunk', { hasText: 'Every night' }).click();
  await page.getByRole('menu').getByRole('button', { name: 'Note' }).click();
  await page.getByLabel('Your note').fill('Remember the stairs');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.locator('.note-pin')).toHaveCount(1);

  await page.getByRole('button', { name: 'Bookmark', exact: true }).click();
  await page.getByRole('button', { name: /^Notes/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Notes & highlights' });
  await expect(sheet.getByText('Remember the stairs')).toBeVisible();
  await expect(sheet.locator('.quote')).toHaveCount(3);

  await page.reload();
  await expect(page.locator('mark.hl-gold')).toHaveCount(2); // highlight + note highlight
});

test('scanned PDFs explain that OCR is required', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('file-input').setInputFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer: await scannedPdf() });
  const dialog = page.getByRole('dialog', { name: 'This PDF needs OCR' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('pictures of text');
});

test('TXT import and backup export/restore', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('file-input').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Chapter 1\n\nHello from a text file.\n\nChapter 2\n\nGoodbye.'),
  });
  await page.getByRole('button', { name: 'Save to library' }).click();
  await page.getByRole('button', { name: 'Settings and backup' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export backup' }).click()]);
  const path = await download.path();
  expect(download.suggestedFilename()).toMatch(/^my-library-backup-.*\.json$/);

  // Wipe the library and restore it from the backup file.
  await page.evaluate(() => new Promise((r) => { const req = indexedDB.deleteDatabase('my-library'); req.onsuccess = req.onerror = req.onblocked = r; }));
  await page.goto('./#/settings');
  await page.reload();
  await page.locator('input[type=file][accept*="json"]').setInputFiles(path);
  await expect(page.getByText(/Restored 1 book/)).toBeVisible();
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Open notes' })).toBeVisible();
});

test('works offline after the first visit', async ({ page, context }) => {
  await importSample(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // let the service worker take control
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open The Lighthouse Keeper' })).toBeVisible();
  await page.getByRole('button', { name: 'Open The Lighthouse Keeper' }).click();
  await page.getByTestId('play').click();
  await expect.poll(() => spoken(page)).toEqual(['Chapter 1']);
  // Importing a PDF offline works too (PDF.js and its worker are cached).
  await page.goto('./');
  await page.getByTestId('file-input').setInputFiles({ name: 'second.pdf', mimeType: 'application/pdf', buffer: await samplePdf() });
  await expect(page.getByRole('dialog', { name: 'Book added' })).toBeVisible();
  await context.setOffline(false);
});

test('the built-in sample book starts reading immediately', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Try a sample book' }).click();
  await expect(page.locator('.player-title .bt')).toHaveText('Welcome to My Library');
  await expect.poll(() => spoken(page)).toEqual(['Welcome']);
  await finish(page);
  await expect.poll(async () => (await spoken(page)).at(-1)).toMatch(/^Welcome to My Library, your private audiobook shelf/);
});

test('tapping Add opens the file picker, and pasted text becomes a book', async ({ page }) => {
  await page.goto('./');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByText('Add your first book').click()]);
  await chooser.setFiles({ name: 'tapped.txt', mimeType: 'text/plain', buffer: Buffer.from('Picked through the real file picker.') });
  await page.getByRole('button', { name: 'Save to library' }).click();
  await expect(page.getByRole('button', { name: 'Open tapped' })).toBeVisible();

  await page.getByRole('button', { name: 'Paste text as a book' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('My pasted chapter');
  await page.getByRole('textbox', { name: 'Text' }).fill('This text was pasted in. It should be read aloud.');
  await page.getByRole('button', { name: 'Save to library' }).click();
  await page.getByRole('button', { name: 'Open My pasted chapter' }).click();
  await page.getByTestId('play').click();
  await expect.poll(() => spoken(page)).toEqual(['This text was pasted in. It should be read aloud.']);
});

test('PDF import still works when the browser blocks the PDF worker file', async ({ page }) => {
  // Simulates restricted viewers (embedded pages, some in-app browsers) that refuse to start the worker.
  await page.route(/pdf\.worker[^/]*\.mjs/, (route) => route.abort());
  await page.goto('./');
  await page.getByTestId('file-input').setInputFiles({ name: 'lighthouse.pdf', mimeType: 'application/pdf', buffer: await samplePdf() });
  await expect(page.getByRole('dialog', { name: 'Book added' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('Title')).toHaveValue('The Lighthouse Keeper');
});
