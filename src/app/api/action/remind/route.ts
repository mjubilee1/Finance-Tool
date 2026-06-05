import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { merchant, amount, frequency } = body;

    const yearlySavings = (amount * (frequency === 'monthly' ? 12 : frequency === 'weekly' ? 52 : 1)).toFixed(2);

    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #18181b;">
        <h2 style="color: #059669;">Action Required: Subscription Review</h2>
        <p>Hi ${session.user.name || "there"},</p>
        <p>This is your reminder from the <strong>Daily Financial Coach</strong> to review and potentially cancel your <strong>${merchant}</strong> subscription.</p>
        
        <div style="background-color: #f4f4f5; padding: 16px; border-radius: 8px; margin: 24px 0;">
          <p style="margin: 0;"><strong>Merchant:</strong> ${merchant}</p>
          <p style="margin: 8px 0 0 0;"><strong>Current Cost:</strong> $${amount} / ${frequency}</p>
        </div>

        <p style="font-size: 18px; font-weight: bold;">
          💰 Taking 5 minutes to cancel this today could save you <span style="color: #059669;">$${yearlySavings}</span> this year!
        </p>

        <p>Stay wealthy,<br/>Your AI Coach</p>
      </div>
    `;

    await resend.emails.send({
      from: "Coach <onboarding@resend.dev>", 
      to: "mjubil96@gmail.com", // Resend free tier requires sending to verified email
      subject: `Cancel ${merchant} to save $${yearlySavings} this year`,
      html: emailHtml,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to send reminder:", error);
    return NextResponse.json({ error: "Failed to send reminder." }, { status: 500 });
  }
}
