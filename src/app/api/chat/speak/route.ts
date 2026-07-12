import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOpenAI } from "@/lib/openai";
import { getCostControlConfig } from "@/lib/env";
import { prepareSpeechText } from "@/lib/coach-speech";

const MAX_SPEECH_CHARS = 4096;

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { aiChatDailyLimit } = getCostControlConfig();
    if (aiChatDailyLimit <= 0) {
      return NextResponse.json({ error: "Read aloud is disabled." }, { status: 403 });
    }

    const body = (await req.json()) as { text?: unknown };
    const rawText = typeof body.text === "string" ? body.text : "";
    const prepared = prepareSpeechText(rawText);

    if (!prepared) {
      return NextResponse.json({ error: "Nothing to read aloud." }, { status: 400 });
    }

    const speech = await getOpenAI().audio.speech.create({
      model: "tts-1",
      voice: "nova",
      input: prepared.slice(0, MAX_SPEECH_CHARS),
    });

    const buffer = Buffer.from(await speech.arrayBuffer());

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Coach speech error:", error);
    return NextResponse.json({ error: "Failed to generate speech." }, { status: 500 });
  }
}
