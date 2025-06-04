import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

const db = admin.firestore();

export const linkUsers = onRequest(
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");

    if (req.method === "OPTIONS") {
      res.status(200).send("");
      return;
    }

    const DRY_RUN = req.query.dryRun !== "false"; // ?dryRun=false to actually write
    const BATCH_LIMIT = req.query.limit ? parseInt(req.query.limit as string, 10) : Infinity;

    let processed = 0;
    try {
      const usersSnap = await db.collection("users").get();
      for (const doc of usersSnap.docs) {
        if (processed >= BATCH_LIMIT) break;

        const userData = doc.data();
        const email = userData.email;
        if (!email) {
          logger.info(`Skipping user doc ${doc.id} (no email)`);
          continue;
        }

        logger.info(`Firestore: "${email}" | Normalized: "${email.toLowerCase().trim()}"`);

        let authUser;
        try {
          authUser = await admin.auth().getUserByEmail(email.toLowerCase().trim());
        } catch (err) {
          logger.error(`❌ No Auth user for Firestore user ${doc.id} (${email})`);
          continue;
        }

        if (doc.id === authUser.uid) {
          // Already linked
          continue;
        }

        // Copy data to new doc with Auth UID as ID
        if (DRY_RUN) {
          logger.info(`[DRY RUN] Would copy user ${email} from ${doc.id} → ${authUser.uid}`);
        } else {
          await db.collection("users").doc(authUser.uid).set(userData, { merge: true });
          logger.info(`✅ Copied user ${email} to new doc ID ${authUser.uid}`);
        }

        // Update all students' parents arrays
        const studentsSnap = await db.collection("students")
          .where("parents", "array-contains", doc.id)
          .get();
        for (const studentDoc of studentsSnap.docs) {
          if (DRY_RUN) {
            logger.info(`[DRY RUN] Would update student ${studentDoc.id}: parents ${doc.id} → ${authUser.uid}`);
          } else {
            await studentDoc.ref.update({
              parents: admin.firestore.FieldValue.arrayRemove(doc.id),
            });
            await studentDoc.ref.update({
              parents: admin.firestore.FieldValue.arrayUnion(authUser.uid),
            });
            logger.info(`   ↳ Updated student ${studentDoc.id} parent ref`);
          }
        }

        // Delete old doc
        if (DRY_RUN) {
          logger.info(`[DRY RUN] Would delete old user doc ${doc.id}`);
        } else {
          await doc.ref.delete();
          logger.info(`🗑️ Deleted old user doc ${doc.id}`);
        }

        processed++;
      }
      res.status(200).send(`🎉 Done! (Processed ${processed} users, DRY_RUN=${DRY_RUN})`);
    } catch (err) {
      logger.error("Error linking users:", err);
      res.status(500).send("Failed to link users");
    }
  }
);