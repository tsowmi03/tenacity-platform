import { listDocuments, orderBy } from "./firestoreReads";
import { serverTimestamp, updateDocument } from "./firestoreWrites";
import { normalizeParentSurveyResponse } from "./schemas";

const COLLECTION = "parentSurveyResponses";

/**
 * Parent feedback survey responses, newest first.
 *
 * The whole collection is fetched and aggregated in the page. A feedback round
 * produces at most a few hundred rows, and every headline figure depends on all
 * of them, so paging the read would only mean paging the summary too.
 */
export async function listParentSurveyResponses() {
  return listDocuments(COLLECTION, {
    constraints: [orderBy("createdAt", "desc")],
    normalize: normalizeParentSurveyResponse,
  });
}

/**
 * Archives or restores a response.
 *
 * Archiving is for test submissions and duplicates - it takes the row out of
 * the summary without deleting what a parent wrote.
 */
export function setParentSurveyResponseArchived(responseId, archived) {
  return updateDocument(COLLECTION, responseId, {
    archived: archived === true,
    statusUpdatedAt: serverTimestamp(),
  });
}
