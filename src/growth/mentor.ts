import type { BusinessProfile } from './types';

/**
 * LYONS AI Mentor: guided coaching flows that turn the frameworks from the
 * library into a concrete plan for a real situation. Runs entirely on the
 * device (no paid AI service). `buildPrompt` produces a detailed prompt the
 * user can paste into any AI assistant for a deeper conversation.
 */

export interface MentorField {
  id: string;
  label: string;
  placeholder?: string;
  long?: boolean;
  options?: string[];
  optional?: boolean;
}

export interface MentorSection {
  title: string;
  /** Book the technique comes from. */
  source?: string;
  lines: string[];
}

export interface MentorFlow {
  id: string;
  title: string;
  area: 'Conversations' | 'Leadership' | 'Business' | 'Fatherhood' | 'Personal';
  blurb: string;
  /** Catalog ids of the books this flow draws on. */
  books: string[];
  fields: MentorField[];
  compose(a: Answers, p: BusinessProfile): MentorSection[];
}

export type Answers = Record<string, string>;

const v = (a: Answers, k: string, fallback: string) => (a[k] ?? '').trim() || fallback;
const list = (s: string) =>
  s
    .split(/[\n,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);

const CONTEXTS = ['Lyons Cleaning Solutions', 'StayOps', 'Family', 'Other'];

function contextLine(ctx: string, p: BusinessProfile): string {
  if (ctx === 'Lyons Cleaning Solutions') return p.lyons;
  if (ctx === 'StayOps') return p.stayops;
  if (ctx === 'Family') return p.family;
  return '';
}

export const MENTOR_FLOWS: MentorFlow[] = [
  {
    id: 'conversation',
    title: 'Prepare a difficult conversation',
    area: 'Conversations',
    blurb: 'Feedback to a cleaner, an upset client, a partner disagreement — walk in with a plan.',
    books: ['crucial-conversations', 'nonviolent-communication', 'never-split', 'win-friends'],
    fields: [
      { id: 'who', label: 'Who is it with?', placeholder: 'e.g. Jordan, team lead' },
      { id: 'context', label: 'Where does this happen?', options: CONTEXTS },
      { id: 'facts', label: 'What happened? Facts only, like a camera would record it', placeholder: 'e.g. Three turnovers this week finished after the 3pm check-in time', long: true },
      { id: 'want', label: 'What do you really want — for you, for them, for the relationship?', placeholder: 'e.g. Every property ready by 2:30 and Jordan staying on the team', long: true },
      { id: 'feeling', label: 'How do you feel about it?', placeholder: 'e.g. worried, frustrated' },
      { id: 'need', label: 'What do you need?', placeholder: 'e.g. reliability for our hosts' },
      { id: 'request', label: 'What will you ask them to do?', placeholder: 'e.g. text me by 1:30 if a job is running late' },
    ],
    compose(a) {
      const who = v(a, 'who', 'them');
      const name = who.split(/[ ,]/)[0];
      const want = v(a, 'want', 'a good outcome for both of us');
      const facts = v(a, 'facts', 'what happened');
      return [
        {
          title: 'Before you start',
          source: 'Crucial Conversations',
          lines: [
            `Your real goal: ${want}.`,
            'Check your story: keep facts separate from the conclusions you\'ve drawn about why it happened.',
            'Pick a private moment with enough time. Don\'t start it in front of the crew or by text if you can avoid it.',
          ],
        },
        {
          title: 'Open with shared purpose',
          source: 'Crucial Conversations',
          lines: [`"${name}, I want to talk about something because I care about ${want.charAt(0).toLowerCase() + want.slice(1)}."`],
        },
        {
          title: 'Say what happened',
          source: 'Nonviolent Communication',
          lines: [
            `"${facts.replace(/\.$/, '')}. I feel ${v(a, 'feeling', 'concerned')}, because I need ${v(a, 'need', 'us to be on the same page')}."`,
            'Then stop talking and let them respond.',
          ],
        },
        {
          title: 'Invite their side',
          source: 'Never Split the Difference',
          lines: [
            '"What\'s your take on what happened?"',
            '"How can we make sure this works going forward?"',
            'If they get emotional, label it: "It seems like this week has been a lot." Then pause.',
            'Repeat their last few words when you want them to say more.',
          ],
        },
        {
          title: 'Make the request and close',
          source: 'Crucial Conversations',
          lines: [
            `"Would you be willing to ${v(a, 'request', 'try a different approach')}?"`,
            'Agree who does what by when, write it down, and set a follow-up for one week from now.',
            'Thank them sincerely for something specific they do well.',
          ],
        },
        {
          title: 'If it goes sideways',
          source: 'Crucial Conversations',
          lines: [
            'If they go silent or get heated, step out of the content and restore safety.',
            '"I don\'t want you to think I\'m questioning your work overall. I do want us to fix this one thing together."',
          ],
        },
      ];
    },
  },
  {
    id: 'negotiation',
    title: 'Negotiate price or terms',
    area: 'Business',
    blurb: 'Price increases, contract renewals, vendor deals, partner terms.',
    books: ['never-split', 'spin-selling', 'profit-first'],
    fields: [
      { id: 'who', label: 'Who are you negotiating with?', placeholder: 'e.g. property manager with 18 units' },
      { id: 'context', label: 'Which business?', options: CONTEXTS },
      { id: 'goal', label: 'What do you want?', placeholder: 'e.g. raise the turnover rate from $95 to $110' },
      { id: 'walkaway', label: 'Your walk-away point', placeholder: 'e.g. below $102 the job is not profitable' },
      { id: 'concerns', label: 'What might they think or worry about? (comma-separated)', placeholder: 'e.g. budget is tight, other cleaners are cheaper, worried about quality', long: true },
      { id: 'value', label: 'What value do you deliver?', placeholder: 'e.g. zero missed check-ins in 6 months, photo reports', long: true },
    ],
    compose(a) {
      const concerns = list(v(a, 'concerns', 'the price feels high'));
      return [
        {
          title: 'Accusation audit — say these before they do',
          source: 'Never Split the Difference',
          lines: concerns.map((c) => `"You may feel that ${c.charAt(0).toLowerCase() + c.slice(1)}."`),
        },
        {
          title: 'Anchor on value',
          source: 'SPIN Selling',
          lines: [
            `Remind them of results first: ${v(a, 'value', 'the reliability you provide')}.`,
            'Ask a need-payoff question: "How much does it help you to never worry about a turnover being late?"',
          ],
        },
        {
          title: 'Calibrated questions',
          source: 'Never Split the Difference',
          lines: [
            '"What would make this work for you?"',
            '"How would you like us to handle the increase?"',
            'If they push back hard: "How am I supposed to do that and keep the quality you expect?"',
          ],
        },
        {
          title: 'Your numbers',
          source: 'Profit First',
          lines: [
            `Target: ${v(a, 'goal', 'your ask')}.`,
            `Walk away: ${v(a, 'walkaway', 'set this before the meeting')}.`,
            'Check the price covers profit, owner pay and tax percentages before operating costs. Never agree to work that only works if profit is zero.',
          ],
        },
        {
          title: 'Close with an advance',
          source: 'SPIN Selling',
          lines: ['End with a concrete next step: signed renewal, start date for the new rate, or a scheduled decision call.', 'Aim for "That\'s right", not a polite "You\'re right".'],
        },
      ];
    },
  },
  {
    id: 'leadership',
    title: 'Lead through a team problem',
    area: 'Leadership',
    blurb: 'Missed standards, low morale, repeated mistakes, a team lead who is struggling.',
    books: ['extreme-ownership', 'e-myth', 'traction', 'win-friends', 'effective-executive'],
    fields: [
      { id: 'problem', label: 'What is going wrong?', placeholder: 'e.g. Re-cleans doubled this month', long: true },
      { id: 'context', label: 'Which business?', options: CONTEXTS },
      { id: 'team', label: 'Who is involved?', placeholder: 'e.g. weekend crew' },
      { id: 'impact', label: 'What is the impact?', placeholder: 'e.g. two hosts threatened to leave' },
      { id: 'mypart', label: 'What could you, as the leader, have done differently?', placeholder: 'e.g. no clear checklist for new hires', long: true },
    ],
    compose(a) {
      return [
        {
          title: 'Own it first',
          source: 'Extreme Ownership',
          lines: [
            `Open the team conversation with your part: "${v(a, 'mypart', 'I didn\'t set us up well enough').replace(/\.$/, '')}. That\'s on me, and here\'s how we\'ll fix it."`,
            'No blame and no excuses. When the leader owns it, the team usually does too.',
          ],
        },
        {
          title: 'Explain the why',
          source: 'Extreme Ownership',
          lines: [`Impact: ${v(a, 'impact', 'describe the impact on clients and the business')}.`, 'Give the intent in one sentence so team leads can make good calls on site.'],
        },
        {
          title: 'Fix the system, not just the people',
          source: 'The E-Myth Revisited',
          lines: [
            `Problem: ${v(a, 'problem', 'the issue')}.`,
            'Write or update the checklist for this job, test it with one cleaner, then roll it out.',
            'Ask: would a brand-new hire get this right by following the system alone?',
          ],
        },
        {
          title: 'Measure it weekly',
          source: 'Traction',
          lines: ['Add one number to the scorecard that shows this problem (for example, re-cleans per 100 jobs).', 'Make it a Rock this quarter if it is a top issue, with one owner.'],
        },
        {
          title: 'Right person, right seat?',
          source: 'Traction',
          lines: [`For ${v(a, 'team', 'each person involved')}: do they share the core values? Do they get it, want it, and have the capacity to do it?`, 'If it is a seat problem, move them to work that fits their strengths (The Effective Executive).'],
        },
        {
          title: 'Recognize improvement',
          source: 'How to Win Friends and Influence People',
          lines: ['Praise the first small improvement, specifically and publicly. Correct privately.'],
        },
      ];
    },
  },
  {
    id: 'decision',
    title: 'Make a business decision',
    area: 'Business',
    blurb: 'Hiring, pricing, a new service, a feature, a big purchase.',
    books: ['effective-executive', 'psychology-of-money', 'profit-first', 'traction', 'e-myth'],
    fields: [
      { id: 'decision', label: 'What are you deciding?', placeholder: 'e.g. hire a second full-time team lead', long: true },
      { id: 'context', label: 'Which business?', options: CONTEXTS },
      { id: 'options', label: 'What options do you have? (comma-separated)', placeholder: 'e.g. hire now, hire in Q2, promote from crew', long: true },
      { id: 'cash', label: 'What does it cost, and what could it earn?', placeholder: 'e.g. $3,800/month; frees 15 owner hours a week' },
      { id: 'reversible', label: 'Can you easily undo it?', options: ['Yes, easy to reverse', 'Hard to reverse'] },
      { id: 'deadline', label: 'When must you decide?', placeholder: 'e.g. end of the month', optional: true },
    ],
    compose(a) {
      const options = list(v(a, 'options', 'Option A, Option B'));
      const reversible = (a.reversible ?? '').startsWith('Yes');
      return [
        {
          title: 'Is this a one-off or a recurring problem?',
          source: 'The Effective Executive',
          lines: [`Decision: ${v(a, 'decision', 'your decision')}.`, 'If this keeps coming up, decide a rule or system once instead of deciding case by case.'],
        },
        {
          title: 'Boundary conditions',
          source: 'The Effective Executive',
          lines: ['Write what the decision must achieve (for example, keep margin above target, free 10 owner hours a week, keep quality).', 'Any option that misses a boundary condition is out.'],
        },
        { title: 'Your options', lines: options.map((o, i) => `${i + 1}. ${o} — best case, worst case, and what you would need to believe for it to win.`) },
        {
          title: 'Invite disagreement',
          source: 'The Effective Executive',
          lines: ['Ask someone you trust to argue for the option you like least. Decide only after hearing the best case against your favorite.'],
        },
        {
          title: 'Cash and room for error',
          source: 'Profit First · The Psychology of Money',
          lines: [
            `Money: ${v(a, 'cash', 'estimate cost and return')}.`,
            'Can you fund it from the operating-expense account without touching profit, tax or owner pay?',
            'Leave room for error: would one bad month or a lost client make this decision dangerous?',
          ],
        },
        {
          title: 'How fast to decide',
          lines: reversible
            ? ['It is reversible: decide quickly, set a 30-day review, and adjust.']
            : ['It is hard to reverse: sleep on it, gather one more data point, and run a small test first if you can.'],
        },
        {
          title: 'Turn it into action',
          source: 'Traction',
          lines: [`Decide by: ${v(a, 'deadline', 'pick a date')}.`, 'Name one owner, the first step, and the review date. If it is big, make it a Rock this quarter.'],
        },
      ];
    },
  },
  {
    id: 'sales',
    title: 'Prepare a sales call',
    area: 'Business',
    blurb: 'Discovery questions for property managers, hosts, commercial clients or StayOps prospects.',
    books: ['spin-selling', 'win-friends', 'never-split'],
    fields: [
      { id: 'prospect', label: 'Who is the prospect?', placeholder: 'e.g. Dana, manages 25 short-term rentals' },
      { id: 'type', label: 'Prospect type', options: ['Property manager', 'Short-term rental host', 'Commercial client', 'StayOps customer'] },
      { id: 'known', label: 'What do you already know?', placeholder: 'e.g. uses two cleaning companies, had bad reviews last summer', long: true },
      { id: 'advance', label: 'What next step do you want?', placeholder: 'e.g. a trial turnover next week' },
    ],
    compose(a) {
      const type = v(a, 'type', 'Property manager');
      const offer = type === 'StayOps customer' ? 'StayOps' : 'Lyons Cleaning Solutions';
      const pains: Record<string, string[]> = {
        'Property manager': ['turnovers finishing late', 'inconsistent quality between cleaners', 'chasing cleaners for photos and updates'],
        'Short-term rental host': ['last-minute cancellations by cleaners', 'reviews mentioning cleanliness', 'restocking supplies'],
        'Commercial client': ['missed areas or inconsistent schedules', 'staff complaints about cleanliness', 'vendor communication'],
        'StayOps customer': ['scheduling turnovers across many units', 'not knowing if a unit is guest-ready', 'messages scattered across apps'],
      };
      const p = pains[type] ?? pains['Property manager'];
      return [
        {
          title: 'Situation (keep it short)',
          source: 'SPIN Selling',
          lines: ['"How many units or locations are you handling right now?"', '"How are cleanings scheduled and checked today?"', `Already known: ${v(a, 'known', 'research before the call so you ask fewer of these')}.`],
        },
        { title: 'Problem', source: 'SPIN Selling', lines: p.map((x) => `"How often do you run into ${x}?"`) },
        {
          title: 'Implication',
          source: 'SPIN Selling',
          lines: ['"When that happens, what does it do to your reviews or ratings?"', '"How much of your time goes into fixing it each week?"', '"What happens to revenue when a unit isn\'t ready for check-in?"'],
        },
        {
          title: 'Need-payoff (let them say the value)',
          source: 'SPIN Selling',
          lines: ['"If every unit was confirmed guest-ready with photos by 2pm, how would that help you?"', `"What would it be worth to stop worrying about this?" Only then present how ${offer} solves it.`],
        },
        {
          title: 'Build the relationship',
          source: 'How to Win Friends and Influence People',
          lines: [`Use ${v(a, 'prospect', 'their').split(/[ ,]/)[0]}\'s name, listen more than you talk, and talk about their goals, not your features.`],
        },
        {
          title: 'Ask for the advance',
          source: 'SPIN Selling',
          lines: [`Next step to ask for: ${v(a, 'advance', 'a concrete commitment such as a trial or a walk-through date')}.`, 'If they hesitate, ask: "What would you need to see to feel comfortable trying us?"'],
        },
      ];
    },
  },
  {
    id: 'fatherhood',
    title: 'Fatherhood moment',
    area: 'Fatherhood',
    blurb: 'A tough night, a meltdown, balancing work and home, supporting your partner.',
    books: ['whole-brain-child', 'new-father', 'nonviolent-communication', 'happiness-trap'],
    fields: [
      { id: 'age', label: 'Child\'s age', options: ['Newborn (0–3 months)', 'Baby (3–12 months)', 'Toddler (1–3 years)', 'Older child'] },
      { id: 'situation', label: 'What is happening?', placeholder: 'e.g. baby won\'t settle at night and we\'re both exhausted', long: true },
      { id: 'feeling', label: 'How are you feeling?', placeholder: 'e.g. tired, helpless, short-tempered' },
      { id: 'partner', label: 'What does your partner need from you right now?', placeholder: 'e.g. a full night of sleep', optional: true },
    ],
    compose(a) {
      const age = v(a, 'age', 'Baby (3–12 months)');
      const small = age.startsWith('Newborn') || age.startsWith('Baby');
      return [
        {
          title: 'Steady yourself first',
          source: 'The Happiness Trap',
          lines: [
            `Notice it: "I\'m feeling ${v(a, 'feeling', 'stretched thin')}." Name it, take three slow breaths, and make room for it.`,
            'Your calm is the most important tool you have. If you need to, put the baby down safely and step away for a few minutes.',
          ],
        },
        {
          title: 'Connect before anything else',
          source: 'The Whole-Brain Child',
          lines: small
            ? ['Babies regulate through you: hold, rock, use a low, steady voice and slow movements.', 'Look for cues (hunger, tiredness, overstimulation, discomfort) before trying a new fix.']
            : ['Get down to eye level, use a calm voice and touch, and acknowledge the feeling before addressing behavior.', 'Name it to tame it: help them tell the story of what upset them.', 'Redirect only once they are calm.'],
        },
        {
          title: 'Know what\'s normal this month',
          source: 'The New Father',
          lines: ['Read the section for your child\'s current month: knowing what is typical lowers stress.', 'Write down one question for the next pediatrician visit.'],
        },
        {
          title: 'Support your partner',
          source: 'Nonviolent Communication',
          lines: [
            `Ask, don\'t assume: "What would help you most right now?" ${a.partner?.trim() ? `(You think they need: ${a.partner.trim()}.)` : ''}`.trim(),
            'Agree on a simple plan for tonight (who does which feed or wake-up).',
            'Name your own need too, as a request, not a demand.',
          ],
        },
        {
          title: 'Get help when needed',
          lines: [
            'Call your pediatrician for any health worry, such as fever in a young baby, feeding problems or anything that feels wrong.',
            'Low mood, anxiety or feeling disconnected for more than two weeks (in either parent) is worth raising with a doctor. Postpartum depression affects fathers too.',
          ],
        },
      ];
    },
  },
  {
    id: 'focus',
    title: 'Get back on track',
    area: 'Personal',
    blurb: 'Missed workouts or reading, scattered days, procrastination, self-doubt.',
    books: ['atomic-habits', 'deep-work', 'confidence-gap', 'happiness-trap'],
    fields: [
      { id: 'slipping', label: 'What is slipping?', placeholder: 'e.g. my daily 30-minute learning block' },
      { id: 'obstacle', label: 'What gets in the way?', placeholder: 'e.g. phone in the morning, late jobs', long: true },
      { id: 'identity', label: 'Who do you want to be?', placeholder: 'e.g. a leader who learns every day' },
      { id: 'thought', label: 'What is the unhelpful thought?', placeholder: 'e.g. I never stick with anything', optional: true },
    ],
    compose(a) {
      const habit = v(a, 'slipping', 'your habit');
      return [
        {
          title: 'Never miss twice',
          source: 'Atomic Habits',
          lines: [`Do the two-minute version of "${habit}" today, even if it is tiny. The goal is to protect the streak, not to be perfect.`],
        },
        {
          title: 'Remove the obstacle',
          source: 'Atomic Habits',
          lines: [`Obstacle: ${v(a, 'obstacle', 'name it')}.`, 'Add friction to the distraction (charge the phone in another room) and make the good habit obvious (book on the pillow, app on the home screen).', `Habit stack: "After I ___, I will ${habit}."`],
        },
        {
          title: 'Protect a deep block',
          source: 'Deep Work',
          lines: ['Schedule tomorrow\'s block at a fixed time and put it in the calendar like a client appointment.', 'Use Do Not Disturb and a start ritual (same place, same drink, same playlist).'],
        },
        {
          title: 'Unhook from the story',
          source: 'The Confidence Gap',
          lines: [
            a.thought?.trim() ? `"I\'m noticing the thought that ${a.thought.trim()}."` : 'Notice the critical thought and name it as a thought.',
            `Then act like ${v(a, 'identity', 'the person you want to be')} for the next ten minutes. The feeling of confidence can come later.`,
          ],
        },
      ];
    },
  },
];

export const mentorFlow = (id: string) => MENTOR_FLOWS.find((f) => f.id === id);

/** Plain-text version of the plan (for notes and sharing). */
export function planToText(flow: MentorFlow, sections: MentorSection[]): string {
  return [flow.title, '', ...sections.flatMap((s) => [`${s.title}${s.source ? ` (${s.source})` : ''}`, ...s.lines.map((l) => `• ${l}`), ''])].join('\n').trim();
}

/** A detailed prompt to paste into an AI assistant for a deeper coaching conversation. */
export function buildPrompt(flow: MentorFlow, answers: Answers, profile: BusinessProfile, bookTitles: string[]): string {
  const ctx = contextLine(answers.context ?? '', profile);
  const facts = flow.fields
    .filter((f) => (answers[f.id] ?? '').trim())
    .map((f) => `- ${f.label} ${answers[f.id].trim()}`)
    .join('\n');
  return [
    `You are my personal mentor and coach. Be direct, practical and kind. Ask me one clarifying question if something important is missing, then give me a step-by-step plan with exact words I can use.`,
    ``,
    `About me: ${profile.name}, ${profile.role}.`,
    `- ${profile.lyons}`,
    `- ${profile.stayops}`,
    `- ${profile.family}`,
    `- Goals: ${profile.goals}`,
    ctx ? `\nThis situation is about: ${ctx}` : '',
    ``,
    `Situation — ${flow.title}:`,
    facts || '- (no details yet)',
    ``,
    `Use ideas from these books where they help, naming the book each time: ${bookTitles.join('; ')}.`,
    `Finish with: (1) what to say, (2) what to do this week, (3) one number or sign that shows it worked.`,
  ]
    .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
    .join('\n');
}
