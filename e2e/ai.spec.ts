import { expect, test, type Page, type Route } from '@playwright/test';
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

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };

/** Stands in for the Claude API: records requests and answers with the given text. */
async function mockClaude(page: Page, answer: (body: { system: string; messages: Array<{ content: string }> }) => string) {
  const requests: Array<{ system: string; messages: Array<{ content: string }>; model: string }> = [];
  await page.route('https://api.anthropic.com/**', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = route.request().postDataJSON();
    requests.push(body);
    await route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: body.model,
        content: [{ type: 'text', text: answer(body) }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      }),
    });
  });
  return requests;
}

async function openBook(page: Page) {
  await page.goto('./');
  await page.getByTestId('file-input').setInputFiles({ name: 'Learning.txt', mimeType: 'text/plain', buffer: Buffer.from(BOOK) });
  await page.getByRole('button', { name: 'Save to library' }).click();
  await page.getByRole('button', { name: 'Open Learning' }).click();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(speechStub);
});

test('AI is off by default and the reader still works offline', async ({ page }) => {
  let called = false;
  await page.route('https://api.anthropic.com/**', (r) => ((called = true), r.abort()));
  await openBook(page);
  await page.locator('.chunk', { hasText: 'Small habits compound' }).click();
  await page.getByRole('menu').getByRole('button', { name: 'Play here' }).click();
  await page.getByRole('button', { name: 'Explain this' }).click();
  const sheet = page.getByRole('dialog', { name: 'Ask My Book' });
  await expect(sheet.getByText('AI answers are off.').first()).toBeVisible();
  await expect(sheet.locator('.hit').first()).toBeVisible();
  expect(called).toBe(false);
});

test('turning AI on in Settings: the key stays on the device and is never put in backups', async ({ page }) => {
  await page.goto('./#/settings');
  const card = page.getByRole('region', { name: 'AI assistant' });
  await card.getByLabel('Claude API key').fill('not-a-key');
  await card.getByRole('button', { name: 'Turn on AI answers' }).click();
  await expect(page.getByText(/doesn’t look like a Claude API key/)).toBeVisible();
  await card.getByLabel('Claude API key').fill('sk-ant-test-1234');
  await card.getByRole('button', { name: 'Turn on AI answers' }).click();
  await expect(card.getByText('key ending “…1234”')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export backup' }).click()]);
  const path = await download.path();
  const { readFileSync } = await import('node:fs');
  expect(readFileSync(path!).toString('latin1')).not.toContain('sk-ant-test-1234');
  await card.getByRole('button', { name: 'Turn off and remove key' }).click();
  expect(await page.evaluate(() => localStorage.getItem('ml-ai'))).toBeNull();
});

test('AI answers are grounded: only retrieved passages are sent, answers are labelled and cite the book', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ml-ai', JSON.stringify({ provider: 'claude', apiKey: 'sk-ant-test', model: 'claude-haiku-5-5' })));
  const requests = await mockClaude(page, (body) =>
    body.messages[0].content.includes('flashcards')
      ? 'Q: What compounds over time?\nA: Small habits [1]\n\nQ: What is a habit?\nA: A routine repeated until automatic [1]'
      : 'A habit becomes automatic through repetition [1]. Also see [9].',
  );
  await openBook(page);
  await page.locator('.chunk', { hasText: 'Small habits compound' }).click();
  await page.getByRole('menu').getByRole('button', { name: 'Play here' }).click();
  await page.getByRole('button', { name: 'Explain this' }).click();
  const sheet = page.getByRole('dialog', { name: 'Ask My Book' });
  await sheet.getByRole('button', { name: 'Explain with AI' }).click();

  const answer = sheet.getByRole('region', { name: 'AI answer' });
  await expect(answer.locator('.ai-label')).toContainText('AI interpretation · claude-haiku-5-5');
  await expect(answer.locator('.ai-text')).toContainText('becomes automatic through repetition');
  await expect(answer.getByText(/passage 9, which weren’t given to it/)).toBeVisible();
  await expect(answer.locator('.hit-ref').first()).toHaveText('[1] Chapter 1: Habits');

  expect(requests).toHaveLength(1);
  const sent = requests[0];
  expect(sent.model).toBe('claude-haiku-5-5');
  expect(sent.system).toContain('Use only the numbered passages');
  // The explained passage was sent; the unrelated chapter was not.
  expect(sent.messages[0].content).toContain('Small habits compound over time.');
  expect(sent.messages[0].content).not.toContain('Pay yourself first');

  await answer.getByRole('button', { name: 'Go there' }).first().click();
  await expect(page.locator('.player-title .ct')).toContainText('Chapter 1: Habits');

  await page.getByRole('button', { name: 'Explain this' }).click();
  await sheet.getByRole('tab', { name: 'Study' }).click();
  await sheet.getByRole('button', { name: 'Make flashcards' }).click();
  await sheet.getByRole('button', { name: 'Save 2 flashcards' }).click();
  await expect(page.getByText('Saved 2 flashcards')).toBeVisible();
  expect(requests[1].messages[0].content).not.toContain('Pay yourself first');

  await page.goto('./#/quotes');
  await expect(page.getByText('Q: What compounds over time?')).toBeVisible();
});
