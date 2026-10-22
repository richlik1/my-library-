import { expect, test, type Page } from '@playwright/test';
import { speechStub } from './fixtures';

const BOOK = ['Chapter 1', '', 'The first chapter opens here.', '', 'Chapter 2', '', 'Discipline is choosing what you want most over what you want now.'].join('\n');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(speechStub);
});

async function addBook(page: Page) {
  await page.goto('./');
  await page.getByTestId('file-input').setInputFiles({ name: 'Habits.txt', mimeType: 'text/plain', buffer: Buffer.from(BOOK) });
  await page.getByRole('button', { name: 'Save to library' }).click();
}

const idbAll = (page: Page, store: string) =>
  page.evaluate(
    (store) =>
      new Promise<unknown[]>((resolve) => {
        const req = indexedDB.open('my-library');
        req.onsuccess = () => {
          const all = req.result.transaction(store).objectStore(store).getAll();
          all.onsuccess = () => resolve(all.result);
        };
      }),
    store,
  );

test('listening time is measured from playback and drives the daily goal', async ({ page }) => {
  await addBook(page);
  await page.getByRole('button', { name: 'Open Habits' }).click();
  await page.getByTestId('play').click();
  await page.waitForTimeout(3500);
  await page.getByRole('button', { name: 'Pause' }).click();
  // Paused time doesn't count.
  await page.waitForTimeout(2500);
  const days = (await idbAll(page, 'listening')) as Array<{ seconds: number }>;
  expect(days).toHaveLength(1);
  expect(days[0].seconds).toBeGreaterThan(2);
  expect(days[0].seconds).toBeLessThan(5);

  await page.getByRole('button', { name: 'Close player' }).click();
  await expect(page.getByRole('link', { name: /Daily goal: 0 of 15 minutes completed/ })).toBeVisible();

  // Pretend 20 minutes were listened today (as if over a longer session): the goal is met.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const req = indexedDB.open('my-library');
        req.onsuccess = () => {
          const tx = req.result.transaction(['listening', 'xp'], 'readwrite');
          const d = new Date();
          const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          tx.objectStore('listening').put({ date, seconds: 1200, byBook: { earlier: 1200 } });
          tx.objectStore('xp').put({ id: `listen:${date}`, kind: 'listening', amount: 20, at: Date.now(), label: `Listened 20 min on ${date}` });
          tx.oncomplete = () => resolve();
        };
      }),
  );
  await page.reload();
  await expect(page.getByText('You finished your reading goal today.')).toBeVisible();

  await page.getByRole('link', { name: 'Progress', exact: true }).click();
  await expect(page.getByText('Level 1 · Beginner')).toBeVisible();
  await expect(page.getByText('20 XP', { exact: true })).toBeVisible();
  await page.getByRole('radio', { name: '30 min' }).click();
  await expect(page.getByText('20 of 30 minutes completed.')).toBeVisible();
  await expect(page.locator('.achievements li.earned', { hasText: 'First Book' })).toBeVisible();

  // Gamification can be turned off.
  await page.getByLabel(/Goals, XP and achievements/).uncheck();
  await expect(page.getByText(/Level 1/)).toHaveCount(0);
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('link', { name: /Daily goal/ })).toHaveCount(0);
});

test('save a lesson while listening, then find, tag, favorite, review and export it', async ({ page }) => {
  await addBook(page);
  await page.getByRole('button', { name: 'Open Habits' }).click();
  await page.getByLabel('Next chapter', { exact: true }).click();
  await page.locator('.chunk', { hasText: 'Discipline is choosing' }).click();
  await page.getByRole('menu').getByRole('button', { name: 'Play here' }).click();
  await page.getByRole('button', { name: 'Save this sentence as a lesson' }).click();
  await expect(page.getByText('Saved to your quotes as a lesson')).toBeVisible();
  // Narration was not interrupted.
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.getByRole('button', { name: 'Pause' }).click();

  await page.goto('./#/quotes');
  const card = page.getByRole('article', { name: 'Quote from Habits' });
  await expect(card).toContainText('Discipline is choosing what you want most');
  await expect(card).toContainText('Habits · Chapter 2');
  await expect(card).toContainText('lesson');

  await card.getByRole('button', { name: 'Add to favorites' }).click();
  await page.getByRole('tab', { name: 'Favorites' }).click();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Edit note and tags' }).click();
  await page.getByLabel('Your note').fill('Use this before every big decision.');
  await page.getByLabel(/Tags/).fill('lesson, decisions');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(card).toContainText('Use this before every big decision.');
  await expect(page.getByRole('tab', { name: 'decisions' })).toBeVisible();
  await page.getByLabel('Search quotes').fill('big decision');
  await expect(card).toBeVisible();
  await page.getByLabel('Search quotes').fill('nothing like this');
  await expect(card).toHaveCount(0);
  await page.getByLabel('Search quotes').fill('');

  // Daily review: 5 XP once a day.
  await page.getByRole('button', { name: 'Reviewed' }).click();
  await expect(page.getByText('+5 XP for today’s review')).toBeVisible();
  const xp = (await idbAll(page, 'xp')) as Array<{ id: string }>;
  expect(xp.filter((e) => e.id.startsWith('review:'))).toHaveLength(1);

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^My quotes .*\.md$/);

  // Back to the exact passage in the book.
  await card.getByRole('button', { name: 'Open in the book' }).click();
  await expect(page.locator('.player-title .ct')).toContainText('Chapter 2');
});
