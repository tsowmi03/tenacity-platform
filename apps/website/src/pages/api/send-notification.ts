import sendgrid from "@sendgrid/mail";
import type { NextApiRequest, NextApiResponse } from "next";

type NotificationPayload = {
  details?: string[];
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { details } = req.body as NotificationPayload;
  if (!Array.isArray(details)) {
    return res.status(400).json({ error: "Invalid notification payload" });
  }

  const apiKey = process.env.SENDGRID_API_KEY;
  const to = process.env.RECIEVER_EMAIL;
  const from = process.env.SENDER_EMAIL;
  if (!apiKey || !to || !from) {
    console.error("Missing SendGrid configuration for registration email.");
    return res.status(500).json({ error: "Email is not configured" });
  }

  sendgrid.setApiKey(apiKey);

  try {
    await sendgrid.send({
      to,
      from,
      subject: "New Tenacity student registration",
      html: `
        <!doctype html>
        <html lang="en">
          <body style="font-family:Arial,sans-serif;background:#f4f5f6;margin:0;padding:24px;">
            <main style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #eaebed;border-radius:16px;padding:24px;">
              <h1 style="color:#112d4f;font-size:24px;margin:0 0 16px;">New student registration</h1>
              <p>Please check the dashboard for the complete registration record.</p>
              <ul>
                ${details
                  .map((detail) => `<li>${escapeHtml(String(detail))}</li>`)
                  .join("")}
              </ul>
            </main>
          </body>
        </html>
      `,
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("SendGrid registration email failed:", error);
    return res.status(502).json({ error: "Failed to send notification" });
  }
}
