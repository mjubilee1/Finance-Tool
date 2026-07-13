export type TrendsSpeechLane = "tech" | "dmv";

type MainThing = { title: string; why: string; oneAction: string };

type TrendSpeechItem = {
  title: string;
  summary: string;
  whyItMatters: string;
  status: string;
};

export function buildTrendsSpeechText(params: {
  lane: TrendsSpeechLane;
  focusGuardrail: string;
  main: MainThing;
  items: TrendSpeechItem[];
}): string {
  const laneLabel = params.lane === "tech" ? "Tech trends" : "DMV trends";
  const parts = [
    `${laneLabel} for today.`,
    params.focusGuardrail,
    `Focus today. ${params.main.title}. ${params.main.why}. One action: ${params.main.oneAction}.`,
  ];

  const activeItems = params.items.filter(
    (item) => item.status !== "dismissed" && item.status !== "parked",
  );

  if (activeItems.length > 0) {
    parts.push(`Today's signal. ${activeItems.length} items.`);
    activeItems.forEach((item, index) => {
      parts.push(
        `Item ${index + 1}. ${item.title}. ${item.summary}. For you: ${item.whyItMatters}.`,
      );
    });
  }

  return parts.join("\n\n");
}
