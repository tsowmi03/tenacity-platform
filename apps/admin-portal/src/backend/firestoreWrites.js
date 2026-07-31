import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { BackendError } from "./callable";
import { assertFirestoreConfigured } from "./firestoreReads";

export { serverTimestamp };

/**
 * Direct client-side document update, for collections whose Firestore rules
 * already restrict both the caller and the writable fields.
 *
 * Most portal mutations go through callable Cloud Functions instead - prefer
 * those when a write needs server-side logic, validation beyond what rules can
 * express, or an audit-log entry.
 */
export async function updateDocument(collectionPath, id, updates) {
  assertFirestoreConfigured();
  if (!id) {
    throw new BackendError({
      code: "invalid-argument",
      message: "Document id is required.",
    });
  }
  await updateDoc(doc(db, collectionPath, id), updates);
  return { id, ...updates };
}
