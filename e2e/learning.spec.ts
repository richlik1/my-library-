import { expect, test, type Page } from '@playwright/test';
import { speechStub } from './fixtures';

const BOOK = [
  'Chapter 1: Habits',
  '',
  'Small habits compound over time. A habit is a routine you repeat until it becomes automatic.',
  '',
  'Chapter 2: Money',
  '',
  'Pay yourself first by saving before you spend. Compound interest rewards patience.',
].join('\n');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(speechStub);
});

async function openBook(page: Page) {
  await page.goto('./');
  await page.getByTestId('file-input').setInputFiles({ name: 'Learning.txt', mimeType: 'text/plain', buffer: Buffer.from(BOOK) });
  await page.getByRole('button', { name: 'Save to library' }).click();
  await page.getByRole('button', { name: 'Open Learning' }).click();
}

test('Explain this, Apply it and Search the book use real passages with references, never invented answers', async ({ page }) => {
  await openBook(page);
  await page.locator('.chunk', { hasText: 'Small habits compound' }).click();
  await page.getByRole('menu').getByRole('button', { name: 'Play here' }).click();
  await page.getByRole('button', { name: 'Explain this' }).click();
  const sheet = page.getByRole('dialog', { name: 'Ask My Book' });
  await expect(sheet.getByText(/isn’t installed/)).toBeVisible();
  await expect(sheet.locator('.focus')).toContainText('Small habits compound over time.');
  // Narration keeps going underneath.
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();

  await sheet.getByRole('tab', { name: 'Apply it' }).click();
  await sheet.getByLabel(/How will you use this/).fill('Read 10 pages every morning.');
  await sheet.getByRole('button', { name: 'Save action' }).click();
  await expect(sheet.getByText('Read 10 pages every morning.')).toBeVisible();

  await sheet.getByRole('tab', { name: 'Search the book' }).click();
  await sheet.getByLabel('Your question').fill('How should I save money?');
  await sheet.getByRole('button', { name: 'Search' }).click();
  const first = sheet.locator('.hit').first();
  await expect(first.locator('.hit-ref')).toHaveText('Chapter 2: Money');
  await expect(first).toContainText('saving before you spend');
  await first.getByRole('button', { name: 'Go there' }).click();
  await expect(page.locator('.player-title .ct')).toContainText('Chapter 2: Money');

  await page.goto('./#/quotes');
  await expect(page.getByRole('tab', { name: 'action' })).toBeVisible();
  await expect(page.getByText('Read 10 pages every morning.')).toBeVisible();
});

test('Book Club: discuss the current chapter, honest about tests and debate', async ({ page }) => {
  await openBook(page);
  await page.getByRole('button', { name: 'Close player' }).click();
  await page.getByRole('link', { name: 'Discover', exact: true }).click();
  await page.getByRole('link', { name: /^Book Club/ }).click();
  await expect(page.getByText(/Talking about:/)).toContainText('Chapter 1: Habits');
  await page.getByLabel(/In one sentence, what is “Chapter 1: Habits” about/).fill('Tiny routines add up.');
  await page.getByRole('button', { name: 'Save answers' }).click();
  await expect(page.locator('.quote-card').first()).toContainText('Tiny routines add up.');
  await page.getByRole('tab', { name: 'Test me' }).click();
  await expect(page.getByText('No questions for this book yet')).toBeVisible();
  await page.getByRole('tab', { name: 'Debate' }).click();
  await expect(page.getByText('Debate needs an AI model')).toBeVisible();
});

test('background sound plays with narration and fades out when it pauses', async ({ page }) => {
  await openBook(page);
  await page.getByRole('button', { name: 'Voice and speed' }).click();
  const sheet = page.getByRole('dialog', { name: 'Voice & speed' });
  await sheet.getByRole('radio', { name: 'Rain' }).click();
  await expect(sheet.getByLabel('Background volume')).toBeVisible();
  await expect(sheet.getByRole('status').filter({ hasText: /narration|Playing/ })).toHaveText('Plays with narration');
  await sheet.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByTestId('play').click();
  await page.getByRole('button', { name: 'Voice and speed' }).click();
  await expect(sheet.getByRole('status').filter({ hasText: /narration|Playing/ })).toHaveText('Playing');
  await sheet.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Voice and speed' }).click();
  await expect(sheet.getByRole('status').filter({ hasText: /narration|Playing/ })).toHaveText('Plays with narration', { timeout: 5000 });
  // The choice is remembered.
  await page.reload();
  await page.getByRole('button', { name: 'Voice and speed' }).click();
  await expect(sheet.getByRole('radio', { name: 'Rain' })).toHaveAttribute('aria-checked', 'true');
});
