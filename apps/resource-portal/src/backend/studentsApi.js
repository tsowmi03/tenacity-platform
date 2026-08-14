import { listDocuments, orderBy } from "./firestoreReads";
import { normalizeStudent } from "./schemas";

// Read-only. Student mutations are an admin-portal concern and no resource
// portal screen offers them, so the callable wrappers are not carried over.
export function listStudents() {
  return listDocuments("students", {
    constraints: [orderBy("lastName", "asc")],
    normalize: normalizeStudent,
  });
}
