/**
 * Core data model. Everything in `src/core` is plain TypeScript with no React
 * dependency so it can be reused by a future native shell (Capacitor / iOS).
 */

export type BookFormat = 'pdf' | 'epub' | 'docx' | 'txt';

export interface Chapter {
  title: string;
  /** Clean plain text. Paragraphs are separated by a blank line ("\n\n"). */
  text: string;
  /** PDF only: where each source page starts in `text` (character offset → 1-based page), ascending. */
  pages?: Array<{ offset: number; page: number }>;
  /** Notes, footnotes or endnotes gathered from the book (kept, but not part of the main text). */
  kind?: 'notes';
}

/** What an importer saw, so the import can be checked against the source (see importers/report.ts). */
export interface ImportSignals {
  /** Where the chapter list came from. */
  structure: 'outline' | 'toc' | 'headings' | 'pages' | 'spine' | 'single';
  /** PDF: total pages; pages with no text and no image; printed page numbers found in headers/footers. */
  pages?: number;
  blankPages?: number[];
  printedPageNumbers?: Array<{ page: number; printed: number }>;
  /** EPUB: table-of-contents entries whose order differs from the reading order (spine). */
  tocOutOfOrder?: string[];
  /** EPUB: table-of-contents entries that point to nothing in the book. */
  tocMissing?: string[];
  /** PDF: scanned pages whose text was read with OCR on the device. */
  ocrPages?: number[];
  /** Sections not in the reading order (EPUB `linear="no"`) that were added at the end. */
  extras?: string[];
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
  narration?: { engine: NarrationEngine; voice?: string; pause?: PauseLength; presetId?: string };
  /** Language of the text, when the file says. */
  language?: string;
  /** SHA-256 of the imported file, to recognise the same file imported again. */
  fileHash?: string;
  /** The import quality review hasn't been confirmed yet (shown again until it is). */
  needsReview?: boolean;
  /** What the importer saw, for the quality review. */
  signals?: ImportSignals;
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
  /** Quote collection: your tags, favourite, and when you last reviewed it. */
  tags?: string[];
  favorite?: boolean;
  reviewedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export type HighlightColor = 'gold' | 'rose' | 'mint' | 'sky';

export type PauseLength = 'short' | 'normal' | 'long';

/**
 * 'device' = built-in voices (instant; stop when an iPhone locks in Safari).
 * 'piper' = fast natural voice, 'kokoro' = best natural voice: both make audio
 * files on the device, which keep playing with the screen locked.
 */
export type NarrationEngine = 'device' | 'kokoro' | 'piper';

/** A saved way of listening: engine, voice, speed and pauses. */
export interface NarratorPreset {
  id: string;
  name: string;
  engine: NarrationEngine;
  /** Natural voice id; none = keep the book's current voice. */
  voice?: string;
  rate: number;
  pause: PauseLength;
}

export interface Settings {
  voiceURI: string | null;
  rate: number;
  pitch: number;
  /** Auto-scroll the reader to follow narration. */
  followAlong: boolean;
  /** Reader text size in px. */
  fontSize: number;
  /** Reader typeface: book serif, or a plain sans-serif many people find easier. */
  readerFont?: 'serif' | 'sans';
  /** Reader spacing: more space between lines, words and letters helps many readers, including people with dyslexia. */
  readingSpacing?: 'normal' | 'relaxed' | 'extra';
  /** Keep the screen awake while narrating (speech stops if the iPhone locks). */
  keepAwake: boolean;
  /** Show novelty voices (Bells, Bubbles, Zarvox…) in the voice list. */
  showNoveltyVoices: boolean;
  categories: string[];
  /** Natural voice: pause length between sentences/paragraphs. */
  narrationPause: PauseLength;
  /** Natural voice: words to say differently, e.g. { word: 'StayOps', say: 'Stay Ops' }. */
  pronunciations: Array<{ word: string; say: string }>;
  /** Narrator presets you created (built-in ones are in the app). */
  presets: NarratorPreset[];
  /** Colour theme. */
  theme: 'system' | 'dark' | 'light';
  /** Discover suggests books from your own listening history. */
  personalizedDiscover: boolean;
  /** Daily goals, XP, levels and achievements. Turn off for a plain player. */
  habits: boolean;
  /** Show the listening streak (forgiving: one rest day a week). */
  streaks: boolean;
  /** Daily listening goal in minutes. */
  dailyGoalMinutes: number;
  /** Background sound under narration (null = none) and its volume, 0–1. */
  ambient: 'rain' | 'ocean' | 'fire' | 'brown' | 'white' | null;
  ambientVolume: number;
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
  narrationPause: 'normal',
  pronunciations: [],
  presets: [],
  theme: 'dark',
  personalizedDiscover: true,
  habits: true,
  streaks: true,
  dailyGoalMinutes: 15,
  ambient: null,
  ambientVolume: 0.3,
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
  /** BCP 47 language, when the file says (e.g. "en", "fr"). */
  language?: string;
  signals?: ImportSignals;
}

/** The source page (PDF) where a place in a chapter is, or null when the chapter has no page information. */
export function pageAt(chapter: Pick<Chapter, 'pages'> | undefined, offset: number): number | null {
  const pages = chapter?.pages;
  if (!pages?.length) return null;
  let page = pages[0].page;
  for (const p of pages) {
    if (p.offset > offset) break;
    page = p.page;
  }
  return page;
}

/** “Chapter 3 · p. 47” (page only for books that have page information). */
export function placeLabel(chapter: Pick<Chapter, 'title' | 'pages'> | undefined, index: number, offset: number): string {
  const page = pageAt(chapter, offset);
  return `${chapter?.title ?? `Chapter ${index + 1}`}${page ? ` · p. ${page}` : ''}`;
}
