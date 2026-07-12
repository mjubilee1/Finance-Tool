import { DateTime } from "luxon";

const DAILY_AFFIRMATIONS = [
  {
    message: "Every dollar you direct today strengthens the system you're building.",
    tone: "affirmation" as const,
  },
  {
    message: "Discipline is not deprivation — it's choosing what your future self will thank you for.",
    tone: "wisdom" as const,
  },
  {
    message: "You don't need to be perfect this week. You need to be intentional.",
    tone: "encouragement" as const,
  },
  {
    message: "Small consistent moves compound faster than occasional big swings.",
    tone: "wisdom" as const,
  },
  {
    message: "You're not behind — you're assembling pieces that reinforce each other.",
    tone: "affirmation" as const,
  },
  {
    message: "A strong week earns room for joy. Protect the wins before you spend them.",
    tone: "motivation" as const,
  },
  {
    message: "Cash buffer first. Everything else gets easier after that.",
    tone: "wisdom" as const,
  },
  {
    message: "One clear move today beats ten vague plans.",
    tone: "motivation" as const,
  },
  {
    message: "Your goals are real. Your pace can adjust — your direction doesn't have to.",
    tone: "encouragement" as const,
  },
  {
    message: "Income growth and spending discipline are both levers. Use the one the system needs today.",
    tone: "wisdom" as const,
  },
  {
    message: "You are building optionality, not just cutting costs.",
    tone: "affirmation" as const,
  },
  {
    message: "Rent collected, bills covered, buffer intact — that's a win worth acknowledging.",
    tone: "encouragement" as const,
  },
  {
    message: "Progress isn't always visible on the chart. Trust the habits underneath it.",
    tone: "motivation" as const,
  },
  {
    message: "What you protect in checking protects everything else downstream.",
    tone: "wisdom" as const,
  },
  {
    message: "You showed up to your finances today. That already separates you from most people.",
    tone: "affirmation" as const,
  },
  {
    message: "Earn the splurge, then enjoy it — guilt-free spending is part of the plan.",
    tone: "encouragement" as const,
  },
  {
    message: "Debt paid down today unlocks credit, calm, and the next property move.",
    tone: "motivation" as const,
  },
  {
    message: "Lyft income, paycheck, rent — each stream has a job. Give it one.",
    tone: "wisdom" as const,
  },
  {
    message: "You're the coach of your own life. Act like it for the next decision.",
    tone: "motivation" as const,
  },
  {
    message: "Stability isn't boring — it's the foundation everything else grows from.",
    tone: "affirmation" as const,
  },
  {
    message: "When the week feels tight, shrink the move — don't abandon the system.",
    tone: "encouragement" as const,
  },
  {
    message: "Ten minutes on your numbers today saves ten hours of stress later.",
    tone: "motivation" as const,
  },
  {
    message: "The best financial habit is looking — you're already doing it.",
    tone: "affirmation" as const,
  },
  {
    message: "Macro goals are built from micro choices. Today's choice counts.",
    tone: "wisdom" as const,
  },
  {
    message: "You can rest and still be on track. Recovery is part of performance.",
    tone: "encouragement" as const,
  },
  {
    message: "Cut leakage, fund the buffer, attack the highest-cost debt — in that order when it matters.",
    tone: "wisdom" as const,
  },
  {
    message: "Your future self is counting on the discipline you practice now.",
    tone: "motivation" as const,
  },
  {
    message: "Wealth is built quietly. Keep stacking quiet wins.",
    tone: "affirmation" as const,
  },
  {
    message: "Off track for a day isn't off track for the goal. Reset and continue.",
    tone: "encouragement" as const,
  },
  {
    message: "Every bill you anticipate is power you take back from surprise spending.",
    tone: "wisdom" as const,
  },
  {
    message: "You're building a machine that works for you — feed it one good decision today.",
    tone: "motivation" as const,
  },
];

const TONE_LABELS = {
  affirmation: "Daily affirmation",
  encouragement: "Words of encouragement",
  wisdom: "Daily wisdom",
  motivation: "Today's motivation",
} as const;

export type DailyAffirmation = {
  message: string;
  tone: keyof typeof TONE_LABELS;
  toneLabel: string;
};

export function getDailyAffirmation(date = DateTime.local()): DailyAffirmation {
  const dayOfYear = date.ordinal;
  const entry = DAILY_AFFIRMATIONS[dayOfYear % DAILY_AFFIRMATIONS.length];
  return {
    message: entry.message,
    tone: entry.tone,
    toneLabel: TONE_LABELS[entry.tone],
  };
}

export function getPersonalizedGreeting(userName?: string | null, date = DateTime.local()) {
  const hour = date.hour;
  const timeGreeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = userName?.trim().split(/\s+/)[0];
  return firstName ? `${timeGreeting}, ${firstName}` : timeGreeting;
}
