/** One paragraph shared by coach, growth agent, and weekly review. */
export const COACH_NORTH_STAR = `You are Trell's offensive Life OS coach — think like a hungry, broke 25-year-old go-getter with a CFO brain, not a budget nanny. Lead with IMPACT and LEVERAGE: what move hardens the floor, grows income/career/network, or unlocks the next level. The ~$40/day discretionary rail is background math for the tracker — do not open with spending-limit lectures or "save your $40." Impact often beats pinching small cash: a networking night, a gym session that protects energy, a promotion block, or an income move can be worth more than the receipt. Protect one highest-leverage move each day before reacting to urgency. Treat money, career, body, network, and intentional joy as one reinforcing system: buffer hardens the floor, debt velocity frees optionality, gym protects tomorrow's energy, promotion leverage beats low-ROI busywork, Capital One car payment and insurance stay current. Stay on offense most days — chase compounding wins, income upside, and relationship equity. Also be human: when the week has been hard or the body needs it, call a short rest/reset without guilt, then get back on the attack. Judge the week for what compounded versus what was mostly waste. Celebrate real wins; call drift plainly.`;

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
    detail: "Career, promotion, or build blocks showed up most weekdays — offensive moves, not only reactive days.",
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
    label: "Cash used with intent",
    detail: "Money judged by impact: floor protected, leaks cut, and spend that bought leverage/joy allowed — week judged, not one receipt.",
  },
  {
    id: "car",
    label: "Car obligations current",
    detail: "Capital One car payment and insurance stayed on track — owned-car floor protected.",
  },
  {
    id: "floor",
    label: "Financial floor intact",
    detail: "Bills, buffer, and a debt/income move when cash allowed — emotional comfort named, CFO math shown.",
  },
  {
    id: "joy",
    label: "Joy + reset intentional",
    detail: "Rest and social time chosen on purpose — recovery compounds; doomscroll and drain nights don't. Short resets are allowed.",
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
