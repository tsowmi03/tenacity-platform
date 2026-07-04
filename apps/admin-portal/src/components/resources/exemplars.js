import manifest from "./exemplarManifest.json";

// Committed sample PDFs (public/resource-exemplars) rendered by
// backend/functions/scripts/renderResourceExemplars.js from the same DOCX
// builders as real generations. Exact subject match first; otherwise fall
// back to the other subject's exemplar of the same type — the preview is
// about format and layout, which the types share across subjects.
export function exemplarForType(subject, resourceType) {
  const exact = manifest.find(
    (entry) => entry.resourceType === resourceType && entry.subject === subject
  );
  const entry = exact || manifest.find((item) => item.resourceType === resourceType);
  if (!entry) return null;
  return {
    url: `/resource-exemplars/${entry.file}`,
    subject: entry.subject,
    exactSubject: Boolean(exact),
  };
}
