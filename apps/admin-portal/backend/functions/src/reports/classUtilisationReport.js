"use strict";

const { onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { toHttpsError } = require("../shared/errors");
const { validateClassUtilisationReportInput } = require("./reportSchemas");
const { attendanceReportImpl } = require("./attendanceReport");

async function classUtilisationReportImpl({ payload, actor, deps }) {
  const attendancePayload = {
    fromDate: payload.fromDate,
    toDate: payload.toDate,
    groupBy: "class",
    includeCancelled: false,
    classIds: payload.classIds,
  };

  const report = await attendanceReportImpl({
    payload: attendancePayload,
    actor,
    deps,
  });

  const classRows = report.rows.filter((r) => r.sessionsHeld > 0 && r.utilisationRate !== null);
  const avgUtilisation =
    classRows.length === 0
      ? 0
      : classRows.reduce((sum, r) => sum + r.utilisationRate, 0) / classRows.length;

  return {
    ...report,
    reportType: "classUtilisation",
    summary: {
      ...report.summary,
      averageUtilisationRate: Math.round(avgUtilisation * 1000) / 1000,
      classesAbove80Percent: classRows.filter((r) => r.utilisationRate >= 0.8).length,
      classesBelow50Percent: classRows.filter((r) => r.utilisationRate < 0.5).length,
    },
  };
}

const adminClassUtilisationReport = onCall(
  { region: "us-central1" },
  async (request) => {
    const actor = requireAdminCallable(request);
    let payload;
    try {
      payload = validateClassUtilisationReportInput(request.data);
    } catch (err) {
      throw toHttpsError(err);
    }
    try {
      return await classUtilisationReportImpl({
        payload,
        actor,
        deps: { db: admin.firestore() },
      });
    } catch (err) {
      logger.error("[adminClassUtilisationReport] failed", {
        errorMessage: err?.message,
        actorUid: actor.uid,
      });
      throw toHttpsError(err);
    }
  }
);

module.exports = {
  classUtilisationReportImpl,
  adminClassUtilisationReport,
};
