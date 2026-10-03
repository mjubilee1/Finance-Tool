import { NextRequest, NextResponse } from "next/server";
import { getAppUser } from "@/lib/app-user";
import {
  disconnectGoogleDrive,
  getGoogleDriveStatus,
  listRecentGoogleDriveFiles,
  readGoogleDriveFileContent,
  searchGoogleDriveFiles,
} from "@/lib/google-drive";

export async function GET(request: NextRequest) {
  const user = await getAppUser();
  if (!user) {
    return NextResponse.json({ error: "App user is not configured." }, { status: 503 });
  }

  const fileId = request.nextUrl.searchParams.get("fileId")?.trim();
  const q = request.nextUrl.searchParams.get("q")?.trim();

  try {
    if (fileId) {
      const result = await readGoogleDriveFileContent(user.id, fileId);
      return NextResponse.json({
        ...(await getGoogleDriveStatus(user.id)),
        ...result,
      });
    }

    if (q) {
      const result = await searchGoogleDriveFiles(user.id, q, { maxResults: 20 });
      return NextResponse.json(result);
    }

    const result = await listRecentGoogleDriveFiles(user.id, { maxResults: 12 });
    return NextResponse.json(result);
  } catch (error) {
    const status = await getGoogleDriveStatus(user.id);
    return NextResponse.json({
      ...status,
      files: [],
      error: error instanceof Error ? error.message : "Could not load Google Drive.",
    });
  }
}

export async function DELETE() {
  const user = await getAppUser();
  if (!user) {
    return NextResponse.json({ error: "App user is not configured." }, { status: 503 });
  }

  await disconnectGoogleDrive(user.id);
  return NextResponse.json({ connected: false, status: "not_connected" });
}
