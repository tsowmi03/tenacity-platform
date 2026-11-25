// Sample data standing in for src/backend/resourcesApi.js in the preview.
// Nothing here reaches Firebase. Stimuli and the gaps summary are copies of
// real bank data (published texts and counts); everything about people is
// made up.
import gaps from "../fixtures/bankGaps.json";
import stimuli from "../fixtures/stimuli.json";
import { jobs as sampleJobs } from "../fixtures/jobs.js";

const wait = (value, ms = 180) => new Promise((resolve) => setTimeout(() => resolve(value), ms));
const role = new URLSearchParams(window.location.search).get("role") === "tutor" ? "tutor" : "admin";

// ---- Resource jobs -------------------------------------------------------
export function normalizeResourceJob(id, data = {}) {
  return { id, jobId: id, warnings: [], ...data };
}
export function subscribeResourceJobs(_scope, onNext) {
  const timer = setTimeout(() => onNext(sampleJobs.filter((job) => !job.history)), 120);
  return () => clearTimeout(timer);
}
export function subscribeResourceJobHistory(_scope, onNext) {
  const timer = setTimeout(() => onNext(sampleJobs), 120);
  return () => clearTimeout(timer);
}
export const findSimilarResources = async () => wait([]);
export const submitResourceJob = async () => wait({ jobId: "preview-new" });
export function resourceJobUploadedFiles(job = {}) {
  return Array.isArray(job.uploadedFiles) ? job.uploadedFiles.filter((file) => file && file.path) : [];
}
export const buildResubmitPayload = (job = {}) => ({ ...job });
export const resubmitResourceJob = async () => wait({ jobId: "preview-new" });
export const answerResourceClarification = async () => wait({ jobId: "preview-new" });
export const submitResourceRevision = async () => wait({ jobId: "preview-revision" });
export const chatAboutResource = async () => wait({
  reply: "For a Year 9 student starting trigonometry I'd make a worksheet of about 12 questions: four finding the hypotenuse, four finding a shorter side and four worded problems. Shall I set that up?",
  proposal: null,
}, 600);
export const retryResourceJob = async () => wait({});
export const cancelResourceJob = async () => wait({});
export const deleteResourceJob = async () => wait({});
export const assertResourceStorageConfigured = () => {};
export const uploadResourceReference = async ({ file }) => wait({ path: `preview/${file?.name || "file"}`, name: file?.name || "file" });
export const downloadResourceJob = async () => wait({});
export const fetchResourceJobPreview = async () => { throw Object.assign(new Error("The preview has no PDF to show."), { userMessage: "The preview has no PDF to show." }); };
export const downloadResourceUpload = async () => wait({});
export const getResourceBankQuestions = async () => wait({ questions: [] });
export const flagBankQuestion = async () => wait({});
export const resolveBankFlag = async () => wait({});

// ---- Question bank -------------------------------------------------------
const maths = Array.from({ length: 18 }, (_, index) => ({
  id: `maths-${index + 1}`,
  status: index === 4 ? "hidden" : "live",
  sourcePath: `Maths/Year ${7 + (index % 4)}/Textbooks/Cambridge Maths ${7 + (index % 4)}.pdf`,
  pageNumber: 40 + index * 7,
  label: `Q${(index % 9) + 1}${"abc"[index % 3]}`,
  preview: ["Find the length of the hypotenuse.", "Calculate the area of the composite shape.", "Find the value of x, giving reasons.", "What is the volume of the cylinder?"][index % 4],
  topic: ["Pythagoras' theorem", "Area", "Angle relationships", "Volume"][index % 4],
  yearLevel: `Year ${7 + (index % 4)}`,
  diagramType: ["right_triangle", "shape_2d", "angle_relationships", "solid_3d"][index % 4],
  skill: ["find_hypotenuse", "area_composite", "parallel_lines_transversal", "volume_prism_cylinder"][index % 4],
  difficulty: ["easy", "medium", "hard"][index % 3],
  hasImage: false,
  openFlags: index === 2 ? 1 : 0,
}));
const rowsOf = { maths, stimuli: stimuli.records, englishQuestions: [], guides: [], setTexts: [] };

export const getBankOptions = async () => wait({ ...stimuli.options, openFlags: role === "admin" ? 1 : 0 });
export const getBankGaps = async () => wait({ summary: { ...gaps, updatedAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString() } }, 350);

export async function browseBank({ bank, status = "live", filters = {} }) {
  const lengths = { short: [0, 299], medium: [300, 799], long: [800, Infinity] };
  const records = (rowsOf[bank] || []).filter((row) => {
    if (status === "flagged") return row.openFlags > 0;
    if (status !== "all" && row.status !== status) return false;
    if (filters.year && !String(row.yearLevel || "").includes(String(filters.year))) return false;
    if (filters.type && row.type !== filters.type) return false;
    if (filters.diagramType && row.diagramType !== filters.diagramType) return false;
    if (filters.skill && row.skill !== filters.skill) return false;
    if (filters.difficulty && row.difficulty !== filters.difficulty) return false;
    if (filters.technique && !(row.techniqueIds || []).includes(filters.technique)) return false;
    if (filters.theme && !(row.themes || []).some((theme) => String(theme).toLowerCase().includes(filters.theme.toLowerCase()))) return false;
    if (filters.length && !(row.medium === "written" && row.wordCount >= lengths[filters.length][0] && row.wordCount <= lengths[filters.length][1])) return false;
    return true;
  });
  return wait({ records: records.slice(0, 25), nextCursor: null, total: records.length });
}
export const getBankImages = async () => wait({ images: {} });
export async function getBankRecord({ bank, id }) {
  const row = (rowsOf[bank] || []).find((entry) => entry.id === id);
  if (!row) throw Object.assign(new Error("Record not found"), { userMessage: "Record not found" });
  const isStimulus = bank === "stimuli";
  return wait({
    record: {
      ...row,
      text: isStimulus ? `${row.preview}\n\n(The full text is shown here in the portal.)` : "",
      stem: isStimulus ? null : row.preview,
      publication: null,
      pages: row.pageNumber ? [row.pageNumber] : [],
      techniques: (row.techniqueIds || []).slice(0, 3).map((technique) => ({ technique, evidence: "An example from the text." })),
      driveUrl: "https://drive.google.com/file/d/preview-only/view",
    },
    images: [],
    flags: [],
    history: [],
    links: isStimulus ? {
      questions: [{ id: "q1", status: "live", label: "1", text: "How does the writer create a sense of place in the opening lines?", marks: 3 }],
      guides: [{ id: "g1", status: "live", questionId: "q1", criteria: "Identifies a technique and explains its effect with a quotation.", sampleAnswer: "" }],
    } : {},
  });
}
export const hideBankRecord = async (args) => getBankRecord(args);
export const restoreBankRecord = async (args) => getBankRecord(args);
export const editBankRecord = async (args) => getBankRecord(args);
