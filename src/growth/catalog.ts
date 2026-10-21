import { PART_TWO } from './catalog-part2';
import { ex, q } from './build';
import type { CatalogBook } from './types';

// All summaries, key ideas, exercises and quiz questions below are original
// writing for this app. They describe each book's ideas in our own words and
// contain no text from the books.


const PART_ONE: CatalogBook[] = [
  {
    id: 'atomic-habits',
    order: 1,
    title: 'Atomic Habits',
    author: 'James Clear',
    year: 2018,
    category: 'discipline',
    skill: 'Discipline, habits, routines and consistency',
    summary:
      'Small habits, repeated daily, compound into large results. Instead of chasing goals, build systems that make the right behavior the default. The book gives four levers for building a habit (make it obvious, attractive, easy and satisfying) and the reverse four for breaking one. Lasting change comes from shifting identity: every repetition is a vote for the person you want to become.',
    keyIdeas: [
      'Systems beat goals: winners and losers often share the same goal; the system is what differs.',
      'Identity-based habits: decide who you want to be, then prove it with small wins.',
      'The four laws: obvious, attractive, easy, satisfying — and their inversions to break bad habits.',
      'Habit stacking: "After I [current habit], I will [new habit]."',
      'The two-minute rule and "never miss twice" keep a streak alive on bad days.',
    ],
    lyons: [
      'Turn every service into a checklist the crew can follow without thinking: same order, same tools, same final photo walk-through.',
      'Stack quality habits onto existing ones: "After I unlock the property, I take the before photos."',
      'Make the right supplies obvious and easy: pre-packed caddies per job type reduce missed steps.',
    ],
    stayops: [
      'Design defaults into the product so hosts and cleaners do the right thing with the least effort.',
      'Ship small improvements every week; 1% better each week compounds over a year.',
    ],
    personal: 'Use the daily 30-minute block as your keystone habit; protect it with "never miss twice".',
    exercises: [
      ex('ah-scorecard', 'Habit scorecard', 10, [
        'List everything you do from waking up to starting work.',
        'Mark each one + (helps), − (hurts) or = (neutral) for the person you want to be.',
        'Circle one − habit to make harder and one + habit to make easier this week.',
      ]),
      ex('ah-stack', 'Write two habit stacks', 5, [
        'Pick one business habit and one family habit you want.',
        'Write each as "After I ___, I will ___." using something you already do daily.',
        'Put the cue where you will see it (phone lock screen, van dashboard, fridge).',
      ]),
    ],
    quiz: [
      q('According to the book, what most explains different results between people with the same goal?', ['Talent', 'Their systems', 'Motivation', 'Luck'], 1, 'Goals set direction; systems (daily processes) produce results.'),
      q('Which is the inversion of "make it easy" for breaking a bad habit?', ['Make it invisible', 'Make it unattractive', 'Make it difficult', 'Make it unsatisfying'], 2, 'Add friction: increase the number of steps between you and the bad habit.'),
      q('What does "never miss twice" protect against?', ['Burnout', 'One slip turning into a new pattern', 'Perfectionism in planning', 'Overtraining'], 1, 'Missing once is an accident; missing twice starts a new habit.'),
    ],
    tags: ['habits', 'routine', 'systems', 'identity', 'consistency'],
  },
  {
    id: 'confidence-gap',
    order: 2,
    title: 'The Confidence Gap',
    author: 'Russ Harris',
    year: 2011,
    category: 'confidence',
    skill: 'Acting confidently even when experiencing self-doubt',
    summary:
      'Waiting to feel confident before acting keeps people stuck. Built on Acceptance and Commitment Therapy, the book argues that the actions of confidence come first and the feelings follow later, if at all. Fear and self-doubt are normal companions of anything meaningful; the skill is to unhook from unhelpful thoughts, make room for uncomfortable feelings, and take action guided by your values.',
    keyIdeas: [
      'Actions of confidence come first; feelings of confidence come later.',
      'Fear is not the enemy: it shows up whenever you step outside your comfort zone.',
      'Defusion: notice a thought ("I\'m having the thought that I\'ll mess this up") instead of obeying it.',
      'Make room for anxiety rather than waiting for it to leave.',
      'Let values, not feelings, choose your next move; practice the skill, then assess and adjust.',
    ],
    lyons: [
      'Make the uncomfortable call: quote higher-value commercial contracts even if you feel you are "not ready".',
      'Give crew feedback the same day, even when it feels awkward; confidence grows from repetitions.',
    ],
    stayops: [
      'Pitch StayOps to hosts and property managers before the product feels "perfect"; learn from each demo.',
      'Name your fear before investor or partner meetings, then act on your values anyway.',
    ],
    personal: 'As a new dad, accept that uncertainty is part of the job; act on your values (presence, patience) rather than waiting to feel like an expert.',
    exercises: [
      ex('cg-defuse', 'Unhook from one thought', 5, [
        'Write down the harshest thought you have about a challenge this week.',
        'Rewrite it as "I\'m noticing the thought that…".',
        'Say it out loud in a silly voice, then write the one action you will take anyway.',
      ]),
      ex('cg-values', 'Values-based action', 10, [
        'Pick three values you want to be known for at work and at home.',
        'For each, write one small action you can take in the next 48 hours.',
        'Do one today, even if fear shows up.',
      ]),
    ],
    quiz: [
      q('In this book, what comes first?', ['Feelings of confidence', 'Actions of confidence', 'Positive affirmations', 'Removing fear'], 1, 'You act first; the feeling may follow with practice.'),
      q('What is "defusion"?', ['Arguing with your thoughts', 'Stepping back and noticing thoughts as thoughts', 'Replacing negative thoughts with positive ones', 'Avoiding difficult situations'], 1, 'You see the thought for what it is, so it loses its grip.'),
      q('How does the book treat fear before a big challenge?', ['As a sign to stop', 'As something to eliminate first', 'As a normal companion you make room for', 'As weakness'], 2, 'Fear is expected when doing something meaningful.'),
    ],
    tags: ['confidence', 'fear', 'ACT', 'self-doubt', 'values'],
  },
  {
    id: 'win-friends',
    order: 3,
    title: 'How to Win Friends and Influence People',
    author: 'Dale Carnegie',
    year: 1936,
    category: 'confidence',
    skill: 'Conversation skills, networking, listening and building relationships',
    summary:
      'A classic guide to dealing with people. Its core message is simple and still powerful: people respond to being genuinely appreciated, heard and respected. Criticism makes people defensive; sincere interest, remembering names, listening and talking in terms of what the other person wants build goodwill. When you need to change someone\'s mind or correct them, do it in a way that lets them keep their dignity.',
    keyIdeas: [
      'Do not criticize, condemn or complain; it rarely changes behavior.',
      'Give honest, sincere appreciation, and be genuinely interested in other people.',
      'Remember names, listen well, and talk in terms of the other person\'s interests.',
      'Avoid arguments; admit your mistakes quickly; let people save face.',
      'Ask questions instead of giving orders, and praise the smallest improvement.',
    ],
    lyons: [
      'Learn and use every client\'s and cleaner\'s name; note family details in the CRM.',
      'When a cleaner misses something, start with what they did well, then ask how the miss could be prevented.',
      'Turn client complaints into loyalty: listen fully, admit the mistake quickly, fix it fast.',
    ],
    stayops: [
      'In sales demos, talk about the host\'s goals (five-star reviews, less stress), not your features.',
      'Build partnerships by being useful first: share insights with property managers before asking for anything.',
    ],
    personal: 'Give sincere appreciation at home every day; it costs nothing and builds the relationship.',
    exercises: [
      ex('wf-appreciate', 'Three sincere appreciations', 5, [
        'Choose one crew member, one client and one family member.',
        'Write one specific, honest thing you appreciate about each.',
        'Tell them today, in person or by message.',
      ]),
      ex('wf-listen', 'Listening-only conversation', 15, [
        'In your next conversation with a client or team member, ask about their goals.',
        'Speak less than a third of the time; ask follow-up questions.',
        'Afterward, write down three things you learned about them.',
      ]),
    ],
    quiz: [
      q('What does the book say about criticism?', ['It motivates high performers', 'It puts people on the defensive', 'It is necessary weekly', 'It works if delivered publicly'], 1, 'Criticism tends to make people justify themselves rather than change.'),
      q('Which approach does the book recommend for winning someone to your way of thinking?', ['Win the argument with facts', 'Avoid the argument altogether', 'Tell them they are wrong early', 'Escalate to authority'], 1, 'You cannot really win an argument; avoid it.'),
      q('How should a leader correct someone, according to the book?', ['Publicly, to set an example', 'Begin with praise and call attention to mistakes indirectly', 'In writing only', 'Not at all'], 1, 'Let the person keep their dignity while improving.'),
    ],
    tags: ['relationships', 'listening', 'networking', 'influence', 'people skills'],
  },
  {
    id: 'crucial-conversations',
    order: 4,
    title: 'Crucial Conversations',
    author: 'Kerry Patterson, Joseph Grenny, Ron McMillan & Al Switzler',
    year: 2002,
    category: 'leadership',
    skill: 'Assertiveness, difficult conversations and handling conflict professionally',
    summary:
      'A crucial conversation has high stakes, differing opinions and strong emotions. Most people either go silent or turn aggressive. The book teaches how to keep dialogue open: get clear on what you really want, watch for when safety breaks down, restore it with mutual purpose and respect, separate facts from the story you are telling yourself, share your view tentatively, invite the other side, and end with clear actions.',
    keyIdeas: [
      'Start with heart: what do I really want for me, for them and for the relationship?',
      'Watch for silence or violence — signs that people no longer feel safe.',
      'Make it safe: establish mutual purpose and mutual respect; apologize or use contrasting when needed.',
      'Master your stories: separate observed facts from the conclusions you drew.',
      'Share your path (facts first, then your story, tentatively) and invite theirs; finish with who does what by when.',
    ],
    lyons: [
      'Address a crew member\'s repeated lateness with facts first, a tentative story, and a question about their view.',
      'Handle an upset client by restating the shared goal (a property ready on time) before discussing fault.',
    ],
    stayops: [
      'Use mutual purpose with co-founders or partners when priorities clash: agree on the outcome before the method.',
      'End every hard product or partner discussion with a written "who does what by when".',
    ],
    personal: 'Use "start with heart" before tense conversations with your partner, especially when tired.',
    exercises: [
      ex('cc-prep', 'Prepare one crucial conversation', 15, [
        'Name a conversation you have been avoiding.',
        'Write what you really want for you, them and the relationship.',
        'List the facts only, then your story separately.',
        'Draft your opening sentence that states mutual purpose.',
      ]),
      ex('cc-state', 'Rewrite a message using STATE', 10, [
        'Take a recent tense text or email you sent.',
        'Rewrite it: share facts, tell your story tentatively, ask for their view.',
        'Compare the two versions and note the difference in tone.',
      ]),
    ],
    quiz: [
      q('What three conditions make a conversation "crucial"?', ['Long, formal, recorded', 'High stakes, differing opinions, strong emotions', 'Public, urgent, written', 'Legal, financial, personal'], 1, 'All three together make it crucial.'),
      q('What should you share first when stating your view?', ['Your conclusion', 'Your feelings', 'The facts', 'The consequences'], 2, 'Facts are the least controversial and most persuasive starting point.'),
      q('When someone becomes defensive, what has usually broken down?', ['Their intelligence', 'Safety', 'The agenda', 'Time'], 1, 'Restore safety through mutual purpose and respect before continuing.'),
    ],
    tags: ['conflict', 'feedback', 'assertiveness', 'dialogue', 'management'],
  },
  {
    id: 'seven-habits',
    order: 5,
    title: 'The 7 Habits of Highly Effective People',
    author: 'Stephen R. Covey',
    year: 1989,
    category: 'leadership',
    skill: 'Responsibility, priorities, leadership and character',
    summary:
      'Effectiveness comes from character and principles, not techniques. The first three habits build personal independence (take responsibility, define the end you want, and schedule what matters most). The next three build effective relationships (seek win-win, understand before being understood, and create solutions together). The seventh keeps all of it sustainable by renewing body, mind, heart and spirit.',
    keyIdeas: [
      'Be proactive: focus on your circle of influence, not your circle of concern.',
      'Begin with the end in mind: write a personal mission and define success before starting.',
      'Put first things first: protect important-but-not-urgent work (Quadrant II).',
      'Think win-win and seek first to understand, then to be understood.',
      'Synergize and sharpen the saw: renew yourself physically, mentally, socially and spiritually.',
    ],
    lyons: [
      'Block weekly Quadrant II time for hiring, training and systems instead of only firefighting jobs.',
      'Negotiate win-win contracts with commercial clients so both sides want to renew.',
    ],
    stayops: [
      'Write the StayOps mission and use it to say no to features that do not serve it.',
      'Run customer discovery by seeking first to understand host problems before pitching.',
    ],
    personal: 'Write a family mission statement with your partner; revisit it each quarter.',
    exercises: [
      ex('7h-mission', 'Draft a personal mission', 20, [
        'Imagine your 80th birthday: what would you want family, team and clients to say?',
        'Write five sentences that capture who you want to be and what you want to build.',
        'Read it at the start of each weekly review.',
      ]),
      ex('7h-q2', 'Plan a Quadrant II week', 10, [
        'List your roles (owner, leader, father, partner, builder of StayOps).',
        'Choose one important-but-not-urgent goal per role for this week.',
        'Put each one in your calendar before anything else.',
      ]),
    ],
    quiz: [
      q('Which habit is about focusing on what you can control?', ['Synergize', 'Be proactive', 'Think win-win', 'Sharpen the saw'], 1, 'Proactive people act within their circle of influence.'),
      q('Quadrant II activities are…', ['Urgent and important', 'Not urgent but important', 'Urgent but not important', 'Neither'], 1, 'Planning, relationships and prevention live in Quadrant II.'),
      q('What does "seek first to understand" ask you to do?', ['Explain your view clearly first', 'Listen with the intent to understand before replying', 'Research online first', 'Ask for written requirements'], 1, 'Empathic listening comes before being understood.'),
    ],
    tags: ['priorities', 'character', 'leadership', 'time management', 'mission'],
  },
  {
    id: 'emotional-intelligence',
    order: 6,
    title: 'Emotional Intelligence',
    author: 'Daniel Goleman',
    year: 1995,
    category: 'discipline',
    skill: 'Understanding emotions, empathy and self-awareness',
    summary:
      'IQ alone does not predict success at work or in life. Goleman popularized emotional intelligence: knowing your own emotions, managing them, motivating yourself, recognizing emotions in others, and handling relationships. Strong emotions can "hijack" thinking; the good news is that these skills can be learned and taught.',
    keyIdeas: [
      'Self-awareness — noticing a feeling as it happens — is the foundation.',
      'Emotional hijacks happen when strong emotion overrides reasoning; pausing restores control.',
      'Self-motivation and delaying gratification support long-term goals.',
      'Empathy means reading others\' feelings, often from tone and body language.',
      'Handling relationships well is a skill of managing emotions in others.',
    ],
    lyons: [
      'Before responding to an angry client, name your own emotion and wait before replying.',
      'Hire for empathy and self-control as well as skill; they predict reliability with clients.',
    ],
    stayops: [
      'Read emotion in host feedback: frustration often signals a workflow pain worth solving.',
      'Keep your temper in check during outages; your calm sets the team\'s tone.',
    ],
    personal: 'Name your feelings when tired and stressed at home; it lowers their intensity and helps you respond, not react.',
    exercises: [
      ex('ei-log', 'Emotion log', 5, [
        'Three times today, write: what I feel, how strongly (1–10), what triggered it.',
        'Note what you did next and whether it helped.',
      ]),
      ex('ei-empathy', 'Empathy check', 10, [
        'Pick someone who frustrated you this week.',
        'Write what they might have been feeling and needing.',
        'Decide one way to respond that addresses that need.',
      ]),
    ],
    quiz: [
      q('What is the foundation of emotional intelligence?', ['Charisma', 'Self-awareness', 'IQ', 'Optimism'], 1, 'Recognizing feelings as they happen comes first.'),
      q('An "emotional hijack" is…', ['A planned outburst', 'Strong emotion overriding rational thinking', 'Manipulating others', 'A type of empathy'], 1, 'Pausing helps the thinking brain catch up.'),
      q('According to the book, emotional skills…', ['Are fixed at birth', 'Can be learned', 'Matter only in childhood', 'Are less important than IQ at work'], 1, 'They can be developed at any age.'),
    ],
    tags: ['emotions', 'empathy', 'self-awareness', 'self-control'],
  },
  {
    id: 'happiness-trap',
    order: 7,
    title: 'The Happiness Trap',
    author: 'Russ Harris',
    year: 2007,
    category: 'discipline',
    skill: 'Managing thoughts, stress and anxiety',
    summary:
      'Chasing constant happiness and fighting unpleasant feelings often makes life worse. Using Acceptance and Commitment Therapy, the book teaches six skills: unhooking from thoughts, making room for feelings, connecting with the present moment, noticing from the observing self, clarifying values, and taking committed action. The aim is a rich, meaningful life that includes the full range of emotions.',
    keyIdeas: [
      'Trying to control or avoid painful feelings often amplifies them.',
      'Defusion: thoughts are words and pictures, not orders or facts.',
      'Expansion: make room for feelings instead of struggling with them.',
      'Connection: anchor in the present moment.',
      'Values and committed action give life direction regardless of mood.',
    ],
    lyons: [
      'When a busy week triggers "everything will fall apart" thoughts, unhook and do the next most important task.',
      'Use a 60-second present-moment check before client walk-throughs to show up calm.',
    ],
    stayops: [
      'Separate the story ("this launch will fail") from the facts (metrics, feedback) when deciding.',
      'Commit to values-based action (helping hosts) on days motivation is low.',
    ],
    personal: 'Use present-moment connection during time with your child; put the phone in another room.',
    exercises: [
      ex('ht-leaves', 'Leaves on a stream', 5, [
        'Sit quietly and imagine a stream with leaves floating by.',
        'Place each thought on a leaf and watch it float away for three minutes.',
        'Note how it felt to observe thoughts rather than follow them.',
      ]),
      ex('ht-values', 'Values compass', 15, [
        'Write your values for work, family, health and growth.',
        'Rate how closely you lived each this week (1–10).',
        'Pick one committed action for the lowest score.',
      ]),
    ],
    quiz: [
      q('What does the book say about trying to get rid of unpleasant feelings?', ['It always works with effort', 'It often makes them stronger', 'It is the main goal of therapy', 'It is only for experts'], 1, 'Struggle tends to amplify the feeling.'),
      q('Which therapy is the book based on?', ['CBT', 'Acceptance and Commitment Therapy', 'Psychoanalysis', 'Hypnotherapy'], 1, 'ACT underlies the six core skills.'),
      q('What gives direction when motivation is low?', ['Willpower', 'Values and committed action', 'Positive thinking', 'Rewards'], 1, 'Values guide action even when feelings disagree.'),
    ],
    tags: ['stress', 'anxiety', 'mindfulness', 'ACT', 'resilience'],
  },
  {
    id: 'deep-work',
    order: 8,
    title: 'Deep Work',
    author: 'Cal Newport',
    year: 2016,
    category: 'discipline',
    skill: 'Concentration and high-value focused work',
    summary:
      'Deep work — focused, distraction-free effort that pushes your abilities — is becoming rarer and more valuable. Newport argues for deliberately training focus: schedule deep sessions, build rituals around them, accept boredom instead of constantly reaching for the phone, be selective about social media, and shrink shallow work like email and admin.',
    keyIdeas: [
      'Deep work produces high-value results and is increasingly rare.',
      'Attention residue: switching tasks leaves part of your mind on the previous task.',
      'Choose a depth philosophy (for example, rhythmic: same time every day) and use rituals.',
      'Embrace boredom: train focus by not reaching for distraction.',
      'Drain the shallows: time-block your day and end with a shutdown ritual.',
    ],
    lyons: [
      'Block two deep hours weekly for pricing, hiring plans and process documentation — phone on Do Not Disturb.',
      'Batch scheduling and client messages into set windows instead of answering all day.',
    ],
    stayops: [
      'Protect daily deep sessions for product design and code; meetings go in the afternoon.',
      'Measure deep hours per week as a leading indicator of product progress.',
    ],
    personal: 'A shutdown ritual at the end of the workday lets you be fully present at home.',
    exercises: [
      ex('dw-block', 'Time-block tomorrow', 10, [
        'Divide tomorrow into blocks of at least 30 minutes.',
        'Assign one 90-minute deep block to your most valuable task.',
        'Batch shallow work (messages, admin) into two blocks.',
      ]),
      ex('dw-shutdown', 'Design a shutdown ritual', 5, [
        'List the checks you need before stopping work (calendar, open jobs, tomorrow\'s top 3).',
        'End with a phrase like "Shutdown complete".',
        'Use it every workday this week.',
      ]),
    ],
    quiz: [
      q('What is "attention residue"?', ['Leftover tasks at day end', 'Part of your attention staying on a previous task after switching', 'Notes from meetings', 'Burnout'], 1, 'Frequent switching lowers performance.'),
      q('Which is a recommended rule in the book?', ['Answer email instantly', 'Embrace boredom', 'Multitask more', 'Avoid planning'], 1, 'Tolerating boredom trains focus.'),
      q('What is a shutdown ritual for?', ['Closing the office', 'Ending work cleanly so the mind can rest', 'Backing up files', 'Firing clients'], 1, 'It signals the brain that work is done for the day.'),
    ],
    tags: ['focus', 'productivity', 'time blocking', 'distraction'],
  },
  {
    id: 'never-split',
    order: 9,
    title: 'Never Split the Difference',
    author: 'Chris Voss with Tahl Raz',
    year: 2016,
    category: 'leadership',
    skill: 'Negotiation and persuasion',
    summary:
      'A former FBI hostage negotiator argues that negotiation is driven by emotion more than logic. His toolkit centers on tactical empathy: mirroring the other person\'s words, labeling their emotions, defusing objections in advance with an "accusation audit", asking calibrated "how" and "what" questions, and aiming for "that\'s right" rather than a grudging "yes".',
    keyIdeas: [
      'Tactical empathy: understand and voice the other side\'s perspective and emotions.',
      'Mirroring repeats a few key words to keep them talking; labeling names their feeling ("It seems like…").',
      'An accusation audit lists the negatives they might think about you, before they say them.',
      'Calibrated questions ("How am I supposed to do that?") make them solve your problem.',
      '"That\'s right" signals real agreement; "You\'re right" often means they want you to stop.',
    ],
    lyons: [
      'When a client pushes on price, label it ("It sounds like budget is tight this quarter") and ask "What would make this work for you?"',
      'Open a price increase conversation with an accusation audit to reduce pushback.',
    ],
    stayops: [
      'In partner or investor negotiations, ask calibrated questions instead of making counteroffers too early.',
      'Use labels in user interviews to uncover the real pain behind feature requests.',
    ],
    personal: 'Labeling your partner\'s feelings ("Sounds like today was exhausting") lowers tension quickly.',
    exercises: [
      ex('ns-audit', 'Write an accusation audit', 10, [
        'Pick an upcoming negotiation (price increase, contract, vendor).',
        'List every negative thing they might think about you or the offer.',
        'Turn the top three into opening statements ("You may feel this is…").',
      ]),
      ex('ns-calibrated', 'Five calibrated questions', 5, [
        'For the same negotiation, write five "how" or "what" questions.',
        'Avoid "why" — it can sound accusing.',
        'Keep them on a card for the meeting.',
      ]),
    ],
    quiz: [
      q('What is "mirroring"?', ['Copying body language exactly', 'Repeating the last few key words they said', 'Matching their offer', 'Recording the call'], 1, 'It encourages them to keep explaining.'),
      q('Which response signals genuine agreement?', ['"You\'re right"', '"That\'s right"', '"Maybe"', '"Yes"'], 1, '"That\'s right" means they feel understood.'),
      q('Calibrated questions usually start with…', ['Why or when', 'How or what', 'Is or are', 'Can or could'], 1, 'Open "how/what" questions invite problem-solving.'),
    ],
    tags: ['negotiation', 'pricing', 'persuasion', 'sales', 'empathy'],
  },
  {
    id: 'charisma-myth',
    order: 10,
    title: 'The Charisma Myth',
    author: 'Olivia Fox Cabane',
    year: 2012,
    category: 'confidence',
    skill: 'Presence and confidence',
    summary:
      'Charisma is not an inborn trait; it is a set of learnable behaviors that project presence, power and warmth. Because your body language follows your internal state, the book focuses on managing that state: handling discomfort, quieting the inner critic, and using visualization, so that your presence, confidence and warmth come across naturally.',
    keyIdeas: [
      'Charisma = presence + power + warmth.',
      'Presence is the foundation: people can tell when your mind is elsewhere.',
      'Your internal state leaks into body language, so manage the state first.',
      'Handle discomfort by naming it, neutralizing it and reframing it.',
      'Different styles (focus, kindness, authority, visionary) suit different situations.',
    ],
    lyons: [
      'Show full presence during client walk-throughs: eye contact, no phone, pause before answering.',
      'Balance authority with warmth when leading crew meetings.',
    ],
    stayops: [
      'Use visionary charisma when pitching StayOps; use focus charisma in customer interviews.',
    ],
    personal: 'Give your child and partner full presence for short, phone-free stretches every day.',
    exercises: [
      ex('cm-presence', 'Two-second pause', 5, [
        'In every conversation today, wait two seconds before replying.',
        'Notice how people respond to feeling fully heard.',
      ]),
      ex('cm-reframe', 'Reframe discomfort', 10, [
        'Recall a recent moment you felt awkward or anxious.',
        'Write what you felt, a neutral explanation, and a helpful reframe.',
      ]),
    ],
    quiz: [
      q('The three elements of charisma in this book are…', ['Looks, money, status', 'Presence, power, warmth', 'Humor, height, voice', 'Confidence, speed, wit'], 1, 'All three together create charisma.'),
      q('Why manage your internal state?', ['It changes your clothes', 'It shows in your body language', 'It is required by law', 'It saves time'], 1, 'Body language follows the mind.'),
      q('Charisma is described as…', ['Innate', 'Learnable', 'Only for leaders', 'Fixed after age 25'], 1, 'It can be practiced like any skill.'),
    ],
    tags: ['charisma', 'presence', 'confidence', 'body language'],
  },
  {
    id: 'extreme-ownership',
    order: 11,
    title: 'Extreme Ownership',
    author: 'Jocko Willink & Leif Babin',
    year: 2015,
    category: 'leadership',
    skill: 'Accountability and leadership',
    summary:
      'Two former Navy SEAL officers argue that leaders own everything in their world — including failures they did not directly cause. Drawing on combat lessons and business examples, they explain why there are no bad teams, only bad leaders; why plans must be simple; why you prioritize and execute one problem at a time; and why decentralized command works only when everyone understands the intent.',
    keyIdeas: [
      'Extreme ownership: take full responsibility for results; no excuses, no blame.',
      'There are no bad teams, only bad leaders.',
      'Believe in the mission, and explain the "why" so others can too.',
      'Keep plans simple; prioritize and execute the most important problem first.',
      'Decentralized command: give clear intent so team leads can decide on their own.',
    ],
    lyons: [
      'When a job goes wrong, start the debrief with "Here\'s what I could have done better as the leader."',
      'Give team leads the intent (client happy, on time, safe) and let them adapt on site.',
      'Keep job instructions simple enough for a new cleaner to follow on day one.',
    ],
    stayops: [
      'Own missed deadlines publicly with partners, then present the fix.',
      'During incidents, prioritize and execute: fix the biggest customer-impacting issue first.',
    ],
    personal: 'Own your part in household tension; it invites your partner to do the same.',
    exercises: [
      ex('eo-debrief', 'Ownership debrief', 15, [
        'Pick a recent problem in either business.',
        'List everything you, as the leader, could have done differently.',
        'Choose one change to implement this week and tell the team.',
      ]),
      ex('eo-intent', 'Write commander\'s intent', 10, [
        'For your most common job type, write the purpose and end state in two sentences.',
        'Share it with team leads and ask how they would act if things changed on site.',
      ]),
    ],
    quiz: [
      q('What does "extreme ownership" mean?', ['Owning shares in the company', 'Taking full responsibility for outcomes', 'Micromanaging', 'Working longer hours'], 1, 'Leaders own failures and fixes.'),
      q('"There are no bad teams, only…"', ['bad plans', 'bad leaders', 'bad luck', 'bad clients'], 1, 'Leadership standards set team performance.'),
      q('Decentralized command works when…', ['Everyone has a script', 'The team understands the intent', 'The leader approves every decision', 'Teams are large'], 1, 'Intent lets people decide well on their own.'),
    ],
    tags: ['leadership', 'accountability', 'teams', 'ownership'],
  },
];

export const CATALOG: CatalogBook[] = [...PART_ONE, ...PART_TWO].sort((a, b) => a.order - b.order);

export const catalogBook = (id: string) => CATALOG.find((b) => b.id === id);
