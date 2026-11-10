// RES-104. What differs between the five kinds of record on the Question bank
// page: their tabs, filters, list text and editable fields. The page and the
// drawer stay generic and read everything from here.

export function humanise(value) {
  if (value === null || value === undefined || value === "") return "";
  const words = String(value).replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Maths text is stored with LaTeX dollar signs; the page has no maths renderer, so show it without them. */
export function readable(text) {
  return String(text || "").replace(/\$([^$\n]+)\$/g, "$1");
}

const choicesOf = (values) => (values || []).map((value) => ({ value, label: humanise(value) }));
const YEARS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((year) => ({ value: year, label: `Year ${year}` }));
const LENGTHS = [
  { value: "short", label: "Short (under 300 words)" },
  { value: "medium", label: "Medium (300–799 words)" },
  { value: "long", label: "Long (800+ words)" },
];
const yearFilter = { key: "year", label: "Year", kind: "select", choices: () => YEARS, numeric: true };
const difficultyFilter = { key: "difficulty", label: "Difficulty", kind: "select", choices: (o) => choicesOf(o.difficulties) };
const difficultyField = { key: "difficulty", label: "Difficulty", kind: "select", choices: (o) => choicesOf(o.difficulties), nullable: true };
const fileName = (path) => String(path || "").split("/").pop();

export function sourceLine(record) {
  return [fileName(record.sourcePath), record.pageNumber ? `p${record.pageNumber}` : "", record.label || ""].filter(Boolean).join(" · ");
}

export const BANKS = [
  {
    id: "maths",
    label: "Maths questions",
    singular: "Maths question",
    noun: ["question", "questions"],
    flaggable: true,
    images: true,
    filters: [
      yearFilter,
      { key: "diagramType", label: "Diagram type", kind: "select", choices: (o) => choicesOf(Object.keys(o.diagramTypes || {})) },
      { key: "skill", label: "Skill", kind: "select", dependsOn: "diagramType", emptyLabel: "Choose a type first", choices: (o, f) => choicesOf(o.diagramTypes?.[f.diagramType]) },
      difficultyFilter,
    ],
    title: (r) => readable(r.preview) || r.topic || "Diagram question",
    chips: (r) => [r.yearLevel, humanise(r.skill || r.diagramType), humanise(r.difficulty)],
    fields: [
      { key: "stem", label: "Shared stem", kind: "textarea", rows: 2, nullable: true },
      { key: "text", label: "Question text (as printed)", kind: "textarea", rows: 4 },
      { key: "topic", label: "Topic", kind: "text" },
      { key: "yearLevel", label: "Year level", kind: "text", nullable: true },
      { key: "difficulty", label: "Difficulty", kind: "select", choices: (o) => choicesOf(o.difficulties) },
      { key: "diagramType", label: "Diagram type", kind: "select", choices: (o) => choicesOf(Object.keys(o.diagramTypes || {})), resets: ["skill"] },
      { key: "skill", label: "Skill", kind: "select", dependsOn: "diagramType", choices: (o, f) => choicesOf(o.diagramTypes?.[f.diagramType]) },
    ],
  },
  {
    id: "stimuli",
    label: "Stimuli",
    singular: "English stimulus",
    noun: ["stimulus", "stimuli"],
    images: true,
    filters: [
      yearFilter,
      { key: "type", label: "Text type", kind: "select", choices: (o) => choicesOf(o.stimulusTypes) },
      { key: "technique", label: "Technique", kind: "select", choices: (o) => choicesOf(o.techniques) },
      { key: "length", label: "Length", kind: "select", choices: () => LENGTHS },
      { key: "theme", label: "Theme", kind: "search", placeholder: "e.g. identity" },
    ],
    title: (r) => r.title || r.label || r.preview || "Untitled stimulus",
    subtitle: (r) => (r.title || r.label ? r.preview : ""),
    chips: (r) => [r.yearLevel, humanise(r.type), r.medium === "written" && r.wordCount ? `${r.wordCount.toLocaleString()} words` : ""],
    fields: [
      { key: "title", label: "Title", kind: "text", nullable: true },
      { key: "author", label: "Author", kind: "text", nullable: true },
      { key: "publication", label: "Publication", kind: "text", nullable: true },
      { key: "text", label: "Text", kind: "textarea", rows: 10, nullable: true, when: (r) => r.medium === "written" },
      { key: "visualDescription", label: "Description of the image", kind: "textarea", rows: 3, nullable: true, when: (r) => r.medium === "visual" },
      { key: "type", label: "Text type", kind: "select", choices: (o, _f, r) => choicesOf((o.stimulusTypes || []).filter((type) => (r.medium === "visual") === VISUAL_TYPES.has(type))) },
      { key: "yearLevel", label: "Year level", kind: "text", nullable: true },
      difficultyField,
      { key: "themes", label: "Themes", kind: "list", hint: "Separate themes with commas." },
    ],
  },
  {
    id: "englishQuestions",
    label: "English questions",
    singular: "English question",
    noun: ["question", "questions"],
    filters: [
      { key: "questionType", label: "Question type", kind: "select", choices: (o) => choicesOf(o.questionTypes) },
      { key: "skill", label: "Skill", kind: "select", choices: (o) => choicesOf(o.englishSkills) },
      { key: "technique", label: "Technique", kind: "select", choices: (o) => choicesOf(o.techniques) },
      difficultyFilter,
    ],
    title: (r) => r.preview || r.label || "Question",
    chips: (r) => [humanise(r.questionType), humanise(r.skill), Number.isInteger(r.marks) ? `${r.marks} marks` : ""],
    fields: [
      { key: "text", label: "Question text", kind: "textarea", rows: 5 },
      { key: "marks", label: "Marks", kind: "number", nullable: true },
      { key: "questionType", label: "Question type", kind: "select", choices: (o) => choicesOf(o.questionTypes) },
      { key: "skill", label: "Skill", kind: "select", choices: (o) => choicesOf(o.englishSkills) },
      difficultyField,
      { key: "techniques", label: "Techniques", kind: "chips", choices: (o) => choicesOf(o.techniques) },
    ],
  },
  {
    id: "guides",
    label: "Marking guides",
    singular: "Marking guide entry",
    noun: ["guide entry", "guide entries"],
    filters: [],
    title: (r) => r.preview || "Marking guide entry",
    chips: (r) => [Number.isInteger(r.marks) ? `${r.marks} marks` : ""],
    fields: [
      { key: "criteria", label: "Marking criteria", kind: "textarea", rows: 6, nullable: true },
      { key: "sampleAnswer", label: "Sample answer", kind: "textarea", rows: 8, nullable: true },
      { key: "marks", label: "Marks", kind: "number", nullable: true },
    ],
  },
  {
    id: "setTexts",
    label: "Set texts",
    singular: "Set text",
    noun: ["set text", "set texts"],
    filters: [{ key: "form", label: "Form", kind: "select", choices: (o) => choicesOf(o.setTextForms) }],
    title: (r) => r.title || "Untitled set text",
    subtitle: (r) => r.preview,
    chips: (r) => [r.author, humanise(r.form)],
    fields: [
      { key: "title", label: "Title", kind: "text" },
      { key: "author", label: "Author", kind: "text", nullable: true },
      { key: "form", label: "Form", kind: "select", choices: (o) => choicesOf(o.setTextForms) },
      { key: "summary", label: "Summary", kind: "textarea", rows: 8 },
      { key: "context", label: "Context", kind: "textarea", rows: 5, nullable: true },
    ],
  },
];

// Mirrors the backend's stimulus taxonomy, so the edit form only offers types
// of the stimulus's own medium.
const VISUAL_TYPES = new Set(["poster", "advertisement", "cartoon", "photograph", "infographic", "cover", "artwork", "other_visual"]);

export function bankById(id) {
  return BANKS.find((bank) => bank.id === id) || BANKS[0];
}

export function statusesFor(bank, openFlags) {
  return [
    { value: "live", label: "Live" },
    { value: "hidden", label: "Hidden" },
    ...(bank.flaggable ? [{ value: "flagged", label: "Flagged", count: openFlags }] : []),
    { value: "all", label: "All" },
  ];
}

/** Whether a record still belongs in the list after a change. */
export function matchesStatus(status, record) {
  if (status === "all") return record.status === "live" || record.status === "hidden";
  if (status === "flagged") return record.openFlags > 0;
  return record.status === status;
}

/** The fields whose values differ from the record, as the backend wants them. */
export function changedFields(fields, record, draft) {
  const updates = {};
  for (const field of fields) {
    const before = record[field.key];
    let after = draft[field.key];
    if (field.kind === "list") {
      after = String(after || "").split(",").map((entry) => entry.trim()).filter(Boolean);
      if (JSON.stringify(after) !== JSON.stringify(before || [])) updates[field.key] = after;
      continue;
    }
    if (field.kind === "chips") {
      if (JSON.stringify([...(after || [])].sort()) !== JSON.stringify([...(before || [])].sort())) updates[field.key] = after || [];
      continue;
    }
    if (field.kind === "number") {
      after = after === "" || after === null || after === undefined ? null : Number(after);
    } else if (typeof after === "string") {
      after = after.trim();
      if (!after && field.nullable) after = null;
    }
    if ((before ?? null) !== (after ?? null) && !(before === undefined && after === "")) updates[field.key] = after ?? null;
  }
  return updates;
}

/** Starting values for the edit form. */
export function draftOf(fields, record) {
  return Object.fromEntries(fields.map((field) => {
    const value = record[field.key];
    if (field.kind === "list") return [field.key, (value || []).join(", ")];
    if (field.kind === "chips") return [field.key, value || []];
    return [field.key, value ?? ""];
  }));
}
