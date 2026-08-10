import type { NextApiRequest, NextApiResponse } from "next";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@lib/firebaseAdmin";
import {
  uidFromUnsubscribeToken,
  unsubscribeSecret,
} from "@lib/unsubscribeToken";

/**
 * Weekly parent email opt-out.
 *
 * POST is the RFC 8058 one-click target named in the `List-Unsubscribe` header,
 * and is also what the confirmation page calls. `resubscribe=true` reverses it
 * so a mistaken click is recoverable.
 *
 * The token authenticates the request on its own — a parent following a link
 * from their inbox is not signed in. Writes go through the admin SDK, so no
 * client-writable rule is needed on `users`.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = req.query.token ?? (req.body as { token?: unknown })?.token;
  const resubscribe =
    (req.body as { resubscribe?: unknown })?.resubscribe === true;

  let uid: string | null;
  try {
    uid = uidFromUnsubscribeToken(token, unsubscribeSecret());
  } catch (error) {
    console.error("Unsubscribe configuration error:", error);
    return res.status(500).json({ error: "Unsubscribe is unavailable" });
  }

  if (!uid) {
    return res.status(400).json({ error: "Invalid or expired unsubscribe link" });
  }

  try {
    const userRef = getAdminDb().collection("users").doc(uid);
    const snapshot = await userRef.get();
    if (!snapshot.exists) {
      return res.status(400).json({ error: "Invalid or expired unsubscribe link" });
    }

    await userRef.update({
      emailBlastOptOut: !resubscribe,
      emailBlastOptOutAt: resubscribe ? null : FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ ok: true, subscribed: resubscribe });
  } catch (error) {
    console.error("Unsubscribe update failed:", error);
    return res.status(500).json({ error: "Failed to update your preference" });
  }
}
