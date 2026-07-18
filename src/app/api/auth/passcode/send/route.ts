import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getResend } from "@/lib/resend";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.RESEND_API_KEY?.trim()) {
      return NextResponse.json({ error: "Email sending is not configured." }, { status: 503 });
    }

    const email = session.user.email;

    // Generate a 6-digit passcode
    const passcode = Math.floor(100000 + Math.random() * 900000).toString();

    // Set expiration to 10 minutes from now
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    // Save to database
    // Delete any existing token for this email first to avoid unique constraint issues if we just want one active
    await prisma.verificationToken.deleteMany({
      where: { identifier: email },
    });

    await prisma.verificationToken.create({
      data: {
        identifier: email,
        token: passcode,
        expires,
      },
    });

    // Send email
    const { error } = await getResend().emails.send({
      from: "Financial Coach <onboarding@resend.dev>", // Using Resend's default testing domain
      to: email,
      subject: "Your App Passcode",
      html: `<p>Your passcode to unlock the app is: <strong>${passcode}</strong></p><p>This code expires in 10 minutes.</p>`,
    });

    if (error) {
      console.error("Resend error:", error);
      return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Error sending passcode:", error);
    return NextResponse.json({ error: "Failed to send passcode" }, { status: 500 });
  }
}
