import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { passcode } = await req.json();
    if (!passcode) {
      return NextResponse.json({ error: "Passcode is required" }, { status: 400 });
    }

    const email = session.user.email;

    const tokenRecord = await prisma.verificationToken.findFirst({
      where: {
        identifier: email,
        token: passcode
      }
    });

    if (!tokenRecord) {
      return NextResponse.json({ error: "Invalid passcode" }, { status: 400 });
    }

    if (tokenRecord.expires < new Date()) {
      await prisma.verificationToken.delete({
        where: {
          identifier_token: {
            identifier: email,
            token: passcode
          }
        }
      });
      return NextResponse.json({ error: "Passcode expired" }, { status: 400 });
    }

    // Valid passcode, delete it so it can't be reused
    await prisma.verificationToken.delete({
      where: {
        identifier_token: {
          identifier: email,
          token: passcode
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error verifying passcode:", error);
    return NextResponse.json({ error: "Failed to verify passcode" }, { status: 500 });
  }
}
