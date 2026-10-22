import { expect, test } from '@playwright/test';
import { speechStub, testEngine } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(speechStub);
  await page.addInitScript(testEngine);
});

test('Sound check: beep, device voice and natural voice, with results to send', async ({ page }) => {
  await page.goto('./#/settings');
  const card = page.getByRole('region', { name: 'Sound check' });
  await card.getByRole('button', { name: 'Play a beep' }).click();
  await card.getByRole('button', { name: 'Yes' }).click();
  await expect(card).toContainText('✓ Works');
  await card.getByRole('button', { name: 'Say a sentence' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.at(-1))).toBe('This is your device voice.');
  await card.getByRole('button', { name: 'No' }).click();
  await card.getByRole('button', { name: 'Test natural voice' }).click();
  await expect(card.getByRole('status')).toContainText(/^Works\./, { timeout: 20_000 });
  await expect(card.locator('.voice-log')).toContainText('Beep (audio file): yes');
  await expect(card.locator('.voice-log')).toContainText('Device voice: no');
  await expect(card.locator('.voice-log')).toContainText('Natural voice: Works.');
});

test('when natural voice fails, the player offers the device voice and it plays', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, { synthesize: () => Promise<unknown> }>;
    w.__MY_LIBRARY_TEST_ENGINE__.synthesize = async () => {
      throw new Error('model crashed');
    };
  });
  await page.goto('./');
  await page.getByTestId('file-input').setInputFiles({ name: 'Fallback.txt', mimeType: 'text/plain', buffer: Buffer.from('Chapter 1\n\nA sentence that needs a voice.') });
  await page.getByRole('button', { name: 'Save to library' }).click();
  await page.getByRole('button', { name: 'Open Fallback' }).click();
  await page.getByRole('button', { name: 'Voice and speed' }).click();
  await page.getByRole('radio', { name: 'Natural voice' }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByTestId('play').click();
  await expect(page.getByText(/Couldn’t generate this chapter/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Use device voice instead' }).click();
  await page.getByTestId('play').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.length)).toBeGreaterThan(0);
});
