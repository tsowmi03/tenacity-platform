import sendgrid from "@sendgrid/mail";
import type { NextApiRequest, NextApiResponse } from "next";
import { sendGridConfig } from "@lib/adminNotification";
import { requestIp, verifyTurnstile } from "@lib/turnstile";

type EnquiryPayload = {
  reason?: string;
  name?: string;
  email?: string;
  phoneNumber?: string;
  additionalInfo?: string;
  website?: unknown;
  turnstileToken?: unknown;
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

  const body = (req.body ?? {}) as EnquiryPayload;
  const { reason, name, email, phoneNumber, additionalInfo, turnstileToken } =
    body;

  // A hidden field a person never sees. Return success so a bot does not
  // learn which part of its payload caused the rejection. Blocked logs never
  // include what was submitted.
  if (typeof body.website === "string" && body.website.trim()) {
    console.warn("Enquiry blocked: honeypot field filled.");
    return res.status(200).json({ ok: true });
  }

  // The honeypot only catches bots that fill in the rendered form. A script
  // posting straight to this route needs a real check.
  if (typeof turnstileToken !== "string" || !turnstileToken.trim()) {
    console.warn("Enquiry blocked: no verification token.");
    return res.status(403).json({ error: "Human verification required" });
  }

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

  const { apiKey, to, from, missing } = sendGridConfig();
  if (missing.length) {
    console.error(`Missing SendGrid configuration for enquiry email: ${missing.join(", ")}`);
    return res.status(500).json({ error: "Email is not configured" });
  }

  try {
    const verified = await verifyTurnstile(turnstileToken, requestIp(req));
    if (!verified) {
      console.warn("Enquiry blocked: verification failed.");
      return res.status(403).json({ error: "Human verification failed" });
    }
  } catch (error) {
    console.error("Turnstile verification failed for enquiry:", error);
    return res.status(500).json({ error: "Failed to send enquiry" });
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
