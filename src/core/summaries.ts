/**
 * Quick Listen: short things to listen to about a book. Every summary records
 * where its text came from, so nothing written by an AI (or by anyone) is ever
 * passed off as the book's own words.
 */
export type SummarySource =
  /** Written for the Growth Library catalog (not the book's text). */
  | 'growth-library'
  /** Written by you. */
  | 'you'
  /** Made by an on-device AI model from the book's text (not available yet). */
  | 'ai';

export interface Summary {
  id: string;
  bookId: string;
  /** Chapter index, or null for the whole book. */
  chapter: number | null;
  /** Rough listening length the summary aims for, in minutes. */
  targetMinutes?: 2 | 5 | 10;
  title: string;
  text: string;
  source: SummarySource;
  /** For AI summaries: the model that made it. */
  model?: string;
  createdAt: number;
}

export const SOURCE_LABEL: Record<SummarySource, string> = {
  'growth-library': 'Summary written for the Growth Library — not the book’s own text',
  you: 'Written by you',
  ai: 'AI-generated from the book’s text',
};

/** Is an on-device AI model available to write summaries? Not yet: no model ships with the app. */
export function aiSummaryAvailability(): { available: false; reason: string } {
  return {
    available: false,
    reason:
      'AI overviews need an on-device language model, which My Library doesn’t have yet. Until one is added and tested on iPhone, nothing is generated or made up.',
  };
}

/** Rough minutes to speak a text at 1× (about 150 words per minute). */
export const speakingMinutes = (text: string) => text.split(/\s+/).filter(Boolean).length / 150;
