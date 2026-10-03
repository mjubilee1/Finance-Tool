# CEO agenda contract

Google Calendar is the source of truth for time. Life OS explains the day; it does not turn every suggestion into a commitment.

## Layers

1. **Autopilot:** Lyft to the daily target (AM first, after-work only for the remaining gap), W-2 commitments, and optional gym until the weekly target is met.
2. **CEO growth:** named Calendar blocks only: Nearby story, Nearby demo, one or two People reach-outs, or a high-signal timed event.
3. **Flex:** recovery or discretionary time left after the first two layers.

An `Interested` local event is context, not agenda work. `Planned` means it has an exact start/end and was successfully written to Google Calendar.

## Stored fields

- `AgendaSettings`: primary/secondary venture, Lyft daily target and AM window, gym weekly target, morning briefing time.
- `AgentGrowthBlock`: external idempotency key, Google event id, block type, title, exact start/end, status.
- `LocalEventItem`: `plannedStart`, `plannedEnd`, and `calendarEventId`; these stay empty for `Interested`.
- Daily Lyft actuals remain in `GrowthActivity` earnings logs, so the agenda can calculate the remaining target without a separate bot.

## CEO agent write API

`POST /api/agent/growth-blocks`

Authenticate with `Authorization: Bearer $LIFE_OS_AGENT_API_KEY`. Set `LIFE_OS_OWNER_EMAIL` to choose the single Life OS owner.

```json
{
  "externalId": "ceo-2026-10-03-nearby-demo",
  "blockType": "nearby_demo",
  "startsAt": "2026-10-03T18:00:00-04:00",
  "endsAt": "2026-10-03T20:00:00-04:00",
  "outcome": "Clickable story-to-demo path",
  "detail": "First complete pass",
  "signal": "normal"
}
```

Supported `blockType` values: `nearby_story`, `nearby_demo`, `people`, and `high_signal_event`. A People block also requires `people` with one or two names. Weekday writes must start after 5 PM; weekend writes may use open time. Events require `signal: "high"` and an exact time.

Reusing `externalId` updates the existing Calendar event instead of creating another one. `GET /api/agent/growth-blocks` returns upcoming agent-owned blocks.

## Saturday rule

Default to deep Nearby story/demo work. Replace it with an event only when the event is high-signal and has a confirmed start and end time. Otherwise keep it as `Interested`; it does not enter Today.
