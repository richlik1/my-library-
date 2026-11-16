import { expect, test, type Page } from '@playwright/test';
import { speechStub } from './fixtures';

const para = (s: string) => Array(6).fill(s).join(' ');
/** A book whose chapters are out of order (1, 3, 2) and whose last chapter is really two. */
const BOOK = [
  'Chapter 1',
  '',
  para('The keeper climbed the stairs at dusk.'),
  '',
  'Chapter 3',
  '',
  para('Morning brought calm water to the bay.'),
  '',
  'Chapter 2',
  '',
  para('A storm came in from the west that night.'),
  '',
  para('Later the wind dropped and the rain stopped.'),
  '',
  'Chapter 4',
  '',
  para('A page from another book that got mixed in.'),
].join('\n');

async function importBook(page: Page, name = 'Out of Order.txt') {
  await page.getByTestId('file-input').setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(BOOK) });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(speechStub);
});

test('import quality review: problems shown, chapters reordered, renamed, split and removed, then saved', async ({ page }) => {
  await page.goto('./');
  await importBook(page);
  const sheet = page.getByRole('dialog', { name: 'Book added' });
  await expect(sheet).toBeVisible();
  // The contents check is shown before saving, and is honest about the order.
  await expect(sheet.getByRole('region', { name: 'Contents check' })).toContainText('Problems found');
  await sheet.getByRole('button', { name: 'Check chapters and order' }).click();

  await expect(page.getByRole('heading', { name: 'Check this book' })).toBeVisible();
  await expect(page.locator('.review-summary')).toContainText('Order conflicts found');
  const chapters = page.getByRole('list', { name: 'Chapters' });
  await expect(chapters).toContainText('“Chapter 2” comes after chapter 3');

  // Sample text: how a chapter starts and ends.
  await page.getByRole('button', { name: /^Chapter 3 \(number/ }).click();
  await expect(page.locator('.org-sample')).toContainText('Starts: Morning brought calm water');
  // Move Chapter 3 down below Chapter 2.
  await page.getByRole('button', { name: 'Move Chapter 3 down' }).click();
  await expect(page.locator('.review-summary')).not.toContainText('Order conflicts found');

  // Rename and split Chapter 2 (now third) after its second paragraph.
  await page.getByRole('button', { name: /^Chapter 2 \(number/ }).click();
  await page.getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('Chapter title').fill('Chapter 2: The Storm');
  await page.getByRole('button', { name: 'Rename', exact: true }).last().click();
  await page.getByRole('button', { name: 'Split' }).click();
  await page.getByLabel('New chapter title').fill('Chapter 2½: After the Storm');
  await page.getByRole('list', { name: 'Paragraphs' }).getByRole('button', { name: /Later the wind dropped/ }).click();

  // Remove the chapter that doesn't belong.
  await page.getByRole('button', { name: /^Chapter 4 \(number/ }).click();
  await page.getByRole('button', { name: 'Remove' }).click();

  await page.getByRole('button', { name: 'Save chapters' }).click();
  await expect(page.getByText('Chapters saved.')).toBeVisible();

  // The book now has the corrected chapters, and the review is no longer pending on Home.
  await page.goto('./');
  await expect(page.getByRole('region', { name: 'Check your new books' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open Out of Order' }).first().click();
  await page.locator('.player-title').click();
  const list = page.getByRole('dialog', { name: /Chapters/ });
  await expect(list).toContainText('Chapter 2: The Storm');
  await expect(list).toContainText('Chapter 2½: After the Storm');
  await expect(list).not.toContainText('Chapter 4');
  const titles = await list.locator('.list-row, li').allTextContents();
  const order = ['Chapter 1', 'Chapter 2: The Storm', 'Chapter 2½', 'Chapter 3'].map((t) => titles.findIndex((x) => x.includes(t)));
  expect(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1]))).toBe(true);
});

test('importing the same file again is caught, and a copy can still be imported', async ({ page }) => {
  await page.goto('./');
  await importBook(page);
  await page.getByRole('button', { name: 'Save to library' }).click();
  await importBook(page);
  const dup = page.getByRole('dialog', { name: 'Already in your library' });
  await expect(dup).toContainText('Out of Order.txt was imported before');
  await dup.getByRole('button', { name: 'Import a copy' }).click();
  await expect(page.getByRole('dialog', { name: 'Book added' })).toBeVisible();
  await page.getByRole('button', { name: 'Save to library' }).click();
  await expect(page.getByRole('button', { name: 'Open Out of Order' })).toHaveCount(2);
});

test('a book imported with several others waits on Home to be checked', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('file-input').setInputFiles([
    { name: 'First.txt', mimeType: 'text/plain', buffer: Buffer.from(BOOK) },
    { name: 'Second.txt', mimeType: 'text/plain', buffer: Buffer.from(BOOK.replace('keeper', 'warden')) },
  ]);
  const card = page.getByRole('region', { name: 'Check your new books' });
  await expect(card).toContainText('Check “First”');
  await card.getByRole('button', { name: 'Check “Second”' }).click();
  await page.getByRole('button', { name: 'Keep as it is' }).click();
  await expect(page.getByText('Marked as checked.')).toBeVisible();
  await page.goto('./');
  await expect(card.getByRole('button', { name: 'Check “Second”' })).toHaveCount(0);
  await expect(card).toContainText('Check “First”');
});
