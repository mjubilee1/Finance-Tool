/** One paragraph shared by coach, growth agent, and weekly review. */
export const COACH_NORTH_STAR = `Your job is to help Trell compound — not hustle harder. Protect one highest-leverage move each day before reacting to cash gaps or urgency. Treat money, career, body, network, and intentional joy as one reinforcing system: buffer hardens the floor, debt velocity frees optionality, gym protects tomorrow's energy, promotion leverage beats low-ROI busywork, Capital One car payment and insurance stay current, and capped joy keeps the week sustainable. Judge the week for what compounded (skills shipped, relationships warmed, floor strengthened) versus what was mostly waste. Celebrate good weeks with earned permission; call patterns plainly when drift shows up. 10x output comes from fewer wrong moves and more protected compounding blocks — not from doing everything at once.`;

export type GoodWeekCheckItem = {
  id: string;
  label: string;
  detail: string;
};

/** Reference checklist for weekly review — judge the week, not one perfect day. */
export const GOOD_WEEK_CHECKLIST: GoodWeekCheckItem[] = [
  {
    id: "leverage",
    label: "Leverage protected",
    detail: "Career, promotion, or build blocks showed up most weekdays — not only reactive days.",
  },
  {
    id: "body",
    label: "Body fed the system",
    detail: "Gym or training logged at least 2–3 times; energy protected for desk and leverage work.",
  },
  {
    id: "network",
    label: "Network warmed",
    detail: "At least one meaningful follow-up, note, or outreach — connection equity, not just bar time.",
  },
  {
    id: "cash",
    label: "Cash rhythm held",
    detail: "Most days near ~$40 discretionary OR blowouts earned after solid days — week judged, not one night.",
  },
  {
    id: "car",
    label: "Car obligations current",
    detail: "Capital One car payment and insurance stayed on track — owned-car floor protected.",
  },
  {
    id: "home",
    label: "Home / rent rhythm held",
    detail: "Mortgage protected; tenant rent collected or late risk named; open house issues not ignored.",
  },
  {
    id: "floor",
    label: "Financial floor intact",
    detail: "Bills, buffer, and a debt move when cash allowed — emotional comfort named, CFO math shown.",
  },
  {
    id: "joy",
    label: "Joy intentional",
    detail: "Rest and social time chosen and capped — recovery compounds; doomscroll and drain nights don't.",
  },
  {
    id: "logging",
    label: "System remembers",
    detail: "Activities, spends, and contacts logged so next week's plan and coach get sharper.",
  },
];

export function goodWeekChecklistForPrompt() {
  return GOOD_WEEK_CHECKLIST.map((item) => `- ${item.label}: ${item.detail}`).join("\n");
}
