import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail(options: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string;
}) {
  const from = options.from || process.env.RESEND_FROM || "Wegen <noreply@resend.dev>";
  return resend.emails.send({
    from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  } as any);
} 