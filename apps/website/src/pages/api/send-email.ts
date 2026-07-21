import sendgrid from "@sendgrid/mail";
import type { NextApiRequest, NextApiResponse } from "next";

type EnquiryPayload = {
  reason?: string;
  name?: string;
  email?: string;
  phoneNumber?: string;
  additionalInfo?: string;
};

const isEmail = (value: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);

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

  const { reason, name, email, phoneNumber, additionalInfo } =
    req.body as EnquiryPayload;
  const trimmed = {
    reason: reason?.trim() || "Enquiry Request",
    name: name?.trim() ?? "",
    email: email?.trim() ?? "",
    phoneNumber: phoneNumber?.trim() ?? "",
    additionalInfo: additionalInfo?.trim() ?? "",
  };

  if (!trimmed.name || !trimmed.phoneNumber || !isEmail(trimmed.email)) {
    return res.status(400).json({ error: "Invalid enquiry payload" });
  }

  const apiKey = process.env.SENDGRID_API_KEY;
  const to = process.env.RECIEVER_EMAIL;
  const from = process.env.SENDER_EMAIL;
  if (!apiKey || !to || !from) {
    console.error("Missing SendGrid configuration for enquiry email.");
    return res.status(500).json({ error: "Email is not configured" });
  }

  sendgrid.setApiKey(apiKey);

  try {
    await sendgrid.send({
      to,
      from,
      subject: `New Tenacity enquiry: ${trimmed.reason}`,
      html: `
        <!doctype html>
        <html lang="en">
          <body style="font-family:Arial,sans-serif;background:#f4f5f6;margin:0;padding:24px;">
            <main style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #eaebed;border-radius:16px;padding:24px;">
              <h1 style="color:#112d4f;font-size:24px;margin:0 0 16px;">New Tenacity enquiry</h1>
              <p><strong>Reason:</strong> ${escapeHtml(trimmed.reason)}</p>
              <p><strong>Name:</strong> ${escapeHtml(trimmed.name)}</p>
              <p><strong>Email:</strong> ${escapeHtml(trimmed.email)}</p>
              <p><strong>Phone:</strong> ${escapeHtml(trimmed.phoneNumber)}</p>
              <p><strong>Message:</strong></p>
              <p style="white-space:pre-wrap;">${escapeHtml(
                trimmed.additionalInfo || "-"
              )}</p>
            </main>
          </body>
        </html>
      `,
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("SendGrid enquiry email failed:", error);
    return res.status(502).json({ error: "Failed to send enquiry" });
  }
}
