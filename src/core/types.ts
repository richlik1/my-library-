/**
 * Core data model. Everything in `src/core` is plain TypeScript with no React
 * dependency so it can be reused by a future native shell (Capacitor / iOS).
 */

export type BookFormat = 'pdf' | 'epub' | 'docx' | 'txt';

export interface Chapter {
  title: string;
  /** Clean plain text. Paragraphs are separated by a blank line ("\n\n"). */
  text: string;
}

export interface OcrReport {
  /** Total pages in the source document. */
  totalPages: number;
  /** 1-based page numbers that contained (almost) no extractable text. */
  imageOnlyPages: number[];
}

export interface Book {
  id: string;
  title: string;
  author: string;
  category: string;
  format: BookFormat;
  fileName: string;
  fileSize: number;
  addedAt: number;
  lastOpenedAt: number | null;
  /** Small JPEG/PNG data URL, or null to use a generated cover. */
  cover: string | null;
  chapterCount: number;
  charCount: number;
  /** Present when some pages look like scanned images (PDF only). */
  ocr?: OcrReport;
  favorite?: boolean;
  /** How this book is narrated: live device speech, or generated natural-voice audio. */
  narration?: { engine: 'device' | 'kokoro'; voice?: string };
}

export interface BookContent {
  bookId: string;
  chapters: Chapter[];
}

export interface StoredFile {
  bookId: string;
  name: string;
  type: string;
  /**
   * Raw bytes. Stored as an ArrayBuffer because Safari on iPhone often refuses
   * to store Blob/File objects in IndexedDB. Older records may hold a Blob.
   */
  data: ArrayBuffer | Blob;
}

/** A position in the book: chapter + character offset inside that chapter. */
export interface Position {
  chapter: number;
  offset: number;
}

export interface Progress extends Position {
  bookId: string;
  /** 0..1 over the whole book (by characters). */
  percent: number;
  updatedAt: number;
  finished?: boolean;
}

export type AnnotationKind = 'bookmark' | 'highlight' | 'note';

export interface Annotation {
  id: string;
  bookId: string;
  kind: AnnotationKind;
  chapter: number;
  start: number;
  end: number;
  /** The quoted text (excerpt for bookmarks). */
  quote: string;
  note?: string;
  color?: HighlightColor;
  createdAt: number;
  updatedAt: number;
}

export type HighlightColor = 'gold' | 'rose' | 'mint' | 'sky';

export interface Settings {
  voiceURI: string | null;
  rate: number;
  pitch: number;
  /** Auto-scroll the reader to follow narration. */
  followAlong: boolean;
  /** Reader text size in px. */
  fontSize: number;
  /** Keep the screen awake while narrating (speech stops if the iPhone locks). */
  keepAwake: boolean;
  /** Show novelty voices (Bells, Bubbles, Zarvox…) in the voice list. */
  showNoveltyVoices: boolean;
  categories: string[];
  /** Bumped when new default categories are added, so existing lists get them once. */
  categoriesVersion?: number;
}

export const DEFAULT_CATEGORIES = [
  'Business and Entrepreneurship',
  'Money and Investing',
  'Leadership',
  'Discipline and Personal Development',
  'Communication',
  'Fatherhood and Relationships',
  'Spirituality and Philosophy',
  'Technology and AI',
  'Fiction',
  'Other',
];

export const DEFAULT_SETTINGS: Settings = {
  voiceURI: null,
  rate: 1,
  pitch: 1,
  followAlong: true,
  fontSize: 19,
  keepAwake: true,
  showNoveltyVoices: false,
  categories: DEFAULT_CATEGORIES,
};

/** Output of every importer before it is saved. */
export interface ImportedBook {
  title: string;
  author: string;
  format: BookFormat;
  chapters: Chapter[];
  cover: string | null;
  ocr?: OcrReport;
}
