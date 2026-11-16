import { PDFDocument, StandardFonts } from 'pdf-lib';
import { expect, test } from '@playwright/test';
import { speechStub } from './fixtures';

/**
 * Real on-device OCR (Tesseract.js served by the app): a PDF whose first page is a scanned image of printed text
 * and whose second page has normal text. After “Read scanned pages with OCR”, the scanned page's words are in the
 * book, before the second page's text.
 */
test('scanned pages are read with OCR on the device and put in their place', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(speechStub);
  await page.goto('./');
  // An image of a printed page, drawn in the browser.
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1200;
    c.height = 700;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#000';
    g.font = '44px Georgia, serif';
    ['The lighthouse keeper wrote in his', 'journal every evening before he lit', 'the great lamp above the harbour.'].forEach((l, i) => g.fillText(l, 80, 160 + i * 80));
    return c.toDataURL('image/png').split(',')[1];
  });
  const doc = await PDFDocument.create();
  const img = await doc.embedPng(Buffer.from(png, 'base64'));
  doc.addPage([600, 350]).drawImage(img, { x: 0, y: 0, width: 600, height: 350 });
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const p2 = doc.addPage([600, 350]);
  p2.drawText('This second page has ordinary selectable text for the narrator.', { x: 40, y: 280, size: 12, font });
  p2.drawText('It continues here with another sentence that is long enough.', { x: 40, y: 262, size: 12, font });
  const pdf = Buffer.from(await doc.save());

  await page.getByTestId('file-input').setInputFiles({ name: 'Scanned Journal.pdf', mimeType: 'application/pdf', buffer: pdf });
  await page.getByRole('button', { name: 'Check chapters and order' }).click();
  await expect(page.locator('.review-summary')).toContainText('Page 1 is scanned images');
  await page.getByRole('button', { name: 'Read 1 scanned page with OCR' }).click();
  await expect(page.getByText('Read 1 scanned page with OCR.')).toBeVisible({ timeout: 150_000 });
  await expect(page.locator('.review-summary')).toContainText('Page 1 was read from scanned images with OCR');

  // The recognised words are in the book, in page order.
  await page.getByRole('button', { name: 'Open book' }).click();
  const reader = page.locator('.reader');
  await expect(reader).toContainText(/lighthouse keeper wrote/i);
  const text = (await reader.textContent()) ?? '';
  expect(text.search(/lighthouse keeper/i)).toBeLessThan(text.indexOf('This second page'));
});
