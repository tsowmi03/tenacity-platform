"use strict";

// RES-63. Links bank questions to their book's own printed answers.
//
//   pilot  --book "<source path>" [--answers "<answer file path>"] ... --out <dir> [--max-pages N]
//          Reads production and calls Haiku; writes only to --out.
//   plan   --out <dir> [--only <regex>]
//          Pairs every book with its answers and counts the answer pages to
//          read, without calling the model. Writes <out>/plan.json.
//   run    --out <dir> [--only <regex>] [--concurrency 6] [--max-usd 60]
//          Reads each planned book's answers and links them. One result file
//          per book in <out>/books, so a stopped run resumes where it left off.
//          Writes nothing to production.
//   write  --out <dir> [--dry-run]
//          Writes each linked answer to its question as `bookAnswer`.
//          Production write.
//
// Where a book's answers live:
//   teacher      a Mathletics teacher edition (recorded as duplicateOf the student book)
//   answer_file  a separate Solutions/Answers file, matched by name or as the only one in the folder
//   paper        a past paper: solutions after the questions, or an answered second copy
//   in_book      an answer section at the back of the book (found from page images when scanned)

const fs = require("node:fs");
const path = require("node:path");
const admin = require("firebase-admin");
const { createDriveClient, createImpersonatedTokenProvider } = require("../src/questionBank/driveSource");
const { fetchSourcePdf } = require("../src/questionBank/sourceFiles");
const { openPdf } = require("../src/questionBank/pages");
const K = require("../src/questionBank/answerKeys");
const { SOURCES_COLLECTION } = require("../src/questionBank/sourceStore");
const { QUESTIONS_COLLECTION } = require("../src/questionBank/extraction");
const { loadFirebaseSecrets } = require("./liveResourceSmoke");

const PAPER_PATH = /Past Papers|WME|Trial|Yearly|Assessment Task/i;
const PRICE = { input: 0.10 / 1e6, output: 0.50 / 1e6 }; // Haiku 5.5, $/token
const EST_PER_PAGE = { in_book: 0.005, answer_file: 0.005, teacher: 0.003, paper: 0.001 };
const SCANNED_GUESS = 40; // answer pages assumed for a scanned book at plan time

function parseArgs(argv) {
  const o = { mode: argv[0], pairs: [], out: null, maxPages: 400, only: null, concurrency: 6, maxUsd: 60, dryRun: false };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--book") o.pairs.push({ book: argv[++i], answers: null });
    else if (a === "--answers") o.pairs[o.pairs.length - 1].answers = argv[++i];
    else if (a === "--out") o.out = argv[++i];
    else if (a === "--max-pages") o.maxPages = Number(argv[++i]);
    else if (a === "--only") o.only = new RegExp(argv[++i], "i");
    else if (a === "--concurrency") o.concurrency = Number(argv[++i]);
    else if (a === "--max-usd") o.maxUsd = Number(argv[++i]);
    else if (a === "--dry-run") o.dryRun = true;
    else throw new Error(`Unknown option: ${a}`);
  }
  if (!["pilot", "plan", "run", "write"].includes(o.mode) || !o.out) throw new Error("Usage: pilot|plan|run|write --out <dir> (see header)");
  if (o.mode === "pilot" && !o.pairs.length) throw new Error("pilot needs --book");
  return o;
}

const addUsage = (a, b) => ({ inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens });
const costOf = (u) => u.inputTokens * PRICE.input + u.outputTokens * PRICE.output;
const isScanned = (texts) => texts.filter((t) => t.trim().length < 40).length >= texts.length * 0.5;

async function pageTexts(pdf) {
  const n = await pdf.pageCount();
  const texts = [];
  for (let p = 1; p <= n; p++) texts.push((await pdf.pageText(p)) || "");
  return texts;
}

// --- pairing --------------------------------------------------------------------

