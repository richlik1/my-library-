import { useEffect, useState } from 'react';
import { achievements, levelFor, localDate, monthMinutes, streak, weekDays, type Achievement, type ListeningDay, type XpEvent } from '../../core/habits';
import { getAchievementDates, listAllAnnotations, listListening, listProgress, listXp, setAchievementDates } from '../../core/storage/db';

const EVENT = 'ml-habits';

/** Tell screens showing goals/XP that something changed (listening saved, XP earned). */
export function habitsChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

export interface HabitsData {
  today: string;
  todayMinutes: number;
  streak: number;
  week: Array<{ date: string; minutes: number }>;
  monthMinutes: number;
  totalMinutes: number;
  xp: number;
  ledger: XpEvent[];
  level: ReturnType<typeof levelFor>;
  achievements: Array<Achievement & { earnedAt?: number; isNew: boolean }>;
}

async function load(): Promise<HabitsData> {
  const [days, ledger, annotations, progress, seen] = await Promise.all([listListening(), listXp(), listAllAnnotations(), listProgress(), getAchievementDates()]);
  const today = localDate();
  const map = new Map<string, ListeningDay>(days.map((d) => [d.date, d]));
  const totalSeconds = days.reduce((s, d) => s + d.seconds, 0);
  const xp = ledger.reduce((s, e) => s + e.amount, 0);
  const list = achievements({
    totalSeconds,
    listenedDays: days.filter((d) => d.seconds >= 60).length,
    booksStarted: new Set([...progress.filter((p) => p.percent > 0 || p.finished).map((p) => p.bookId), ...days.flatMap((d) => Object.keys(d.byBook))]).size,
    booksCompleted: progress.filter((p) => p.finished).length,
    quotes: annotations.filter((a) => a.kind !== 'bookmark').length,
  });
  // Remember when each achievement was first earned; "new" for a day after that.
  const now = Date.now();
  let changed = false;
  for (const a of list)
    if (a.earned && !seen[a.id]) {
      seen[a.id] = now;
      changed = true;
    }
  if (changed) await setAchievementDates(seen);
  return {
    today,
    todayMinutes: Math.floor((map.get(today)?.seconds ?? 0) / 60),
    streak: streak(new Set(days.filter((d) => d.seconds >= 60).map((d) => d.date)), today),
    week: weekDays(map, today),
    monthMinutes: monthMinutes(map, today),
    totalMinutes: Math.floor(totalSeconds / 60),
    xp,
    ledger,
    level: levelFor(xp),
    achievements: list.map((a) => ({ ...a, earnedAt: seen[a.id], isNew: !!seen[a.id] && now - seen[a.id] < 86_400_000 })),
  };
}

export function useHabits(): HabitsData | null {
  const [data, setData] = useState<HabitsData | null>(null);
  useEffect(() => {
    let alive = true;
    const refresh = () => void load().then((d) => alive && setData(d));
    refresh();
    window.addEventListener(EVENT, refresh);
    return () => {
      alive = false;
      window.removeEventListener(EVENT, refresh);
    };
  }, []);
  return data;
}
