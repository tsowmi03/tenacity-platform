import { callFunction } from "./callable";
import { listDocuments, orderBy } from "./firestoreReads";
import { normalizeTerm } from "./schemas";

export function listTerms() {
  return listDocuments("terms", {
    constraints: [orderBy("year", "desc"), orderBy("termNum", "desc")],
    normalize: normalizeTerm,
  });
}

export function createTermsForYear(year, terms) {
  return callFunction("adminCreateTermsForYear", { year, terms });
}

export function updateTerm(termId, updates) {
  return callFunction("adminUpdateTerm", { termId, updates });
}
