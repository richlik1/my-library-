/** An import failure with a message written for the reader, not a developer. */
export class ImportError extends Error {
  constructor(
    message: string,
    public readonly kind: 'unsupported' | 'empty' | 'needs-ocr' | 'encrypted' | 'corrupt' = 'corrupt',
  ) {
    super(message);
    this.name = 'ImportError';
  }
}

export const OCR_EXPLANATION =
  'This PDF appears to be scanned: its pages are pictures of text rather than real text, so there is nothing for the voice to read. ' +
  'To listen to it, the pages must first be converted with OCR (optical character recognition). Free options: open the PDF in ' +
  'Apple Notes or the iPhone Files app and use “Live Text” to copy the text, run it through a free, offline OCR tool such as OCRmyPDF ' +
  'on a computer. Then import the resulting text-based PDF, DOCX or TXT file here.';
