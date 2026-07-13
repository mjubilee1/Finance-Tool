import { DateTime } from "luxon";

const QUOTES_OF_THE_DAY = [
  {
    message: "Keep the main thing the main thing — leverage first, noise later.",
    attribution: "Stephen R. Covey, adapted",
  },
  {
    message: "You don't need to be perfect today. You need to be intentional.",
    attribution: null,
  },
  {
    message: "Small consistent moves compound faster than occasional big swings.",
    attribution: null,
  },
  {
    message: "Protect the highest-leverage block before reacting to every urgent ping.",
    attribution: null,
  },
  {
    message: "Begin with the end in mind — then put first things first.",
    attribution: "Stephen R. Covey, adapted",
  },
  {
    message: "A strong week earns room for joy. Protect the wins before you spend them.",
    attribution: null,
  },
  {
    message: "One clear move today beats ten vague plans.",
    attribution: null,
  },
  {
    message: "Your pace can adjust — your direction doesn't have to.",
    attribution: null,
  },
  {
    message: "Rest is part of compounding when it is chosen and capped.",
    attribution: null,
  },
  {
    message: "Finish open work before chasing a headline.",
    attribution: null,
  },
  {
    message: "Promotion paths are lists you execute — not one-pagers you restart.",
    attribution: null,
  },
  {
    message: "Body, leverage, and intentional joy reinforce each other. Cash follows the system.",
    attribution: null,
  },
  {
    message: "Network equity compounds slower than cash and pays longer.",
    attribution: null,
  },
  {
    message: "What you protect in the morning shapes what the evening can hold.",
    attribution: null,
  },
  {
    message: "You're not assembling a budget — you're assembling a life that reinforces itself.",
    attribution: null,
  },
  {
    message: "Low-leverage hours feel productive until you add them up.",
    attribution: null,
  },
  {
    message: "Do the hard important thing first when the day shape allows it.",
    attribution: null,
  },
  {
    message: "Once cash is on rails, check it briefly — then get back to the lever that compounds.",
    attribution: null,
  },
  {
    message: "The best days feel quiet because the plan was already set.",
    attribution: null,
  },
  {
    message: "Progress isn't always on a chart. Trust the habits underneath it.",
    attribution: null,
  },
  {
    message: "Earn the splurge, then enjoy it — guilt-free spending is part of the plan.",
    attribution: null,
  },
  {
    message: "You are building optionality across career, body, network, and money.",
    attribution: null,
  },
  {
    message: "When the week feels tight, shrink the move — don't abandon the system.",
    attribution: null,
  },
  {
    message: "Show up to the day you actually have — office, WFH, or weekend.",
    attribution: null,
  },
  {
    message: "Macro goals are built from micro choices. Today's choice counts.",
    attribution: null,
  },
  {
    message: "Stability isn't boring — it's the floor everything else grows from.",
    attribution: null,
  },
  {
    message: "Skip regenerating the same advice. Ship the next concrete step.",
    attribution: null,
  },
  {
    message: "Wealth is built quietly. Keep stacking quiet wins.",
    attribution: null,
  },
  {
    message: "Off track for a day isn't off track for the goal. Reset and continue.",
    attribution: null,
  },
  {
    message: "You're the coach of your own day. Act like it for the next decision.",
    attribution: null,
  },
  {
    message: "Local life, local leverage — Oxon Hill days don't need Downtown DC mornings.",
    attribution: null,
  },
];

export type DailyAffirmation = {
  message: string;
  attribution: string | null;
  toneLabel: string;
};

/** Quote of the day — stable per calendar day. */
export function getDailyAffirmation(date = DateTime.local()): DailyAffirmation {
  const dayOfYear = date.ordinal;
  const entry = QUOTES_OF_THE_DAY[dayOfYear % QUOTES_OF_THE_DAY.length];
  return {
    message: entry.message,
    attribution: entry.attribution,
    toneLabel: "Quote of the day",
  };
}

export function getPersonalizedGreeting(userName?: string | null, date = DateTime.local()) {
  const hour = date.hour;
  const timeGreeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = userName?.trim().split(/\s+/)[0];
  return firstName ? `${timeGreeting}, ${firstName}` : timeGreeting;
}
