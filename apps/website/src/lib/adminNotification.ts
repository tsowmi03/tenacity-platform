import sendgrid from "@sendgrid/mail";

export type AdminNotification = {
  subject: string;
  heading: string;
  intro: string;
  details: string[];
};

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const SENDGRID_ENV = ["SENDGRID_API_KEY", "SENDER_EMAIL", "RECIEVER_EMAIL"] as const;

/**
 * The SendGrid settings, and the names of any that are unset. Only names are
 * ever logged, never values, so a missing one is quick to find (WEB-13: the
 * contact form failed for a month on a missing Vercel variable).
 */
export const sendGridConfig = (env: Record<string, string | undefined> = process.env) => ({
  apiKey: env.SENDGRID_API_KEY ?? "",
  from: env.SENDER_EMAIL ?? "",
  to: env.RECIEVER_EMAIL ?? "",
  missing: SENDGRID_ENV.filter((name) => !env[name]?.trim()),
});

/**
 * Sends an internal notification to the Tenacity inbox.
 * Returns false when SendGrid is not configured so callers can decide whether a
 * missing email is fatal; throws only when SendGrid itself rejects the send.
 */
export const sendAdminNotification = async ({
  subject,
  heading,
  intro,
  details,
}: AdminNotification) => {
  const { apiKey, to, from, missing } = sendGridConfig();
  if (missing.length) {
    console.error(`Missing SendGrid configuration for admin notification: ${missing.join(", ")}`);
    return false;
  }

  sendgrid.setApiKey(apiKey);

  await sendgrid.send({
    to,
    from,
    subject,
    html: `
        <!doctype html>
        <html lang="en">
          <body style="font-family:Arial,sans-serif;background:#f4f5f6;margin:0;padding:24px;">
            <main style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #eaebed;border-radius:16px;padding:24px;">
              <h1 style="color:#112d4f;font-size:24px;margin:0 0 16px;">${escapeHtml(
                heading
              )}</h1>
              <p>${escapeHtml(intro)}</p>
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

  return true;
};
