import { DateTime } from "luxon";
import { getOpenAI } from "./openai";
import {
  dayShapeFor,
  timeBudgetFor,
  type JoyIdea,
  type JoyIdeasResult,
} from "./joy-ideas-shared";

export type { DayShape, JoyIdea, JoyIdeasResult } from "./joy-ideas-shared";
export { dayShapeFor } from "./joy-ideas-shared";

const OXON_HILL = { lat: 38.8032, lon: -76.9897 };

const WMO_LABELS: Record<number, string> = {
  0: "clear",
  1: "mainly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "foggy",
  48: "foggy",
  51: "light drizzle",
  53: "drizzle",
  55: "heavy drizzle",
  61: "light rain",
  63: "rain",
  65: "heavy rain",
  71: "light snow",
  73: "snow",
  75: "heavy snow",
  80: "rain showers",
  81: "rain showers",
  82: "heavy showers",
  95: "thunderstorms",
};

async function fetchOxonHillWeather(): Promise<string | null> {
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(OXON_HILL.lat));
    url.searchParams.set("longitude", String(OXON_HILL.lon));
    url.searchParams.set("current", "temperature_2m,weather_code,precipitation,wind_speed_10m");
    url.searchParams.set("temperature_unit", "fahrenheit");
    url.searchParams.set("wind_speed_unit", "mph");
    url.searchParams.set("timezone", "America/New_York");

    const res = await fetch(url.toString(), { next: { revalidate: 1800 } });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      current?: {
        temperature_2m?: number;
        weather_code?: number;
        precipitation?: number;
        wind_speed_10m?: number;
      };
    };
    const current = data.current;
    if (!current || typeof current.temperature_2m !== "number") return null;
    const condition =
      WMO_LABELS[current.weather_code ?? -1] ?? `code ${current.weather_code ?? "?"}`;
    const precip =
      typeof current.precipitation === "number" && current.precipitation > 0
        ? `, precip ${current.precipitation}`
        : "";
    const wind =
      typeof current.wind_speed_10m === "number"
        ? `, wind ${Math.round(current.wind_speed_10m)} mph`
        : "";
    return `${Math.round(current.temperature_2m)}°F, ${condition}${precip}${wind} (Oxon Hill area)`;
  } catch {
    return null;
  }
}

function slugId(label: string, index: number) {
  return `joy-${index}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
}

function fallbackIdeas(timeBudget: string, weatherSummary: string | null): JoyIdea[] {
  const wet =
    weatherSummary?.match(/rain|drizzle|shower|thunder|snow|fog/i) != null;
  const base = wet
    ? [
        { label: "National Harbor indoor stroll", detail: "Covered / short walk near home if weather is rough." },
        { label: "Local cafe reset", detail: "Sit, people-watch, keep it cheap and capped." },
        { label: "Museum / indoor DC hop", detail: "Smithsonian-style indoor when outdoor is a miss." },
        { label: "Movie or quiet recovery", detail: "Low-effort leisure after gym + leverage." },
      ]
    : [
        { label: "National Harbor walk", detail: "Easy from Oxon Hill — outdoor reset near home." },
        { label: "Local treat + stroll", detail: "Short PG County joy without a long drive." },
        { label: "Easy DC waterfront hop", detail: "Wharf / waterfront when the day is open." },
        { label: "Explore somewhere nearby new", detail: "Pick a DMV pocket you have not done lately." },
      ];

  return base.map((idea, index) => ({
    id: slugId(idea.label, index),
    label: idea.label,
    detail: idea.detail,
    timeFit: timeBudget,
  }));
}

export async function generateJoyIdeasForToday(params?: {
  notes?: string | null;
  cashTight?: boolean;
}): Promise<JoyIdeasResult> {
  const now = DateTime.local().setZone("America/New_York");
  const dayShape = dayShapeFor(now.weekday);
  const timeBudget = timeBudgetFor(dayShape);
  const weatherSummary = await fetchOxonHillWeather();
  const dateLabel = now.toFormat("cccc, LLL d yyyy");

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-5",
      response_format: { type: "json_object" },
      max_completion_tokens: 2000,
      reasoning_effort: "minimal",
      messages: [
        {
          role: "system",
          content: `You suggest intentional leisure for one person living in Oxon Hill, MD (DMV: DC / Maryland / Northern Virginia).
Return JSON only:
{
  "ideas": [
    { "label": "short activity name", "detail": "one sentence why it fits today", "timeFit": "e.g. 2 hr" }
  ]
}
Rules:
- Give 4–6 concrete, doable ideas for TODAY only.
- Respect day shape and time budget. Do not suggest half-day trips on office evenings.
- Use weather: outdoor if nice; indoor / covered if rain/cold/windy.
- Prefer nearby first (Oxon Hill, National Harbor, PG County, easy DC). Longer outings only on weekend-shaped days.
- Vary the mix: outdoor, food, culture, explore somewhere slightly new, recovery.
- No lectures, no money guilt, no hustle comparisons.
- Do not invent ticketed "events happening tonight" unless reasonably confident — prefer places and activities.
- Labels max ~6 words. Details max ~18 words.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            today: dateLabel,
            dayShape,
            timeBudget,
            homeBase: "Oxon Hill, MD / DMV",
            weather: weatherSummary ?? "weather unavailable — assume typical for the season",
            cashTight: Boolean(params?.cashTight),
            extraNotes: params?.notes ?? null,
          }),
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: { ideas?: Array<{ label?: string; detail?: string; timeFit?: string }> } = {};
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      parsed = {};
    }

    const ideas = (parsed.ideas ?? [])
      .filter((idea) => typeof idea.label === "string" && idea.label.trim())
      .slice(0, 6)
      .map((idea, index) => ({
        id: slugId(idea.label!.trim(), index),
        label: idea.label!.trim(),
        detail: (idea.detail ?? timeBudget).trim(),
        timeFit: (idea.timeFit ?? timeBudget).trim(),
      }));

    return {
      ideas: ideas.length > 0 ? ideas : fallbackIdeas(timeBudget, weatherSummary),
      weatherSummary,
      dayShape,
      dateLabel,
    };
  } catch (error) {
    console.error("Joy ideas LLM failed, using weather fallback:", error);
    return {
      ideas: fallbackIdeas(timeBudget, weatherSummary),
      weatherSummary,
      dayShape,
      dateLabel,
    };
  }
}
