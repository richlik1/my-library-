import { expect, test } from '@playwright/test';
import { speechStub } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(speechStub);
});

test('growth library: catalog, search, book study, quiz and actions', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('link', { name: 'Discover' }).click();
  await page.getByRole('link', { name: /^Growth Library/ }).click();
  await expect(page.getByRole('heading', { name: 'Growth Library' })).toBeVisible();
  await expect(page.locator('.g-row')).toHaveCount(21);
  await expect(page.locator('.read-first')).toHaveText('Read first');

  await page.getByLabel('Search the catalog').fill('negotiation');
  await expect(page.getByRole('button', { name: 'Open Never Split the Difference' })).toBeVisible();
  await page.getByLabel('Search the catalog').fill('');
  await page.getByRole('button', { name: 'Financial Intelligence' }).click();
  await expect(page.locator('.g-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'All', exact: true }).click();

  await page.getByRole('button', { name: 'Open Atomic Habits' }).click();
  await expect(page.locator('.prose')).toContainText('Small habits');
  await page.getByLabel('Reading status').selectOption('reading');
  await page.getByRole('tab', { name: 'Apply it' }).click();
  await page.getByRole('button', { name: '+ Action' }).first().click();
  await page.getByRole('tab', { name: 'Quiz' }).click();
  for (const answer of ['Their systems', 'Make it difficult', 'One slip turning into a new pattern']) await page.getByRole('button', { name: answer }).click();
  await page.getByRole('button', { name: 'Check answers' }).click();
  await expect(page.getByText('You scored 3/3')).toBeVisible();
  await page.getByRole('tab', { name: 'Exercises' }).click();
  await page.getByRole('checkbox').first().check();

  await page.getByRole('button', { name: 'Back to the Growth Library' }).click();
  await expect(page.getByRole('button', { name: 'Open Atomic Habits' }).locator('.status')).toHaveText('Reading');
  await page.getByRole('button', { name: 'Notes & plans' }).click();
  await expect(page.locator('.note-text').first()).toContainText('checklist');

  await page.reload();
  await expect(page.locator('.note-text')).toHaveCount(1);
});

test('daily 30-minute block and weekly review', async ({ page }) => {
  await page.goto('./#/growth');
  await page.getByRole('button', { name: 'Start today’s block' }).click();
  await expect(page.getByRole('heading', { name: 'Today’s 30 minutes' })).toBeVisible();
  const boxes = page.getByRole('checkbox');
  await expect(boxes).toHaveCount(4);
  for (let i = 0; i < 4; i++) await boxes.nth(i).check();
  await expect(page.getByText('30 minutes done')).toBeVisible();
  await page.getByRole('button', { name: 'Back to the Growth Library' }).click();
  await expect(page.getByText('Done for today ✓')).toBeVisible();
  await expect(page.getByText(/1-day streak/)).toBeVisible();

  await page.getByRole('button', { name: /review/ }).click();
  await expect(page.locator('.stats b').first()).toHaveText('1/7');
  await page.getByLabel('One commitment for next week').fill('Run the first Level 10 meeting');
  await page.getByRole('button', { name: 'Save review' }).click();
  await expect(page.getByText('Weekly review saved')).toBeVisible();
});

test('mentor builds a tailored conversation plan and saves it', async ({ page }) => {
  await page.goto('./#/mentor');
  await page.getByRole('button', { name: /Prepare a difficult conversation/ }).click();
  await page.getByLabel('Who is it with?').fill('Jordan, team lead');
  await page.getByLabel(/What happened/).fill('Three turnovers finished after the 3pm check-in time');
  await page.getByLabel(/What do you really want/).fill('Every property ready by 2:30');
  await page.getByLabel('How do you feel about it?').fill('worried');
  await page.getByLabel('What do you need?').fill('reliability for our hosts');
  await page.getByLabel('What will you ask them to do?').fill('text me by 1:30 if a job is running late');
  await page.getByRole('button', { name: 'Build my plan' }).click();
  const plan = page.locator('#mentor-plan');
  await expect(plan).toContainText('"Jordan, I want to talk about something because I care about every property ready by 2:30."');
  await expect(plan).toContainText('Crucial Conversations');
  await page.getByRole('button', { name: 'Save to action plans' }).click();
  await page.getByRole('button', { name: 'Open action plans' }).click();
  await expect(page.locator('.note-text').first()).toContainText('Prepare a difficult conversation');
});

test('existing audiobook features still work next to the growth library', async ({ page }) => {
  await page.goto('./#/growth');
  await page.getByRole('link', { name: 'Home' }).click();
  await page.getByRole('button', { name: 'Try a sample book' }).click();
  await expect(page.locator('.player-title .bt')).toHaveText('Welcome to My Library');
});
