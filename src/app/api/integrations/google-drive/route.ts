import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  disconnectGoogleDrive,
  getGoogleDriveStatus,
  listRecentGoogleDriveFiles,
  readGoogleDriveFileContent,
  searchGoogleDriveFiles,
} from "@/lib/google-drive";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fileId = request.nextUrl.searchParams.get("fileId")?.trim();
  const q = request.nextUrl.searchParams.get("q")?.trim();

  try {
    if (fileId) {
      const result = await readGoogleDriveFileContent(session.user.id, fileId);
      return NextResponse.json({
        ...(await getGoogleDriveStatus(session.user.id)),
        ...result,
      });
    }

    if (q) {
      const result = await searchGoogleDriveFiles(session.user.id, q, { maxResults: 20 });
      return NextResponse.json(result);
    }

    const result = await listRecentGoogleDriveFiles(session.user.id, { maxResults: 12 });
    return NextResponse.json(result);
  } catch (error) {
    const status = await getGoogleDriveStatus(session.user.id);
    return NextResponse.json({
      ...status,
      files: [],
      error: error instanceof Error ? error.message : "Could not load Google Drive.",
    });
  }
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await disconnectGoogleDrive(session.user.id);
  return NextResponse.json({ connected: false, status: "not_connected" });
}
