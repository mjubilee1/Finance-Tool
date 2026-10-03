import { getAppUser } from "@/lib/app-user";
import { NextResponse } from "next/server";
import { CAR_DOCUMENTS } from "@/lib/car";

export async function GET() {
  try {
    const user = await getAppUser();
    if (!user) {
      return NextResponse.json({ error: "App user is not configured." }, { status: 503 });
    }

    return NextResponse.json({
      documents: CAR_DOCUMENTS.map(({ id, title, description, subsection }) => ({
        id,
        title,
        description,
        subsection,
      })),
    });
  } catch (error) {
    console.error("Failed to list car documents:", error);
    return NextResponse.json({ error: "Failed to list documents." }, { status: 500 });
  }
}
