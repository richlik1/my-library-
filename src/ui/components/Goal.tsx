import type { HabitsData } from '../hooks/useHabits';

/** A small progress ring. */
export function Ring({ fraction, size = 56, label }: { fraction: number; size?: number; label: string }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className="ring">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-strong)" strokeWidth={6} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={f >= 1 ? 'var(--ok)' : 'var(--accent)'}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={`${c * f} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      {f >= 1 && <path d={`M${size / 2 - 8} ${size / 2}l5 5 10-11`} fill="none" stroke="var(--ok)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

export function goalText(h: HabitsData, goal: number) {
  return h.todayMinutes >= goal ? 'You finished your reading goal today.' : `${h.todayMinutes} of ${goal} minutes completed.`;
}

/** Home: today's listening goal, measured from real playback. */
export function GoalCard({ habits, goal, showStreak }: { habits: HabitsData; goal: number; showStreak: boolean }) {
  const done = habits.todayMinutes >= goal;
  return (
    <a className="card goal-card" href="#/progress" aria-label={`Daily goal: ${goalText(habits, goal)} Open Progress.`}>
      <Ring fraction={habits.todayMinutes / goal} label={`${Math.min(100, Math.round((habits.todayMinutes / goal) * 100))}% of today’s goal`} />
      <span style={{ flex: 1 }}>
        <span className="h-small" style={{ display: 'block' }}>
          {done ? 'Goal complete' : 'Daily goal'}
        </span>
        <span className="small muted" style={{ display: 'block' }}>
          {goalText(habits, goal)}
          {showStreak && habits.streak > 1 ? ` · ${habits.streak}-day streak` : ''}
        </span>
      </span>
    </a>
  );
}
