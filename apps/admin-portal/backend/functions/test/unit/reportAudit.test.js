"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  reportRowCount,
  serialiseFilterValue,
  writeReportAuditLog,
} = require("../../src/reports/reportAudit");

function fakeDb() {
  const writes = [];
  return {
    writes,
    collection(name) {
      return {
        async add(data) {
          writes.push({ collection: name, data });
          return { id: `audit-${writes.length}` };
        },
      };
    },
  };
}

describe("reportAudit", () => {
  it("counts supported report row shapes", () => {
    assert.equal(reportRowCount({ rows: [{}, {}] }), 2);
    assert.equal(reportRowCount({ invoices: [{}] }), 1);
    assert.equal(reportRowCount({ byGrade: [{}, {}, {}] }), 3);
    assert.equal(reportRowCount({}), 0);
  });

  it("serialises date filters", () => {
    assert.deepEqual(
      serialiseFilterValue({
        fromDate: new Date("2026-05-18T00:00:00.000Z"),
        classIds: ["class-1"],
      }),
      {
        fromDate: "2026-05-18T00:00:00.000Z",
        classIds: ["class-1"],
      }
    );
  });

  it("writes readable report audit metadata", async () => {
    const db = fakeDb();
    await writeReportAuditLog(
      db,
      {
        actor: {
          uid: "admin-1",
          email: "admin@example.com",
          claims: { role: "admin" },
        },
        action: "report.generate",
        reportType: "income",
        filters: { groupBy: "month" },
        rowCount: 4,
      },
      { clock: () => new Date("2026-05-18T00:00:00.000Z") }
    );

    assert.equal(db.writes[0].collection, "adminAuditLogs");
    assert.equal(db.writes[0].data.actorRole, "admin");
    assert.equal(db.writes[0].data.targetName, "Income report");
    assert.deepEqual(db.writes[0].data.payloadSummary, {
      filters: { groupBy: "month" },
      rowCount: 4,
    });
  });
});
