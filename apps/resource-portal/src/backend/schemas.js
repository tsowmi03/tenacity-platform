import { timestampToIso } from "./firestoreReads";

// The resource portal reads one collection: students, for the job builder's
// picker. This is deliberately not a copy of the admin portal's schemas module —
// only the shape the resource surface actually consumes lives here.
function fullName(firstName, lastName) {
  return `${String(firstName || "").trim()} ${String(lastName || "").trim()}`.trim();
}

export function normalizeStudent(id, data = {}) {
  return {
    id,
    ...data,
    displayName: fullName(data.firstName, data.lastName) || id,
    createdAtIso: timestampToIso(data.createdAt),
    updatedAtIso: timestampToIso(data.updatedAt),
  };
}
