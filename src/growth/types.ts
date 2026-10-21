/**
 * LYONS AI — Knowledge & Growth Library data model.
 * Book content here is metadata plus ORIGINAL summaries written for this app.
 * Full texts are never bundled: listen to your own legally obtained copy by
 * importing it into My Library and linking it to the catalog entry.
 */

export type CategoryId =
  | 'discipline'
  | 'confidence'
  | 'leadership'
  | 'business'
  | 'finance'
  | 'family'
  | 'ai'
  | 'notes';

export interface Category {
  id: CategoryId;
  name: string;
  /** One line on what this category builds. */
  blurb: string;
}

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
  why: string;
}

export interface Exercise {
  id: string;
  title: string;
  steps: string[];
  minutes: number;
}

export interface CatalogBook {
  id: string;
  /** Recommended reading order (1 = read first). */
  order: number;
  title: string;
  author: string;
  year: number;
  category: CategoryId;
  /** The skill this book builds. */
  skill: string;
  /** Original summary written for this app (not text from the book). */
  summary: string;
  keyIdeas: string[];
  /** How to apply it at Lyons Cleaning Solutions. */
  lyons: string[];
  /** How to apply it at StayOps. */
  stayops: string[];
  /** Personal / family application. */
  personal: string;
  exercises: Exercise[];
  quiz: QuizQuestion[];
  tags: string[];
}

export type ReadingStatus = 'not-started' | 'reading' | 'finished' | 'rereading';

/** The user's state for one catalog book. */
export interface GrowthBookState {
  bookId: string;
  status: ReadingStatus;
  startedAt?: number;
  finishedAt?: number;
  rating?: number;
  /** id of the user's own copy imported into My Library. */
  linkedBookId?: string;
  exercisesDone: string[];
  quizBest?: number;
  quizAttempts: number;
  minutes: number;
  updatedAt: number;
}

export type NoteKind = 'note' | 'action';

export interface GrowthNote {
  id: string;
  /** Catalog book id, or null for a general note / plan. */
  bookId: string | null;
  kind: NoteKind;
  text: string;
  /** For action items: which business or area it applies to. */
  area?: 'lyons' | 'stayops' | 'family' | 'personal';
  due?: string;
  done?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type SegmentId = 'review' | 'read' | 'practice' | 'apply';

export interface DailyBlock {
  /** Local date YYYY-MM-DD. */
  date: string;
  bookId: string;
  segments: Record<SegmentId, boolean>;
  reflection?: string;
  completedAt?: number;
}

export interface WeeklyReview {
  /** ISO week, e.g. 2026-W43. */
  week: string;
  wins: string;
  lyons: string;
  stayops: string;
  family: string;
  missed: string;
  lesson: string;
  commitment: string;
  score: number;
  savedAt: number;
}

export interface BusinessProfile {
  name: string;
  role: string;
  lyons: string;
  stayops: string;
  family: string;
  goals: string;
}

export const DEFAULT_PROFILE: BusinessProfile = {
  name: 'Malik',
  role: 'Owner and operator',
  lyons: 'Lyons Cleaning Solutions — a cleaning company with field crews serving residential, commercial and short-term-rental turnover clients.',
  stayops: 'StayOps — an operations platform for short-term rentals: turnovers, cleaner scheduling, inspections and host communication.',
  family: 'New father building a strong family while growing two businesses.',
  goals: 'Grow both businesses profitably, lead the team well, and be present at home.',
};
