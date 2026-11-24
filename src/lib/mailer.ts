import nodemailer from "nodemailer";

export interface SendMailOptions {
  subject: string;
  replyTo: string;
  html: string;
  text: string;
}

export interface SendMailResult {
  delivered: boolean;
  mode: "smtp" | "dev_logged";
}

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim() &&
      process.env.CONTACT_RECIPIENT_EMAIL?.trim()
  );
}

export async function sendContactEmail(
  options: SendMailOptions
): Promise<SendMailResult> {
  if (!isSmtpConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.info(
        "[ProfeKit Horarios · SMTP no configurado aún — registro local]",
        {
          subject: options.subject,
          replyTo: options.replyTo,
          text: options.text,
        }
      );
      return { delivered: true, mode: "dev_logged" };
    }

    throw new Error(
      "El servicio de correo aún no está configurado en el servidor."
    );
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const secure =
    process.env.SMTP_SECURE === "true" ||
    (process.env.SMTP_SECURE !== "false" && port === 465);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const from =
    process.env.SMTP_FROM?.trim() ||
    `ProfeKit Horarios <${process.env.SMTP_USER}>`;
  const to = process.env.CONTACT_RECIPIENT_EMAIL!.trim();

  await transporter.sendMail({
    from,
    to,
    replyTo: options.replyTo,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });

  return { delivered: true, mode: "smtp" };
}
