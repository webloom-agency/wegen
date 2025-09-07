import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail(options: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string;
}) {
  const from =
    options.from ||
    process.env.RESEND_FROM ||
    // Use Resend's onboarding sender by default for better deliverability without domain setup
    "Wegen <onboarding@resend.dev>";
  try {
    return await resend.emails.send({
      from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    } as any);
  } catch (err) {
    // Soft-fail with structured error for server logs/observability
    return {
      error: {
        name: (err as any)?.name || "RESEND_ERROR",
        message: (err as any)?.message || String(err),
      },
    } as any;
  }
} 