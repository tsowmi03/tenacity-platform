// Sample resource jobs for the preview. Names and details are made up.
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
const base = (id, extra) => ({
  id, jobId: id, createdBy: "preview-user", createdByName: "Sample Admin", warnings: [], uploadedFiles: [], modelChoice: "auto",
  answerMode: "worked", showMarks: false, runId: `run-${id}`, ...extra,
});

export const jobs = [
  base("job-generating", {
    status: "processing", studentId: "student-1", studentName: "Ava Nguyen", subject: "maths", year: 9, resourceType: "worksheet",
    customPrompt: "20 questions on Pythagoras' theorem and right-angled trigonometry, getting harder, with worded problems at the end.",
    createdAtIso: minutesAgo(3),
    progress: { runId: "run-job-generating", phase: "write", fraction: 0.46, remainingMs: 190_000, lowMs: 150_000, highMs: 260_000, questionsDone: 10, questionCount: 20,
      diagramsDone: 0, diagramCount: 0, message: "Writing questions 11–20 of 20", updatedAt: new Date().toISOString() },
  }),
  base("job-queued", {
    status: "pending", studentId: "student-2", studentName: "Liam O'Connor", subject: "english", year: 10, resourceType: "practice-paper",
    customPrompt: "A reading paper on unseen texts about belonging, 45 minutes.", createdAtIso: minutesAgo(1),
  }),
  base("job-ready", {
    history: true, status: "complete", reviewStatus: "passed", studentId: "student-1", studentName: "Ava Nguyen", subject: "maths", year: 9, resourceType: "topic-booklet",
    customPrompt: "A booklet on linear relationships: gradient, intercepts and graphing.", createdAtIso: minutesAgo(95), completedAtIso: minutesAgo(84),
    outputPath: "preview/booklet.docx", outputFileName: "Topic Booklet - Ava Nguyen - Year 9 Maths - Linear relationships.docx", previewPath: "preview/booklet.pdf",
    extractedTopics: ["Gradient", "Intercepts", "Graphing lines"], questionBankUsage: { mode: "first", slots: 12, used: new Array(10).fill({}), skipped: new Array(2).fill({}) },
  }),
  base("job-warnings", {
    history: true, status: "complete", reviewStatus: "warnings", studentId: "student-3", studentName: "Maya Haddad", subject: "maths", year: 7, resourceType: "worksheet",
    customPrompt: "Angle relationships on parallel lines, 15 questions.", createdAtIso: minutesAgo(60 * 26), completedAtIso: minutesAgo(60 * 26 - 6),
    outputPath: "preview/worksheet.docx", outputFileName: "Worksheet - Maya Haddad - Year 7 Maths - Angle relationships.docx", previewPath: "preview/worksheet.pdf",
    warnings: [{ code: "LAYOUT", message: "Page 3, Question 9 has a diagram that prints small. Check it before printing." }],
  }),
  base("job-english", {
    history: true, status: "complete", reviewStatus: "passed", studentId: "student-4", studentName: "Noah Taylor", subject: "english", year: 12, resourceType: "essay-scaffold",
    customPrompt: "Essay scaffold for Module B on T.S. Eliot's poetry.", createdAtIso: minutesAgo(60 * 50), completedAtIso: minutesAgo(60 * 50 - 5),
    outputPath: "preview/scaffold.docx", outputFileName: "Essay Scaffold - Noah Taylor - Year 12 English.docx", previewPath: null,
  }),
  base("job-needs-input", {
    history: true, status: "failed", errorCode: "RESOURCE_CLARIFICATION_REQUIRED", studentId: "student-5", studentName: "Zoe Papadopoulos", subject: "maths", year: 5, resourceType: "worksheet",
    customPrompt: "Fractions.", error: "Which part of fractions should this cover: equivalent fractions, adding and subtracting, or fractions of a quantity?",
    createdAtIso: minutesAgo(60 * 72), completedAtIso: minutesAgo(60 * 72 - 1),
  }),
  base("job-failed", {
    history: true, status: "failed", errorCode: "PROVIDER_FAILURE", studentId: "student-6", studentName: "Ethan Kaur", subject: "maths", year: 8, resourceType: "practice-paper",
    customPrompt: "Yearly exam practice paper, 60 minutes, all topics.", error: "The writing service was unavailable. Nothing was lost; press Retry to continue from where it stopped.",
    createdAtIso: minutesAgo(60 * 96), completedAtIso: minutesAgo(60 * 96 - 9),
  }),
];