/** Every source with live questions, paired with where its answers are. */
async function inventory(db) {
  const all = (await db.collection(SOURCES_COLLECTION).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const counts = {};
  (await db.collection(QUESTIONS_COLLECTION).where("status", "==", "live").select("sourceId").get())
    .docs.forEach((d) => { counts[d.get("sourceId")] = (counts[d.get("sourceId")] || 0) + 1; });
  const books = all.filter((s) => counts[s.id]);
  const teacher = new Map(all.filter((s) => s.skipReason === "teacher_edition" && s.duplicateOf).map((s) => [s.duplicateOf, s]));
  const answerFiles = all.filter((s) => s.skipReason === "answer_file");
  const stem = (p) => path.basename(p).toLowerCase().replace(/\.(pdf|docx?)$/, "")
    .replace(/[_\s-]*(solutions?|answers?|worked)[_\s-]*/g, "").replace(/[^a-z0-9]/g, "");
  const byStem = new Map(answerFiles.map((a) => [`${path.dirname(a.path)}|${stem(a.path)}`, a]));
  const booksIn = (dir) => books.filter((b) => path.dirname(b.path) === dir).length;
  const answersIn = (dir) => answerFiles.filter((a) => path.dirname(a.path) === dir);
  return books.map((b) => {
    const dir = path.dirname(b.path);
    const t = teacher.get(b.id);
    let a = byStem.get(`${dir}|${stem(b.path)}`);
    // A folder holding one book and one solutions file (WME papers).
    if (!a && booksIn(dir) === 1 && answersIn(dir).length === 1) a = answersIn(dir)[0];
    const kind = t ? "teacher" : a ? "answer_file" : PAPER_PATH.test(b.path) ? "paper" : "in_book";
    return { sourceId: b.id, book: b.path, answers: (t || a)?.path || null, kind, questions: counts[b.id] };
  });
}

// --- one book -------------------------------------------------------------------

async function extractAnswers({ client, pdf, pages, log, paper = false }) {
  const entries = [];
  let previous = null;
  let usage = { inputTokens: 0, outputTokens: 0 };
  for (const page of pages) {
    const { image, blank } = await pdf.renderModelPage(page);
    if (blank) continue;
    try {
      const out = K.readAnswerMessage(await client.messages.stream(K.buildAnswerParams({ image, previous, paper })).finalMessage());
      usage = addUsage(usage, out.usage);
      for (const e of out.entries) entries.push({ ...e, answerPdfPage: page });
      const last = out.entries[out.entries.length - 1];
      if (last) previous = { exercise: last.exercise, page: last.page, question: last.question };
    } catch (err) {
      log(`answer page ${page} failed: ${String(err.message).slice(0, 120)}`);
    }
  }
  return { entries, usage };
}

async function extractMirror({ client, pdf, mirror, questions, pages, log }) {
  const links = [];
  let usage = { inputTokens: 0, outputTokens: 0 };
  for (const page of pages) {
    const onPage = questions.filter((q) => q.pageNumber === page);
    const { image } = await pdf.renderModelPage(mirror.get(page));
    try {
      const out = K.readMirrorMessage(await client.messages.stream(K.buildMirrorParams({ image, questions: onPage })).finalMessage());
      usage = addUsage(usage, out.usage);
      links.push(...K.linkMirrorAnswers(onPage, out.answers));
    } catch (err) {
      log(`teacher page ${mirror.get(page)} failed: ${String(err.message).slice(0, 120)}`);
    }
  }
  return { links, usage };
}

async function findScannedAnswerPages({ client, pdf, pageCount }) {
  let usage = { inputTokens: 0, outputTokens: 0 };
  const pages = await K.findAnswerSectionByImage({ pageCount, kindOf: async (page) => {
    const { image, blank } = await pdf.renderModelPage(page);
    if (blank) return "other";
    const message = await client.messages.create(K.buildPageKindParams({ image }));
    usage = addUsage(usage, { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens });
    return JSON.parse(message.content.find((b) => b.type === "text").text).kind;
  } });
  return { pages, usage };
}

/**
 * Works out which pages hold a book's answers and, unless planOnly, reads them
 * and links them to the book's questions. ctx: { db, drive, client, byPath }.
 */
async function processBook(ctx, item, { planOnly = false, maxPages = 400, log = () => {} } = {}) {
  const { db, drive, client, byPath } = ctx;
  const book = byPath.get(item.book);
  if (!book) return { ...item, route: "missing_book", links: [] };
  const questions = (await db.collection(QUESTIONS_COLLECTION).where("sourceId", "==", book.id).where("status", "==", "live").get())
    .docs.map((d) => ({ id: d.id, label: d.get("label"), pageNumber: d.get("pageNumber"), box: d.get("box") }));
  const bookPdf = await openPdf(await fetchSourcePdf({ drive, source: book }));
  const opened = [bookPdf];
  const none = { inputTokens: 0, outputTokens: 0 };
  const done = (route, extra) => ({ ...item, route, questions: questions.length, ...extra });
  try {
    const bookTexts = await pageTexts(bookPdf);
    const index = K.buildPageIndex(bookTexts);
    const questionPages = [...new Set(questions.map((q) => q.pageNumber))];

    // Mirror: a teacher edition, or an answered copy inside a past paper.
    const mirrorRun = async (pdf, mirror, route) => {
      const pages = questionPages.filter((p) => mirror.has(p)).slice(0, maxPages);
      if (planOnly) return done(route, { answerPages: pages.length, links: [] });
      const out = await extractMirror({ client, pdf, mirror, questions, pages, log });
      return done(route, { answerPages: pages.length, links: out.links, numbered: questions.length, usage: out.usage });
    };
    const keyRun = async (pdf, pages, route, link, extraUsage = none) => {
      pages = pages.slice(0, maxPages);
      if (planOnly) return done(route, { answerPages: pages.length, links: [] });
      const { entries, usage } = await extractAnswers({ client, pdf, pages, log, paper: route.startsWith("paper") });
      const result = link(entries);
      return done(route, { answerPages: pages.length, links: result.links, numbered: result.numbered, conflicted: result.conflicted, entries: entries.length, usage: addUsage(usage, extraUsage) });
    };
    const bookLink = (entries) => K.linkAnswers({ questions, index, entries });

    if (item.answers) {
      const answers = byPath.get(item.answers);
      if (!answers) return done("missing_answers", { links: [] });
      const answerPdf = await openPdf(await fetchSourcePdf({ drive, source: answers }));
      opened.push(answerPdf);
      const answerTexts = await pageTexts(answerPdf);
      const mirror = K.matchMirrorPages(bookTexts, answerTexts);
      if (questionPages.filter((p) => mirror.has(p)).length >= questionPages.length * 0.5) return await mirrorRun(answerPdf, mirror, "mirror");
      const answerIndex = K.buildPageIndex(answerTexts);
      const pages = answerIndex.pages.length > 12 ? answerIndex.pages.filter((p) => p.page > 2).map((p) => p.page) : answerIndex.pages.map((p) => p.page);
      if (PAPER_PATH.test(item.book)) {
        return await keyRun(answerPdf, pages, "paper_file", (entries) => K.linkPaperAnswers({ questions, entries, pageSections: K.paperPageSections(bookTexts) }));
      }
      return await keyRun(answerPdf, pages, "answer_file", bookLink);
    }
    if (item.kind === "paper") {
      const found = K.paperSolutionPages(bookTexts, questions.map((q) => q.pageNumber));
      if (found.mode === "mirror") return await mirrorRun(bookPdf, found.mirror, "paper_mirror");
      if (found.mode === "none") return done("no_answers", { links: [] });
      return await keyRun(bookPdf, found.pages, "paper", (entries) => K.linkPaperAnswers({ questions, entries, pageSections: K.paperPageSections(bookTexts) }));
    }
    const pages = index.pages.filter((p) => p.answerPage).map((p) => p.page);
    if (pages.length) return await keyRun(bookPdf, pages, "in_book", bookLink);
    if (!isScanned(bookTexts)) return done("no_answers", { links: [] });
    if (planOnly) return done("scanned", { answerPages: SCANNED_GUESS, links: [] });
    const found = await findScannedAnswerPages({ client, pdf: bookPdf, pageCount: bookTexts.length });
    if (!found.pages.length) return done("no_answers", { links: [], usage: found.usage });
    return await keyRun(bookPdf, found.pages, "scanned", bookLink, found.usage);
  } finally {
    for (const pdf of opened) await pdf.close();
  }
}

// --- modes ----------------------------------------------------------------------

function connect({ needClient = true } = {}) {
  admin.initializeApp({ projectId: "tenacity-tutoring-b8eb2" });
  const db = admin.firestore();
  const drive = createDriveClient({ getAccessToken: createImpersonatedTokenProvider() });
  let client = null;
  if (needClient) {
    const keys = loadFirebaseSecrets({ secretNames: ["ANTHROPIC_API_KEY"] });
    client = new (require("@anthropic-ai/sdk").default)({ apiKey: keys.ANTHROPIC_API_KEY, maxRetries: 4 });
  }
  return { db, drive, client };
}

async function withSources(ctx) {
  const sources = (await ctx.db.collection(SOURCES_COLLECTION).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  return { ...ctx, byPath: new Map(sources.map((s) => [s.path, s])) };
}

async function pool(items, size, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const i = next++; await fn(items[i], i); }
  }));
}

