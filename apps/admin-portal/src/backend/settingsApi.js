import { listDocuments, orderBy } from "./firestoreReads";
import { normalizeTerm } from "./schemas";

export function listTerms() {
  return listDocuments("terms", {
    constraints: [orderBy("year", "desc"), orderBy("termNum", "desc")],
    normalize: normalizeTerm,
  });
}
