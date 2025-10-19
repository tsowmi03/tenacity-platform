// /api/send-email.js

import sendgrid from "@sendgrid/mail";

sendgrid.setApiKey(process.env.SENDGRID_API_KEY!);

import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { details } = req.body;

  const msg = getTemplateNotification(details);
  await sendgrid
    .send(msg)
    .then((result) => {
      console.log(result);
      res.status(200).json({ message: result });
    })
    .catch((error) => {
      console.log(error);
      res.status(500).json({ error: error });
    });
}

const getTemplateNotification = (details: string[]) => {
  const title = "New Student Registration Alert!";
  const subject = "Hey There! A New Student Has Registered";
  const to = process.env.RECIEVER_EMAIL;
  const from = process.env.SENDER_EMAIL;

  return {
    to: to as string,
    from: from as string,
    subject: subject,
    html: `
    <!DOCTYPE html>
    <html>
      <body>
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>${title}</h2>
          <p>Exciting news! A new student has registered for one of your courses.</p>
          <p>Please check your dashboard for the complete registration details.</p>
          <p>Here are the details:</p>
          <ul>
            ${details.map((detail) => `<li>${detail}</li>`).join("")}
          </ul>
          <p>Make sure to follow up with them soon!</p>
        </div>
      </body>
    </html>
    `,
  };
};
