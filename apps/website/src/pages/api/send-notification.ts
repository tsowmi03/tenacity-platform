import type { NextApiRequest, NextApiResponse } from "next";
import { sendAdminNotification } from "@lib/adminNotification";

type NotificationPayload = {
  details?: string[];
  subject?: unknown;
};

const DEFAULT_SUBJECT = "New Tenacity student registration";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { details, subject } = req.body as NotificationPayload;
  if (!Array.isArray(details)) {
    return res.status(400).json({ error: "Invalid notification payload" });
  }

  const cleanSubject =
    typeof subject === "string" && subject.trim()
      ? subject.trim().slice(0, 150)
      : DEFAULT_SUBJECT;

  try {
    const sent = await sendAdminNotification({
      subject: cleanSubject,
      heading: cleanSubject,
      intro: "Please check the dashboard for the complete record.",
      details,
    });

    if (!sent) {
      return res.status(500).json({ error: "Email is not configured" });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("SendGrid registration email failed:", error);
    return res.status(502).json({ error: "Failed to send notification" });
  }
}
