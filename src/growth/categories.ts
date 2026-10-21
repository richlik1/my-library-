import type { Category } from './types';

export const CATEGORIES: Category[] = [
  { id: 'discipline', name: 'Discipline & Mental Resilience', blurb: 'Habits, focus and steadiness under pressure.' },
  { id: 'confidence', name: 'Confidence & Social Skills', blurb: 'Acting with confidence and connecting with people.' },
  { id: 'leadership', name: 'Leadership & Communication', blurb: 'Owning outcomes, hard conversations and negotiation.' },
  { id: 'business', name: 'Business Operations & Sales', blurb: 'Systems, operating rhythm and consultative selling.' },
  { id: 'finance', name: 'Financial Intelligence', blurb: 'Cash discipline and healthy money behavior.' },
  { id: 'family', name: 'Fatherhood & Relationships', blurb: 'Being the father and partner you want to be.' },
  { id: 'ai', name: 'AI & Technology', blurb: 'Working well with AI in your businesses.' },
  { id: 'notes', name: 'Reading Notes & Action Plans', blurb: 'Your notes and the actions you commit to.' },
];

export const categoryName = (id: string) => CATEGORIES.find((c) => c.id === id)?.name ?? id;
