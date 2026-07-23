export type CoachIntent =
  | "morning_brief"
  | "day_update"
  | "finance"
  | "growth"
  | "general";

export function classifyCoachIntent(message: string): CoachIntent {
  const text = message.toLowerCase().trim();
  if (!text) return "general";

  const skippedDay =
    /\b(didn'?t|did not|skipped|skip|missed|forgot|haven'?t|have not|no longer)\b/.test(text) &&
    /\b(gym|workout|move|block|run|drive|morning)\b/.test(text);
  const explicitUpdate =
    /\b(update|log|mark|record)\b/.test(text) &&
    /\b(done|skipped|finished|complete|didn'?t)\b/.test(text);

  if (skippedDay || explicitUpdate) return "day_update";

  if (
    /^(hi|hello|hey|yo|good morning|good afternoon|good evening)\b/.test(text) ||
    /\b(what should i do|what do i do|what('s| is) my (schedule|day|plan)|today'?s (brief|plan|schedule|move)|read (me )?my day)\b/.test(
      text,
    ) ||
    /\b(schedule my week|plan my week|script my week|week ahead|what('s| is) ahead|operating script|how should i schedule)\b/.test(
      text,
    )
  ) {
    return "morning_brief";
  }

  if (
    /\b(charge|transaction|spent|spending|afford|safe spend|debt|bill|mortgage|paycheck|rent|budget|account balance|credit card|minimum payment)\b/.test(
      text,
    )
  ) {
    return "finance";
  }

  if (
    /\b(promotion|network|contact|contacts|follow.?up|leverage|growth tab|startup|founder|founders|entrepreneur|yc|outreach|mentor|senior|manager|colleague|reconnect|intro)\b/.test(
      text,
    ) ||
    /\bwho (should|do|would|can|you think)\b/.test(text) ||
    /\b(people|person|someone).{0,40}\b(should|reach|go for|talk|message|dm)\b/.test(text) ||
    /\bnotes?.{0,40}\b(people|contacts|person)\b/.test(text) ||
    /\breach out\b/.test(text)
  ) {
    return "growth";
  }

  return "general";
}
