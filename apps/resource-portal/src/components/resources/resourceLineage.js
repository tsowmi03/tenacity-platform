// Version stacks for the resource history (RES-23).
//
// Pure presentation logic over job documents, deliberately kept out of
// resourcesApi so it carries no Firebase dependency and can be read — and
// tested — without one.

// How a version came about, for the label on its row in history.
export function derivationLabel(job) {
  if (job?.derivation === "revision") return "Revised";
  if (job?.derivation === "edited-inputs") return "Edited inputs";
  return "Original";
}

/**
 * Group jobs into version stacks — a resource together with everything derived
 * from it, whether by revising the output or by editing the inputs and
 * generating again.
 *
 * Stacks come back in the order their newest member appeared in `jobs`, so a
 * freshly revised resource rises to the top of history the way a new one does.
 * Within a stack, versions are numbered oldest-first (the way a tutor reads
 * v1 → v2 → v3) but listed newest-first (the way history reads).
 *
 * `rootLoaded` says whether the original is actually among the jobs passed in.
 * History loads a fixed window of recent jobs, so a long-lived stack can have
 * older versions outside it; when that happens the numbering here counts only
 * what is loaded, and the UI says so rather than implying v1 is the beginning.
 */
export function groupJobsByLineage(jobs = []) {
  const stacks = new Map();
  for (const job of jobs) {
    const rootId = job.lineageRootId || job.jobId || job.id;
    if (!stacks.has(rootId)) stacks.set(rootId, []);
    stacks.get(rootId).push(job);
  }

  return [...stacks.entries()].map(([rootId, group]) => {
    const oldestFirst = [...group].sort((a, b) =>
      String(a.createdAtIso || "").localeCompare(String(b.createdAtIso || ""))
    );
    const versions = oldestFirst.map((job, index) => ({
      job,
      version: index + 1,
      label: derivationLabel(job),
    }));
    return {
      rootId,
      rootLoaded: oldestFirst.some((job) => (job.jobId || job.id) === rootId),
      total: versions.length,
      latest: versions[versions.length - 1],
      versions: [...versions].reverse(),
    };
  });
}
