import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { CAR_DOCUMENTS } from "@/lib/car";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
