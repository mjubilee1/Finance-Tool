import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { openai } from "@/lib/openai";
import { getCostControlConfig } from "@/lib/env";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const audio = formData.get("audio");

    if (!(audio instanceof Blob) || audio.size === 0) {
      return NextResponse.json({ error: "No audio recording found." }, { status: 400 });
    }

    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: "Recording is too long. Keep it under about a minute." }, { status: 400 });
    }

    const { aiChatDailyLimit } = getCostControlConfig();
    if (aiChatDailyLimit <= 0) {
      return NextResponse.json({ error: "Voice input is disabled." }, { status: 403 });
    }

    const extension = audio.type.includes("mp4")
      ? "mp4"
      : audio.type.includes("mpeg")
        ? "mp3"
        : audio.type.includes("wav")
          ? "wav"
          : "webm";

    const file = new File([audio], `voice.${extension}`, { type: audio.type || "audio/webm" });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "en",
    });

    const text = transcription.text?.trim();
    if (!text) {
      return NextResponse.json({ error: "Could not hear anything. Try again closer to the mic." }, { status: 400 });
    }

    return NextResponse.json({ text });
  } catch (error) {
    console.error("Voice transcription error:", error);
    return NextResponse.json({ error: "Failed to transcribe voice message." }, { status: 500 });
  }
}
