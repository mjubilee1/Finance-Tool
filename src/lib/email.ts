import { getResend } from "@/lib/resend";

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

export const sendEmail = async (data: EmailPayload) => {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set, skipping email send.");
    return;
  }

  try {
    const dataToSend = {
      from: process.env.EMAIL_FROM || "onboarding@resend.dev",
      to: data.to,
      subject: data.subject,
      html: data.html,
    };

    const result = await getResend().emails.send(dataToSend);
    return result;
  } catch (error) {
    console.error("Failed to send email:", error);
    throw error;
  }
};

export const sendNotification = async (subject: string, message: string) => {
  return sendEmail({
    to: "mjubil96@gmail.com",
    subject,
    html: `<p>${message}</p>`,
  });
};
