import type { Exercise, QuizQuestion } from './types';

export const q = (question: string, options: string[], answer: number, why: string): QuizQuestion => ({ q: question, options, answer, why });
export const ex = (id: string, title: string, minutes: number, steps: string[]): Exercise => ({ id, title, minutes, steps });
