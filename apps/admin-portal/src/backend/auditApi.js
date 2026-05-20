import { limitQuery, listDocumentPage, orderBy, startAfter, timestampToIso, where } from "./firestoreReads";

function normalizeAuditLog(id, data = {}) {
  return {
    id,
    ...data,
    createdAtIso: timestampToIso(data.createdAt),
  };
}

function cleanText(value) {
  return String(value || "").trim();
}

function dayStart(value) {
  const text = cleanText(value);
  if (!text) return null;
  const date = new Date(`${text}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayEnd(value) {
  const text = cleanText(value);
  if (!text) return null;
  const date = new Date(`${text}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function actorFieldForQuery(value) {
  const text = cleanText(value);
  if (!text) return null;
  return text.includes("@") ? "actorEmail" : "actorUid";
}

function buildAuditConstraints({ limit = 50, cursor, filters = {} } = {}) {
  const pageSize = Math.max(1, Math.min(Number(limit) || 50, 200));
  const constraints = [];
  const action = cleanText(filters.action);
  const actor = cleanText(filters.actor);
  const actorRole = cleanText(filters.actorRole);
  const targetType = cleanText(filters.targetType);
  const targetId = cleanText(filters.targetId);
  const from = dayStart(filters.fromDate);
  const to = dayEnd(filters.toDate);

  if (action) constraints.push(where("action", "==", action));
  if (actorRole) constraints.push(where("actorRole", "==", actorRole));
  if (targetType) constraints.push(where("targetType", "==", targetType));
  if (targetId) constraints.push(where("targetId", "==", targetId));
  if (actor) constraints.push(where(actorFieldForQuery(actor), "==", actor));
  if (from) constraints.push(where("createdAt", ">=", from));
  if (to) constraints.push(where("createdAt", "<=", to));

  constraints.push(orderBy("createdAt", "desc"));

  if (cursor) {
    constraints.push(startAfter(cursor));
  }

  constraints.push(limitQuery(pageSize + 1));
  return { constraints, pageSize };
}

export async function listAuditLogs(options = {}) {
  const { constraints, pageSize } = buildAuditConstraints(options);
  const page = await listDocumentPage("adminAuditLogs", {
    constraints,
    normalize: normalizeAuditLog,
  });
  const rows = page.rows.slice(0, pageSize);
  const nextCursor = page.rows.length > pageSize
    ? page.docs?.[rows.length - 1] || page.lastDoc || null
    : null;
  return {
    rows,
    nextCursor,
    hasMore: page.rows.length > pageSize,
  };
}

export async function listRecentAuditLogs(max = 50) {
  const page = await listAuditLogs({ limit: max });
  return page.rows;
}

export { buildAuditConstraints };
