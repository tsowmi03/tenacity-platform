import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { sendWaitlistJoinedAdminNotification } from "./shared";

export const onWaitlistEntryCreatedNotifyAdmins = onDocumentCreated(
  "waitlistEntries/{waitlistEntryId}",
  async (event) => {
    const waitlistEntry = event.data?.data();
    if (!waitlistEntry) return;

    await sendWaitlistJoinedAdminNotification(
      event.params.waitlistEntryId,
      waitlistEntry,
    );
  }
);

export const onWaitlistEntryReactivatedNotifyAdmins = onDocumentUpdated(
  "waitlistEntries/{waitlistEntryId}",
  async (event) => {
    if (!event.data?.before || !event.data?.after) return;

    const before = event.data.before.data();
    const after = event.data.after.data();
    if (before.status === "active" || after.status !== "active") return;

    await sendWaitlistJoinedAdminNotification(
      event.params.waitlistEntryId,
      after,
    );
  }
);
