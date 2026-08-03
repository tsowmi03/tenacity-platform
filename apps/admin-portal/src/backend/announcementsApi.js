import { getDocument, listDocuments, orderBy } from "./firestoreReads";
import { normalizeAnnouncement } from "./schemas";

export function listAnnouncements() {
  return listDocuments("announcements", {
    constraints: [orderBy("createdAt", "desc")],
    normalize: normalizeAnnouncement,
  });
}

export function getAnnouncement(announcementId) {
  return getDocument("announcements", announcementId, {
    normalize: normalizeAnnouncement,
  });
}
