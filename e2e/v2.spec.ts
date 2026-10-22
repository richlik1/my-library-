import { expect, test, type Page } from '@playwright/test';
import { samplePdf, speechStub } from './fixtures';

const spoken = (page: Page) => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
const finish = (page: Page) => page.evaluate(() => (window as unknown as { __finish: () => void }).__finish());

const BOOK = ['Chapter 1', '', 'The first chapter opens here.', 'It has a second sentence too.', '', 'Chapter 2', '', 'The second chapter is short.'].join('\n');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(speechStub);
});

async function addBook(page: Page, name = 'Field Notes') {
  await page.goto('./');
  await page.getByTestId('file-input').setInputFiles({ name: `${name}.txt`, mimeType: 'text/plain', buffer: Buffer.from(BOOK) });
  await page.getByRole('button', { name: 'Save to library' }).click();
}

test('playback keeps going while browsing, with a mini-player, and resumes from Home', async ({ page }) => {
  await addBook(page);
  await page.getByRole('button', { name: 'Open Field Notes' }).click();
  await page.getByTestId('play').click();
  await expect.poll(() => spoken(page)).toEqual(['Chapter 1']);
  await page.getByRole('button', { name: 'Close player' }).click();

  // Home: the book is under Continue listening, and the mini-player shows it playing.
  await expect(page.getByRole('heading', { name: 'Continue listening' })).toBeVisible();
  const mini = page.getByRole('region', { name: 'Now playing' });
  await expect(mini).toContainText('Field Notes');
  await expect(mini.getByRole('button', { name: 'Pause' })).toBeVisible();

  // Narration continues on other tabs.
  for (const tab of ['Library', 'Discover', 'Progress']) {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: tab }).click();
    await expect(page.getByRole('heading', { name: tab, level: 1 })).toBeVisible();
    await expect(mini).toBeVisible();
  }
  await finish(page);
  await expect.poll(async () => (await spoken(page)).at(-1)).toMatch(/^The first chapter opens here/);

  // Pause from the mini-player, then resume from Home.
  await mini.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('link', { name: 'Home' }).click();
  await page.getByRole('button', { name: 'Resume Field Notes' }).click();
  await expect(mini.getByRole('button', { name: 'Pause' })).toBeVisible();
  // Tapping the mini-player opens the full player at the same place.
  await mini.getByRole('button', { name: /Open player/ }).click();
  await expect(page.locator('.player-title .ct')).toContainText('Chapter 1');
});

test('narrator presets switch in one tap and are remembered for the book after a restart', async ({ page }) => {
  await addBook(page);
  await page.getByRole('button', { name: 'Open Field Notes' }).click();
  await page.getByRole('button', { name: 'Voice and speed' }).click();
  await page.getByRole('button', { name: /^Business Learning/ }).click();
  await expect(page.getByRole('button', { name: /^Business Learning/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('radio', { name: 'Natural voice' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Voice and speed' })).toContainText('1.25× · Michael');

  // Another speed for the app in general, then restart and reopen the book.
  await page.reload();
  await page.getByRole('button', { name: 'Voice and speed' }).click();
  await expect(page.getByRole('button', { name: /^Business Learning/ })).toHaveAttribute('aria-pressed', 'true');

  // Saving your own preset.
  await page.getByRole('button', { name: 'Save current settings as a preset' }).click();
  await page.getByLabel('Preset name').fill('Morning drive');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Morning drive/ })).toHaveAttribute('aria-pressed', 'true');
});

test('Quick Listen plays your saved passages and never invents an AI summary', async ({ page }) => {
  await addBook(page);
  await page.getByRole('button', { name: 'Open Field Notes' }).click();
  await page.locator('.chunk', { hasText: 'It has a second sentence too.' }).click();
  await page.getByRole('menu').getByRole('button', { name: 'Highlight' }).click();
  await page.getByRole('button', { name: 'Close player' }).click();

  await page.getByRole('region', { name: 'Quick Listen' }).getByRole('button', { name: 'Open' }).click();
  const sheet = page.getByRole('dialog', { name: 'Quick Listen' });
  await expect(sheet.getByText('Your saved passages (1)')).toBeVisible();
  await expect(sheet.getByText('AI overview (2, 5 or 10 minutes)')).toBeVisible();
  await expect(sheet.getByText(/Not available yet/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Listen to Your saved passages (1)' }).click();
  await expect.poll(async () => (await spoken(page))[0]).toMatch(/^From Chapter 1\. The first chapter opens here/);

  await sheet.getByRole('button', { name: /Write your own summary/ }).click();
  await sheet.getByLabel('Your summary').fill('Keep notes in the field. Review them every evening.');
  await sheet.getByRole('button', { name: 'Save summary' }).click();
  await expect(sheet.getByText('Your summary of Field Notes')).toBeVisible();
  await expect(sheet.getByText(/Written by you/)).toBeVisible();
});

test('Discover explains its suggestions; Progress shows real counts; theme can be light', async ({ page }) => {
  await addBook(page, 'Alpha');
  await addBook(page, 'Beta');
  await page.getByRole('link', { name: 'Discover' }).click();
  await expect(page.getByRole('button', { name: 'Open Beta' })).toContainText('Added today and not started.');
  await page.getByLabel(/Personalized suggestions/).uncheck();
  await expect(page.getByText('Personalized suggestions are off.')).toBeVisible();

  await page.getByRole('link', { name: 'Progress' }).click();
  await expect(page.locator('.stat').filter({ has: page.getByText('Books', { exact: true }) })).toContainText('2');

  await page.getByRole('link', { name: 'Home' }).click();
  await page.getByRole('button', { name: 'Settings and backup' }).click();
  await page.getByRole('radio', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('after an update, people with books see what’s new once', async ({ page }) => {
  await addBook(page);
  await page.evaluate(() => localStorage.setItem('ml-seen-version', '1.0.0'));
  await page.reload();
  const sheet = page.getByRole('dialog', { name: /What’s new in My Library/ });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Got it' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Continue listening' }).or(page.getByRole('heading', { name: 'Recently added' }))).toBeVisible();
  await expect(sheet).toHaveCount(0);
});

test('with the multi-core headers on, the app, PDF import and offline mode still work', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => crossOriginIsolated)).toBe(true);
  await expect(page.getByText('Your private audiobook shelf')).toBeVisible();
  await page.getByTestId('file-input').setInputFiles({ name: 'lighthouse.pdf', mimeType: 'application/pdf', buffer: await samplePdf() });
  await expect(page.getByRole('dialog', { name: 'Book added' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Save to library' }).click();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open The Lighthouse Keeper' })).toBeVisible();
  await context.setOffline(false);
});