const fileFor = (dir, sourceId) => path.join(dir, `${sourceId}.json`);

async function runPilot(o) {
  const ctx = await withSources(connect());
  fs.mkdirSync(o.out, { recursive: true });
  const all = await inventory(ctx.db);
  const summary = [];
  for (const pair of o.pairs) {
    const item = all.find((r) => r.book === pair.book) || { book: pair.book, kind: PAPER_PATH.test(pair.book) ? "paper" : "in_book" };
    if (pair.answers) Object.assign(item, { answers: pair.answers, kind: "answer_file" });
    const log = (line) => console.log(`[${path.basename(pair.book)}] ${line}`);
    const r = await processBook(ctx, item, { maxPages: o.maxPages, log });
    const rate = r.numbered ? Math.round((100 * r.links.length) / r.numbered) : 0;
    log(`${r.route}: linked ${r.links.length} of ${r.numbered || 0} (${rate}%)`);
    fs.writeFileSync(path.join(o.out, `${path.basename(pair.book).replace(/\W+/g, "_")}.json`), JSON.stringify(r, null, 2));
    summary.push({ book: pair.book, route: r.route, linked: r.links.length, numbered: r.numbered, rate, answerPages: r.answerPages });
  }
  console.table(summary);
}

async function runPlan(o) {
  const ctx = await withSources(connect({ needClient: false }));
  fs.mkdirSync(o.out, { recursive: true });
  const items = (await inventory(ctx.db)).filter((r) => !o.only || o.only.test(r.book));
  const plan = [];
  let done = 0;
  await pool(items, o.concurrency, async (item) => {
    try {
      plan.push(await processBook(ctx, item, { planOnly: true, maxPages: o.maxPages }));
    } catch (err) {
      plan.push({ ...item, route: "error", error: String(err.message).slice(0, 200) });
    }
    if (++done % 50 === 0) console.log(`planned ${done}/${items.length}`);
  });
  const byRoute = {};
  for (const p of plan) {
    const r = (byRoute[p.route] = byRoute[p.route] || { books: 0, questions: 0, answerPages: 0, usd: 0 });
    r.books += 1; r.questions += p.questions || 0; r.answerPages += p.answerPages || 0;
    r.usd += (p.answerPages || 0) * (EST_PER_PAGE[p.kind] || 0.005);
  }
  fs.writeFileSync(path.join(o.out, "plan.json"), JSON.stringify(plan, null, 1));
  console.table(byRoute);
  console.log(`estimated cost $${Object.values(byRoute).reduce((n, r) => n + r.usd, 0).toFixed(0)}`);
}

