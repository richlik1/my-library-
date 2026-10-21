import { ex, q } from './build';
import type { CatalogBook } from './types';

// Original summaries and exercises (see catalog.ts).

export const PART_TWO: CatalogBook[] = [
  {
    id: 'effective-executive',
    order: 12,
    title: 'The Effective Executive',
    author: 'Peter F. Drucker',
    year: 1967,
    category: 'leadership',
    skill: 'Decision-making and management effectiveness',
    summary:
      'Effectiveness is a discipline that can be learned. Drucker identifies five practices of effective executives: know where your time actually goes, focus on contribution and results, build on strengths (yours and others\'), concentrate on a few priorities and do first things first, and make a small number of well-considered decisions rather than many quick ones.',
    keyIdeas: [
      'Record your time; most people misjudge where it goes.',
      'Ask "What can I contribute?" rather than "How busy am I?"',
      'Staff for strengths, not for the absence of weaknesses.',
      'Concentrate on one thing at a time, and decide what NOT to do (posteriorities).',
      'Good decisions: decide whether the problem is generic or unique, set boundary conditions, welcome disagreement, and build action into the decision.',
    ],
    lyons: [
      'Track your time for one week; delegate the cleaning-shift work so you can focus on sales and systems.',
      'Put each cleaner where their strengths are (detail work, speed, client-facing) instead of fixing weaknesses.',
    ],
    stayops: [
      'Treat recurring support issues as generic problems: fix them once with a rule or feature.',
      'Before big product decisions, list boundary conditions and invite a dissenting view.',
    ],
    personal: 'Decide your "posteriorities" — the commitments you will drop to make room for family time.',
    exercises: [
      ex('ee-time', 'Time log', 10, [
        'For three days, note what you did every 30 minutes.',
        'Mark what only you can do, what someone else could do, and what nobody needs to do.',
        'Delegate or drop two items.',
      ]),
      ex('ee-decision', 'Decision memo', 15, [
        'Choose a pending decision.',
        'Write: generic or unique? boundary conditions? options? strongest objection? who acts, by when?',
      ]),
    ],
    quiz: [
      q('What does Drucker recommend first?', ['Set big goals', 'Know where your time goes', 'Hire more staff', 'Work longer'], 1, 'Effective executives start with their time.'),
      q('How should you staff, according to the book?', ['Avoid weaknesses', 'Build on strengths', 'Hire generalists only', 'Rotate everyone'], 1, 'Make strengths productive.'),
      q('Why welcome disagreement before a decision?', ['To delay it', 'To surface alternatives and test assumptions', 'To share blame', 'It is polite'], 1, 'Dissent improves decision quality.'),
    ],
    tags: ['management', 'decisions', 'time', 'delegation'],
  },
  {
    id: 'e-myth',
    order: 13,
    title: 'The E-Myth Revisited',
    author: 'Michael E. Gerber',
    year: 1995,
    category: 'business',
    skill: 'Building systems so the business runs without you',
    summary:
      'Most small businesses are started by technicians — people good at the work — who end up trapped doing everything. Gerber says to work on the business, not just in it: design it like a franchise prototype where documented systems produce consistent results no matter who does the job. That means a clear aim, an organization chart with defined positions, and systems for management, people, marketing and operations.',
    keyIdeas: [
      'Every owner is part technician, part manager, part entrepreneur; the technician usually dominates.',
      'Work on your business, not only in it.',
      'Build a "franchise prototype": systems that deliver the same result every time.',
      'Write position contracts for every role on the org chart, even if you fill them all today.',
      'Innovate, quantify, then orchestrate: test improvements, measure them, then standardize.',
    ],
    lyons: [
      'Write the Lyons Cleaning Solutions operations manual: one documented system per service type.',
      'Draw the org chart of the company you want at 3× size and write a one-page contract for each role.',
      'Measure every improvement (minutes per turnover, re-clean rate) before rolling it out.',
    ],
    stayops: [
      'Productize the Lyons playbook: StayOps can sell the systems you prove in your own cleaning company.',
      'Document onboarding so new hosts reach value without you on the call.',
    ],
    personal: 'Systems at work buy back evenings and weekends for family.',
    exercises: [
      ex('em-orgchart', 'Future org chart', 20, [
        'Draw the roles the business needs at 3× today\'s size.',
        'Write your name in every box you currently fill.',
        'Pick the first box to hand off and write its position contract.',
      ]),
      ex('em-system', 'Document one system', 30, [
        'Choose your most frequent job (for example, a standard turnover).',
        'Write each step, standard and photo checkpoint.',
        'Have a cleaner test it and fix unclear steps.',
      ]),
    ],
    quiz: [
      q('What is the "E-Myth"?', ['Entrepreneurs are born, not made', 'Most businesses are started by entrepreneurs (they are really started by technicians)', 'Email marketing always works', 'Expansion is easy'], 1, 'Technicians start businesses and get trapped in the work.'),
      q('What does "franchise prototype" mean?', ['Buying a franchise', 'Designing the business so systems produce consistent results', 'Opening many locations quickly', 'Licensing your brand'], 1, 'Consistency comes from systems, not heroics.'),
      q('Which order does the business development process follow?', ['Orchestrate, innovate, quantify', 'Innovate, quantify, orchestrate', 'Quantify, orchestrate, innovate', 'Hire, train, fire'], 1, 'Test, measure, then standardize.'),
    ],
    tags: ['systems', 'small business', 'operations', 'delegation', 'scaling'],
  },
  {
    id: 'profit-first',
    order: 14,
    title: 'Profit First',
    author: 'Mike Michalowicz',
    year: 2014,
    category: 'finance',
    skill: 'Cash management and profitability',
    summary:
      'The usual formula (sales minus expenses equals profit) leaves profit as an afterthought. Profit First flips it: take profit first and run the business on what remains. Using separate bank accounts for income, profit, owner\'s pay, tax and operating expenses, you allocate every deposit by set percentages on a regular schedule, start small, and increase the profit percentage each quarter.',
    keyIdeas: [
      'Sales − Profit = Expenses: profit is taken first, not left over.',
      'Parkinson\'s Law: spending grows to fill whatever money is available.',
      'Use separate accounts: Income, Profit, Owner\'s Comp, Tax, Operating Expenses.',
      'Allocate on a rhythm (for example, the 10th and 25th) using target percentages.',
      'Start with a small profit percentage and raise it quarterly; distribute part of profit each quarter.',
    ],
    lyons: [
      'Open the five accounts for Lyons Cleaning Solutions and start with a small profit percentage.',
      'Price jobs so labor, supplies and travel fit inside the operating-expense percentage.',
    ],
    stayops: [
      'Run StayOps on its own accounts so you see whether it pays for itself.',
      'Use the tax account so quarterly tax payments never become a surprise.',
    ],
    personal: 'Separate household savings goals the same way (emergency fund, baby costs, family fun).',
    exercises: [
      ex('pf-assessment', 'Instant assessment', 20, [
        'From last year: total revenue, materials and subcontractors, owner pay, tax, profit, operating expenses.',
        'Compare your percentages with your targets.',
        'Choose a starting profit percentage you can sustain this quarter.',
      ]),
      ex('pf-accounts', 'Set up the accounts', 30, [
        'Open (or rename) accounts: Income, Profit, Owner\'s Comp, Tax, OpEx.',
        'Put the profit account at a different bank if temptation is a problem.',
        'Put the 10th and 25th allocation days in your calendar.',
      ]),
    ],
    quiz: [
      q('Profit First rewrites the formula as…', ['Sales − Expenses = Profit', 'Sales − Profit = Expenses', 'Profit + Expenses = Sales', 'Expenses − Sales = Loss'], 1, 'Profit is set aside first.'),
      q('Why use separate bank accounts?', ['To earn interest', 'To make allocations visible and limit overspending', 'Because banks require it', 'To hide money from partners'], 1, 'Physical separation changes spending behavior.'),
      q('How should you start your profit percentage?', ['At 30% immediately', 'Small, then raise it each quarter', 'Only after expenses are cut to zero', 'Never above 1%'], 1, 'Build the habit gradually.'),
    ],
    tags: ['cash flow', 'profit', 'bookkeeping', 'small business'],
  },
  {
    id: 'spin-selling',
    order: 15,
    title: 'SPIN Selling',
    author: 'Neil Rackham',
    year: 1988,
    category: 'business',
    skill: 'Consultative selling',
    summary:
      'Based on research into thousands of sales calls, the book shows that big sales work differently from small ones. Successful sellers ask more questions, in a pattern: Situation, Problem, Implication and Need-payoff. Implication questions build the cost of the problem; need-payoff questions get the buyer to describe the value of solving it, so the buyer states the explicit need before you pitch.',
    keyIdeas: [
      'Large sales succeed through questions, not pressure or closing tricks.',
      'Situation questions gather facts — use few, buyers find them boring.',
      'Problem questions uncover difficulties; Implication questions expand their consequences.',
      'Need-payoff questions let the buyer say why solving it matters.',
      'Aim for an "advance" (a concrete next step), not just a friendly meeting.',
    ],
    lyons: [
      'For commercial or property-manager leads, ask about missed turnovers and their impact on reviews and revenue before quoting.',
      'End every sales visit with an advance: a walk-through date, trial clean or signed proposal.',
    ],
    stayops: [
      'Demo StayOps only after the host has described what bad reviews and scheduling chaos cost them.',
      'Write a SPIN question bank for each customer type (solo host, property manager, cleaning company).',
    ],
    personal: 'Problem and implication questions also help you understand family needs before offering solutions.',
    exercises: [
      ex('spin-bank', 'Build a SPIN question bank', 20, [
        'Choose a customer type (for example, a property manager with 20 units).',
        'Write 2 Situation, 4 Problem, 4 Implication and 3 Need-payoff questions.',
        'Use them on your next call.',
      ]),
      ex('spin-advance', 'Define your advances', 10, [
        'List the concrete next steps a buyer can commit to at each stage.',
        'Decide which advance you will ask for at the end of each meeting.',
      ]),
    ],
    quiz: [
      q('What do Implication questions do?', ['Gather background facts', 'Develop the consequences of a problem', 'Close the deal', 'Handle objections'], 1, 'They make the problem bigger and more urgent.'),
      q('Who should state the value of the solution in a need-payoff question?', ['The seller', 'The buyer', 'A reference customer', 'The contract'], 1, 'Buyers believe what they say themselves.'),
      q('An "advance" is…', ['A discount', 'A concrete step that moves the sale forward', 'A deposit', 'A friendly meeting'], 1, 'Continuations without commitment are not progress.'),
    ],
    tags: ['sales', 'questions', 'B2B', 'discovery'],
  },
  {
    id: 'traction',
    order: 16,
    title: 'Traction',
    author: 'Gino Wickman',
    year: 2007,
    category: 'business',
    skill: 'Operating system for running and growing a business',
    summary:
      'Traction introduces the Entrepreneurial Operating System (EOS) for small and mid-sized companies. It strengthens six components — Vision, People, Data, Issues, Process and Traction — with simple tools: a one-page Vision/Traction Organizer, an accountability chart, the "right people in the right seats", a weekly scorecard, 90-day priorities called Rocks, a weekly Level 10 meeting, and a method for solving issues.',
    keyIdeas: [
      'Six components: Vision, People, Data, Issues, Process, Traction.',
      'Vision/Traction Organizer: core values, core focus, 10-year target, 3-year picture, 1-year plan, Rocks.',
      'Right people (share core values) in the right seats (get it, want it, capacity to do it).',
      'A weekly scorecard of 5–15 numbers shows the health of the business.',
      'Quarterly Rocks, a weekly Level 10 meeting, and Identify–Discuss–Solve for issues.',
    ],
    lyons: [
      'Build a weekly scorecard: jobs completed, re-clean rate, on-time %, new leads, cash in bank.',
      'Set 3–5 Rocks per quarter (for example, hire a team lead, document turnover system).',
      'Run a weekly 90-minute meeting that ends with solved issues, not just updates.',
    ],
    stayops: [
      'Write StayOps\' core focus in one sentence and say no to work outside it.',
      'Use the accountability chart to clarify who owns product, sales and support.',
    ],
    personal: 'Choose one family Rock each quarter (for example, a weekly date night).',
    exercises: [
      ex('tr-scorecard', 'Create your scorecard', 20, [
        'Pick 5–10 weekly numbers that predict success for Lyons and for StayOps.',
        'Set a goal and an owner for each.',
        'Fill it in every week during the review.',
      ]),
      ex('tr-rocks', 'Set quarterly Rocks', 15, [
        'List everything you want done this quarter.',
        'Choose the 3–5 most important; make each specific and measurable.',
        'Assign an owner and a due date.',
      ]),
    ],
    quiz: [
      q('What are "Rocks" in EOS?', ['Core values', '90-day priorities', 'Problem clients', 'Yearly targets'], 1, 'Quarterly priorities that move the business forward.'),
      q('"Right seat" means the person…', ['Is liked by everyone', 'Gets it, wants it and has the capacity to do it', 'Has the most experience', 'Works the longest hours'], 1, 'GWC defines fit for a role.'),
      q('What does IDS stand for?', ['Invest, Deliver, Scale', 'Identify, Discuss, Solve', 'Inspect, Document, Systematize', 'Ideas, Data, Strategy'], 1, 'The issue-solving track in weekly meetings.'),
    ],
    tags: ['EOS', 'scorecard', 'meetings', 'strategy', 'operations'],
  },
  {
    id: 'psychology-of-money',
    order: 17,
    title: 'The Psychology of Money',
    author: 'Morgan Housel',
    year: 2020,
    category: 'finance',
    skill: 'Healthy money behavior and long-term thinking',
    summary:
      'Doing well with money depends more on behavior than on intelligence. Through short stories, Housel shows how personal experience shapes our financial choices, why luck and risk are two sides of the same coin, how compounding rewards patience, why staying wealthy needs different skills than getting wealthy, and why the highest return of money is control over your own time.',
    keyIdeas: [
      'Behavior matters more than knowledge in personal finance.',
      'Luck and risk both play a role; judge decisions, not just outcomes.',
      'Compounding needs time — avoid interrupting it.',
      'Leave room for error; being reasonable beats being perfectly rational.',
      'Wealth is what you do not see (money not spent); its best use is freedom over your time.',
    ],
    lyons: [
      'Keep a cash buffer so one slow month or lost contract never forces a bad decision.',
      'Grow at a pace you can survive; avoid debt that removes room for error.',
    ],
    stayops: [
      'Be patient with StayOps: let customer growth compound rather than chasing quick wins.',
      'Separate lucky wins from repeatable strategy when reviewing results.',
    ],
    personal: 'Define "enough" with your partner, and save for freedom (time with family), not status.',
    exercises: [
      ex('pm-enough', 'Define "enough"', 15, [
        'Write the monthly income that would cover your family\'s needs and a few wants.',
        'Write what you would do with more free time.',
        'Decide one spending habit that does not serve that picture.',
      ]),
      ex('pm-buffer', 'Room for error', 10, [
        'Calculate months of business and household expenses you could cover today.',
        'Set a target buffer and a monthly amount to reach it.',
      ]),
    ],
    quiz: [
      q('According to the book, success with money depends most on…', ['Intelligence', 'Behavior', 'Stock picking', 'Income alone'], 1, 'How you behave matters more than what you know.'),
      q('What does Housel call the highest form of wealth?', ['A big house', 'Control over your time', 'A high salary', 'Luxury cars'], 1, 'Freedom to do what you want, when you want.'),
      q('Why leave room for error?', ['To look cautious', 'Because the future is uncertain and survival allows compounding', 'Banks require it', 'It increases taxes'], 1, 'Staying in the game is what lets compounding work.'),
    ],
    tags: ['money', 'saving', 'investing', 'behavior', 'compounding'],
  },
  {
    id: 'whole-brain-child',
    order: 18,
    title: 'The Whole-Brain Child',
    author: 'Daniel J. Siegel & Tina Payne Bryson',
    year: 2011,
    category: 'family',
    skill: 'Child development and emotionally connected parenting',
    summary:
      'A child\'s brain is still developing, and its parts do not always work together. The authors explain integration — logic with emotion, the "upstairs" thinking brain with the "downstairs" reactive brain — and offer twelve practical strategies, such as connecting emotionally before redirecting behavior and helping children "name it to tame it" by telling the story of what upset them.',
    keyIdeas: [
      'Integration: help the different parts of a child\'s brain work together.',
      'Connect and redirect: soothe emotion first, then guide behavior and reasoning.',
      'Name it to tame it: telling the story of a scary or upsetting event calms big feelings.',
      'Engage the upstairs brain (ask, negotiate) instead of enraging the downstairs brain.',
      'Everyday moments of play, memory and conflict are chances to build the brain.',
    ],
    lyons: [
      'Connect-and-redirect also works with stressed crew: acknowledge the feeling before fixing the issue.',
    ],
    stayops: [
      'Upset hosts are in "downstairs brain" mode; acknowledge first, then problem-solve.',
    ],
    personal: 'Use connect-and-redirect and name-it-to-tame-it as your child grows into toddlerhood; model calm yourself.',
    exercises: [
      ex('wbc-connect', 'Connect and redirect script', 10, [
        'Recall a tense moment (with your child, partner or crew).',
        'Write how you could first connect (tone, touch, acknowledgment).',
        'Then write how you would redirect once they were calm.',
      ]),
      ex('wbc-story', 'Name it to tame it', 5, [
        'After a hard day, tell your partner the story of what upset you, start to finish.',
        'Notice how retelling lowers the intensity — this is what children need too.',
      ]),
    ],
    quiz: [
      q('In "connect and redirect", what comes first?', ['Consequences', 'Emotional connection', 'Logic', 'Time-out'], 1, 'Calm the emotion, then teach.'),
      q('"Name it to tame it" means…', ['Labeling the child', 'Helping the child tell the story of what upset them', 'Naming rules', 'Ignoring feelings'], 1, 'Storytelling integrates feeling and logic.'),
      q('The "upstairs brain" handles…', ['Breathing and fight-or-flight', 'Thinking, planning and self-control', 'Digestion', 'Reflexes'], 1, 'It is still developing through childhood.'),
    ],
    tags: ['parenting', 'children', 'emotions', 'brain development'],
  },
  {
    id: 'new-father',
    order: 19,
    title: 'The New Father: A Dad\'s Guide to the First Year',
    author: 'Armin A. Brott',
    year: 1997,
    category: 'family',
    skill: 'Newborn development and fatherhood',
    summary:
      'A month-by-month guide written for dads. For each month of the first year it describes how the baby is developing, what the father may be feeling, and how to build the relationship with the baby and support his partner. It covers practical topics like sleep, feeding, safety and childcare as well as the emotional side of becoming a father, including work–family balance.',
    keyIdeas: [
      'Fathers matter from day one; hands-on care builds the bond.',
      'Each month brings new development — knowing what to expect lowers stress.',
      'Your own feelings (pride, worry, feeling left out) are normal and worth talking about.',
      'Support your partner\'s recovery and watch for signs of postpartum depression in both parents.',
      'Plan work–family balance deliberately; it does not happen on its own.',
    ],
    lyons: [
      'Design the business schedule around family commitments; delegate weekend jobs where possible.',
    ],
    stayops: [
      'Set clear working hours for StayOps so the product does not take every evening.',
    ],
    personal: 'Read the chapter for your baby\'s current month and plan one bonding activity this week.',
    exercises: [
      ex('nf-month', 'This month\'s focus', 10, [
        'Read the section for your baby\'s current month.',
        'Write one thing about development, one about yourself, one about your partner.',
        'Plan one hands-on activity (bath time, walks, reading aloud).',
      ]),
      ex('nf-checkin', 'Partner check-in', 15, [
        'Ask your partner: what is hardest right now, and what would help most?',
        'Listen without fixing; then agree on one change for this week.',
      ]),
    ],
    quiz: [
      q('How is the book organized?', ['By topic only', 'Month by month through the first year', 'By age 1–5', 'As a diary'], 1, 'Each month covers baby, you, and your partner.'),
      q('According to the book, a father\'s mixed feelings in the first year are…', ['A warning sign', 'Normal', 'Rare', 'Best ignored'], 1, 'Talking about them helps.'),
      q('Which topic does the book cover for partners?', ['Investment portfolios', 'Supporting recovery and watching for postpartum depression', 'Career changes', 'Home renovation'], 1, 'Partner wellbeing is part of fatherhood.'),
    ],
    tags: ['fatherhood', 'newborn', 'parenting', 'family'],
  },
  {
    id: 'nonviolent-communication',
    order: 20,
    title: 'Nonviolent Communication',
    author: 'Marshall B. Rosenberg',
    year: 1999,
    category: 'family',
    skill: 'Empathy and conflict resolution',
    summary:
      'Rosenberg offers a way of speaking and listening that keeps compassion alive in conflict. It has four parts: describe what you observe without judgment, name what you feel, connect it to the need behind the feeling, and make a clear, doable request rather than a demand. Listening the same way — for the other person\'s feelings and needs — turns arguments into problem-solving.',
    keyIdeas: [
      'Observations without evaluation: describe what happened like a camera would.',
      'Feelings: name real emotions, not thoughts disguised as feelings ("I feel ignored").',
      'Needs: behind every feeling is a need (rest, respect, reliability, connection).',
      'Requests: specific, positive, doable — and the other person is free to say no.',
      'Empathic listening: hear the feelings and needs behind any message, even criticism.',
    ],
    lyons: [
      'Give crew feedback in OFNR form: "When the bathroom wasn\'t restocked, I felt worried, because the host relies on us. Would you add it to your final check?"',
      'Hear angry client messages as feelings plus unmet needs.',
    ],
    stayops: [
      'Write support replies that acknowledge the host\'s need (reliability, peace of mind) before explaining.',
    ],
    personal: 'Use the four steps in disagreements with your partner, especially about sleep and chores.',
    exercises: [
      ex('nvc-translate', 'Translate a complaint', 10, [
        'Write a complaint you have about someone.',
        'Rewrite it as Observation, Feeling, Need, Request.',
        'Check that the request is specific and doable.',
      ]),
      ex('nvc-listen', 'Empathy guess', 10, [
        'Recall something critical someone said to you.',
        'Guess the feeling and need behind it: "Were you feeling … because you need …?"',
      ]),
    ],
    quiz: [
      q('What are the four components of NVC?', ['Facts, opinions, rules, consequences', 'Observations, feelings, needs, requests', 'Praise, critique, praise, action', 'Listen, argue, agree, act'], 1, 'OFNR is the core model.'),
      q('Which is an observation without evaluation?', ['"You\'re always late."', '"You arrived at 9:20 for a 9:00 start."', '"You don\'t care."', '"You\'re unreliable."'], 1, 'Specific and judgment-free.'),
      q('A request differs from a demand because…', ['It is polite', 'The person can say no without punishment', 'It is written', 'It includes a deadline'], 1, 'If refusal brings blame, it was a demand.'),
    ],
    tags: ['communication', 'empathy', 'conflict', 'relationships', 'feedback'],
  },
  {
    id: 'co-intelligence',
    order: 21,
    title: 'Co-Intelligence',
    author: 'Ethan Mollick',
    year: 2024,
    category: 'ai',
    skill: 'Working effectively with AI',
    summary:
      'A Wharton professor\'s practical guide to living and working with generative AI. AI is uneven: excellent at some tasks and poor at others that look similar — a "jagged frontier" you only learn by experimenting. Mollick suggests inviting AI into everything you do, staying the human in the loop, giving it a clear role, and assuming today\'s AI is the worst you will ever use. He explores AI as a coworker, tutor, coach and creative partner.',
    keyIdeas: [
      'Always invite AI to the table: try it on your real tasks to learn what it can do.',
      'Be the human in the loop: check its work and keep your judgment.',
      'Treat AI like a person, and tell it what kind of person to be (role, audience, context).',
      'Assume this is the worst AI you will ever use; capabilities keep improving.',
      'The jagged frontier: AI\'s strengths and weaknesses are uneven and not obvious in advance.',
    ],
    lyons: [
      'Use AI to draft job checklists, client messages and hiring ads, then review and edit them.',
      'Ask AI to analyze review comments for recurring quality issues.',
    ],
    stayops: [
      'Explore AI features for StayOps: automatic turnover summaries, guest-message drafts, photo-check assistance.',
      'Map the jagged frontier for your workflows: keep a list of tasks where AI is great and where it fails.',
    ],
    personal: 'Use AI as a tutor for parenting questions, and verify important advice with your pediatrician.',
    exercises: [
      ex('ci-table', 'Invite AI to three tasks', 20, [
        'Pick three real tasks this week (one Lyons, one StayOps, one personal).',
        'Give the AI a role and context, then ask for help.',
        'Rate the results and record what worked on your jagged-frontier list.',
      ]),
      ex('ci-role', 'Write a role prompt', 10, [
        'Write a reusable prompt: "You are an operations coach for a cleaning company with field crews…"',
        'Save it and reuse it in the Mentor\'s "Copy prompt" feature.',
      ]),
    ],
    quiz: [
      q('What is the "jagged frontier"?', ['A border dispute', 'AI being strong at some tasks and weak at similar-looking ones', 'A chip shortage', 'Slow internet'], 1, 'You learn its shape by experimenting.'),
      q('Which is one of Mollick\'s rules?', ['Never use AI for work', 'Be the human in the loop', 'Trust AI output fully', 'Only use AI for code'], 1, 'Human judgment stays essential.'),
      q('Why "assume this is the worst AI you will ever use"?', ['AI is getting worse', 'Capabilities keep improving, so plan for that', 'To lower expectations of staff', 'It is a legal disclaimer'], 1, 'Prepare for rapid improvement.'),
    ],
    tags: ['AI', 'technology', 'productivity', 'automation'],
  },
];
