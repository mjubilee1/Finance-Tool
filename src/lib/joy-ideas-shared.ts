export type DayShape = "office" | "wfh" | "weekend";

export type JoyIdea = {
  id: string;
  label: string;
  detail: string;
  timeFit: string;
};

export type JoyIdeasResult = {
  ideas: JoyIdea[];
  weatherSummary: string | null;
  dayShape: DayShape;
  dateLabel: string;
};

/** Luxon weekday: 1=Mon … 7=Sun. Real rhythm: Mon–Wed office, Thu–Fri WFH, Sat–Sun open. */
export function dayShapeFor(weekday: number): DayShape {
  if (weekday >= 1 && weekday <= 3) return "office";
  if (weekday === 4 || weekday === 5) return "wfh";
  return "weekend";
}

export function timeBudgetFor(shape: DayShape) {
  if (shape === "weekend") return "2-4 hour cap";
  if (shape === "office") return "20-40 minute evening window";
  return "30-60 minute window around the job day";
}