async function runAll(o) {
  const ctx = await withSources(connect());
  const dir = path.join(o.out, "books");
  fs.mkdirSync(dir, { recursive: true });
  const plan = JSON.parse(fs.readFileSync(path.join(o.out, "plan.json"), "utf8"))
    .filter((p) => (p.answerPages || 0) > 0 && (!o.only || o.only.test(p.book)))
    .filter((p) => !fs.existsSync(fileFor(dir, p.sourceId)));
  let spent = fs.readdirSync(dir).reduce((n, f) => n + costOf(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).usage || { inputTokens: 0, outputTokens: 0 }), 0);
  const started = Date.now();
  const totalPages = plan.reduce((n, p) => n + p.answerPages, 0);
  let pagesDone = 0;
  let booksDone = 0;
  console.log(`${plan.length} books to read, ${totalPages} answer pages; $${spent.toFixed(2)} already spent`);
  await pool(plan, o.concurrency, async (item) => {
    if (spent >= o.maxUsd) return;
    const log = (line) => console.log(`[${path.basename(item.book).slice(0, 40)}] ${line}`);
    let r;
    try {
      r = await processBook(ctx, item, { maxPages: o.maxPages, log });
    } catch (err) {
      log(`failed: ${String(err.message).slice(0, 160)}`);
      return; // no result file, so a rerun retries it
    }
    spent += costOf(r.usage || { inputTokens: 0, outputTokens: 0 });
    fs.writeFileSync(fileFor(dir, item.sourceId), JSON.stringify(r));
    pagesDone += item.answerPages; booksDone += 1;
    const rate = pagesDone / ((Date.now() - started) / 60000);
    const eta = new Date(Date.now() + ((totalPages - pagesDone) / Math.max(rate, 0.01)) * 60000);
    console.log(`${booksDone}/${plan.length} books, ${pagesDone}/${totalPages} pages, $${spent.toFixed(2)}, ETA ${eta.toTimeString().slice(0, 5)} | ${r.route} linked ${r.links.length}/${r.numbered || 0} ${path.basename(item.book).slice(0, 50)}`);
  });
  if (spent >= o.maxUsd) console.log(`stopped at the $${o.maxUsd} cap; rerun with a higher --max-usd to continue`);
}

async function runWrite(o) {
  const { db } = connect({ needClient: false });
  const dir = path.join(o.out, "books");
  const runId = `answers-${new Date().toISOString().slice(0, 10)}`;
  let writer = db.bulkWriter();
  let count = 0;
  for (const f of fs.readdirSync(dir)) {
    const r = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const l of r.links || []) {
      count += 1;
      if (o.dryRun) continue;
      writer.update(db.collection(QUESTIONS_COLLECTION).doc(l.questionId), {
        bookAnswer: { answer: l.answer, via: l.via, key: l.key, route: r.route, answerSource: r.answers || r.book, runId, linkedAt: admin.firestore.FieldValue.serverTimestamp() },
      });
    }
  }
  if (!o.dryRun) await writer.close();
  console.log(`${o.dryRun ? "would write" : "wrote"} bookAnswer on ${count} questions`);
}

if (require.main === module) {
  const o = parseArgs(process.argv.slice(2));
  ({ pilot: runPilot, plan: runPlan, run: runAll, write: runWrite })[o.mode](o)
    .then(() => process.exit(0))
    .catch((err) => { console.error(err); process.exit(1); });
}
module.exports = { parseArgs, inventory };
