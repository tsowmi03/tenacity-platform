import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthProvider";
import {
  listParentSurveyResponses,
  setParentSurveyResponseArchived,
} from "../backend/parentSurveyApi";
import {
  COMMUNICATION_QUESTIONS,
  LESSON_QUESTIONS,
  STUDENT_YEAR_OPTIONS,
  SUBJECT_OPTIONS,
  appBarrierLabel,
  appUsageLabel,
  appUsefulnessLabel,
  ratingLabel,
  satisfactionLabel,
  scoreTone,
  studentYearLabel,
  subjectLabel,
} from "../backend/parentSurvey";
import { triggerBlobDownload } from "../backend/reportsApi";
import Badge from "../components/Badge";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import Table from "../components/Table";
import { useToast } from "../components/ToastProvider";
import {
  appBarrierDistribution,
  appUsageDistribution,
  headlineStats,
  satisfactionDistribution,
  statementScores,
  writtenAnswers,
} from "./parentFeedbackStats";

const COMMENT_KINDS = [
  ["all", "All"],
  ["change", "One change"],
  ["strengths", "Doing well"],
  ["app", "App"],
];

function formatDate(iso) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatScore(value, decimals = 1) {
  return Number.isFinite(value) ? value.toFixed(decimals) : "-";
}

function csvCell(value) {
  let text = String(value ?? "");
  // A parent's own words drive this, and every written answer is free text.
  // Quoting commas and newlines makes valid CSV, but spreadsheet software
  // still treats a cell starting with =, +, - or @ as a formula regardless of
  // quoting, so a leading apostrophe is the only thing that forces text mode.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rowsToCsv(rows) {
  const header = [
    "Submitted",
    "Year group",
    "Subjects",
    "Overall satisfaction",
    ...LESSON_QUESTIONS.map((q) => q.text),
    ...COMMUNICATION_QUESTIONS.map((q) => q.text),
    "App use",
    "App usefulness",
    "Reason for not using app",
    "Other app reason",
    "App improvement",
    "Recommendation",
    "Doing well",
    "One change",
    "Follow-up requested",
    "Follow-up name",
    "Follow-up email",
  ];

  const body = rows.map((row) =>
    [
      formatDate(row.createdAtIso),
      studentYearLabel(row.context.studentYear),
      row.context.subjects.map(subjectLabel).join("; "),
      row.overallSatisfaction ?? "",
      ...LESSON_QUESTIONS.map((q) => ratingLabel(row.lessons?.[q.id])),
      ...COMMUNICATION_QUESTIONS.map((q) => ratingLabel(row.communication?.[q.id])),
      appUsageLabel(row.app.usage),
      row.app.usefulness ?? "",
      row.app.usage === "never" ? appBarrierLabel(row.app.barrier) : "",
      row.app.otherBarrier,
      row.app.improvement,
      row.recommendation ?? "",
      row.comments.strengths,
      row.comments.change,
      row.followUp.requested ? "Yes" : "No",
      row.followUp.name,
      row.followUp.email,
    ]
      .map(csvCell)
      .join(",")
  );

  return [header.map(csvCell).join(","), ...body].join("\n");
}

/** A labelled horizontal bar. Widths are shares of the largest bar in the set. */
function BarRow({ label, count, share, scale = 1, tone = "brand" }) {
  const width = scale > 0 ? Math.round((share / scale) * 100) : 0;
  return (
    <div className="fb-bar-row">
      <span className="fb-bar-label">{label}</span>
      <span className="fb-bar-track">
        <span
          className={`fb-bar-fill tone-${tone} ${count === 0 ? "is-empty" : ""}`}
          style={{ width: `${width}%` }}
        />
      </span>
      <span className="fb-bar-value">
        {count}
        <span className="fb-bar-share">{Math.round(share * 100)}%</span>
      </span>
    </div>
  );
}

function BarChart({ rows, tone = "brand" }) {
  const scale = Math.max(...rows.map((row) => row.share), 0);
  if (!rows.some((row) => row.count > 0)) {
    return <div className="fb-chart-empty">No answers yet.</div>;
  }
  return (
    <div className="fb-bars">
      {rows.map((row) => (
        <BarRow key={row.code} {...row} scale={scale} tone={tone} />
      ))}
    </div>
  );
}

/** Score bar for a 1-5 average, filled proportionally across the whole scale. */
function ScoreBar({ average }) {
  const tone = scoreTone(average);
  const width = Number.isFinite(average) ? ((average - 1) / 4) * 100 : 0;
  return (
    <span className="fb-score">
      <span className="fb-score-track">
        <span className={`fb-bar-fill tone-${tone}`} style={{ width: `${width}%` }} />
      </span>
      <span className="fb-score-value">{formatScore(average, 2)}</span>
    </span>
  );
}

export default function ParentFeedbackPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, isAdmin } = useAuth();

  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadKey, setLoadKey] = useState(0);

  const [yearFilter, setYearFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [commentKind, setCommentKind] = useState("all");
  const [commentSearch, setCommentSearch] = useState("");

  const [detail, setDetail] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError("");
      if (!user) {
        setError("You must be signed in to view parent feedback.");
        return;
      }
      if (!isAdmin) {
        setError('Access denied: requires admin role ("role: admin").');
        return;
      }

      setBusy(true);
      try {
        const data = await listParentSurveyResponses();
        if (!cancelled) setRows(data);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(e?.message || "Failed to load parent feedback.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user, isAdmin, loadKey]);

  const reload = () => setLoadKey((key) => key + 1);

  // Every figure on the page is computed over the same filtered set, so the
  // summary always describes exactly the responses listed below it.
  const responses = useMemo(() => {
    return rows.filter((row) => {
      if (row.archived !== showArchived) return false;
      if (yearFilter !== "all" && row.context.studentYear !== yearFilter) return false;
      if (subjectFilter !== "all" && !row.context.subjects.includes(subjectFilter)) {
        return false;
      }
      return true;
    });
  }, [rows, showArchived, yearFilter, subjectFilter]);

  const archivedCount = useMemo(
    () => rows.filter((row) => row.archived).length,
    [rows]
  );

  const stats = useMemo(() => headlineStats(responses), [responses]);
  const satisfaction = useMemo(() => satisfactionDistribution(responses), [responses]);
  const appUsage = useMemo(() => appUsageDistribution(responses), [responses]);
  const appBarriers = useMemo(() => appBarrierDistribution(responses), [responses]);
  const statements = useMemo(() => statementScores(responses), [responses]);

  // Worst first: the point of the page is to find what to fix next.
  const rankedStatements = useMemo(() => {
    return [...statements].sort((a, b) => {
      if (a.average === null) return 1;
      if (b.average === null) return -1;
      return a.average - b.average;
    });
  }, [statements]);

  const comments = useMemo(() => {
    const term = commentSearch.trim().toLowerCase();
    return writtenAnswers(responses).filter((entry) => {
      if (commentKind !== "all" && entry.kind !== commentKind) return false;
      if (!term) return true;
      return entry.text.toLowerCase().includes(term);
    });
  }, [responses, commentKind, commentSearch]);

  const followUps = useMemo(
    () => responses.filter((row) => row.followUp.requested),
    [responses]
  );

  function handleExport() {
    if (!responses.length) {
      toast.error("There is nothing to export for the current filters.");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    triggerBlobDownload(
      new Blob([rowsToCsv(responses)], { type: "text/csv;charset=utf-8;" }),
      `parent-feedback-${stamp}.csv`
    );
  }

  async function runAction(fn, successMessage) {
    setActionBusy(true);
    try {
      await fn();
      toast.success(successMessage);
      setDetail(null);
      reload();
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Could not update this response.");
    } finally {
      setActionBusy(false);
    }
  }

  const npsTone =
    stats.nps.score === null
      ? "neutral"
      : stats.nps.score >= 50
        ? "success"
        : stats.nps.score >= 0
          ? "warn"
          : "danger";

  return (
    <>
      <PageHeader
        title="Parent feedback"
        subtitle="Responses to the public parent feedback survey. Every figure below describes the responses matching the current filters."
        crumbs={[{ label: "Overview", href: "/" }, { label: "Parent feedback" }]}
        actions={
          <div className="row gap-2">
            <Button
              icon="download"
              onClick={handleExport}
              variant="secondary"
              disabled={busy}
            >
              Export CSV
            </Button>
            <Button onClick={() => navigate("/")} variant="secondary">
              Back to dashboard
            </Button>
          </div>
        }
      />

      {error ? (
        <div className="banner banner-danger">
          <div>
            <div className="banner-title">Could not load parent feedback</div>
            <div>{error}</div>
          </div>
        </div>
      ) : null}

      {!error ? (
        <>
          <div className="filter-bar">
            <select
              aria-label="Filter by year group"
              className="select"
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
            >
              <option value="all">All year groups</option>
              {STUDENT_YEAR_OPTIONS.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by subject"
              className="select"
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
            >
              <option value="all">All subjects</option>
              {SUBJECT_OPTIONS.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
            <Button
              onClick={() => setShowArchived((value) => !value)}
              variant={showArchived ? "primary" : "secondary"}
            >
              {showArchived ? "Viewing archived" : `Archived (${archivedCount})`}
            </Button>
          </div>

          {busy ? (
            <div className="route-inline-state">Loading parent feedback...</div>
          ) : null}

          {!busy && responses.length === 0 ? (
            <EmptyState icon="info" title="No responses yet">
              {showArchived
                ? "Nothing has been archived."
                : "Responses appear here as parents complete the survey at /parent-feedback."}
            </EmptyState>
          ) : null}

          {!busy && responses.length > 0 ? (
            <>
              <div className="grid grid-4 fb-stats">
                <StatCard
                  label="Responses"
                  value={stats.total}
                  icon="people"
                  foot={`${stats.followUps} asked for a reply`}
                />
                <StatCard
                  label="Overall satisfaction"
                  value={formatScore(stats.satisfaction, 2)}
                  icon="sparkles"
                  foot="out of 5"
                />
                <StatCard
                  label="Net promoter score"
                  value={stats.nps.score === null ? "-" : stats.nps.score}
                  icon="reports"
                  foot={`${stats.nps.promoters} promoters, ${stats.nps.detractors} detractors`}
                />
                <StatCard
                  label="App usefulness"
                  value={formatScore(stats.appUsefulness, 2)}
                  icon="grid"
                  foot={`from ${stats.appUserCount} app user${
                    stats.appUserCount === 1 ? "" : "s"
                  }`}
                />
              </div>

              <div className="fb-split">
                <div className="card">
                  <div className="card-head">
                    <div>
                      <h3>What parents rated us on</h3>
                      <div className="card-sub">
                        Worst first. "Did not agree" counts every answer of 3 or
                        below; "not sure" is left out of the average rather than
                        counted as neutral.
                      </div>
                    </div>
                  </div>
                  <div className="card-body flush">
                    <Table
                      columns={[
                        {
                          key: "statement",
                          header: "Statement",
                          render: (row) => (
                            <div className="row-meta fb-statement">
                              <span className="primary">{row.text}</span>
                              <span className="secondary">{row.section}</span>
                            </div>
                          ),
                        },
                        {
                          key: "score",
                          header: "Average",
                          render: (row) => <ScoreBar average={row.average} />,
                        },
                        {
                          key: "belowAgree",
                          header: "Did not agree",
                          render: (row) =>
                            row.belowAgree > 0 ? (
                              <Badge tone={row.belowAgree > row.answered / 4 ? "danger" : "warn"}>
                                {row.belowAgree} of {row.answered}
                              </Badge>
                            ) : (
                              <span className="cell-muted">None</span>
                            ),
                        },
                        {
                          key: "notSure",
                          header: "Not sure",
                          render: (row) =>
                            row.notSure > 0 ? row.notSure : <span className="cell-muted">-</span>,
                        },
                      ]}
                      getRowKey={(row) => row.id}
                      rows={rankedStatements}
                    />
                  </div>
                </div>

                <div className="fb-side">
                  <div className="card">
                    <div className="card-head">
                      <div>
                        <h3>Overall satisfaction</h3>
                        <div className="card-sub">
                          Average {formatScore(stats.satisfaction, 2)} out of 5
                        </div>
                      </div>
                    </div>
                    <div className="card-body">
                      <BarChart rows={satisfaction} />
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-head">
                      <div>
                        <h3>Recommendation</h3>
                        <div className="card-sub">
                          {stats.nps.answered} answered &middot; NPS{" "}
                          {stats.nps.score === null ? "-" : stats.nps.score}
                        </div>
                      </div>
                      <Badge tone={npsTone} dot>
                        {stats.nps.score === null
                          ? "No answers"
                          : stats.nps.score >= 50
                            ? "Strong"
                            : stats.nps.score >= 0
                              ? "Mixed"
                              : "Poor"}
                      </Badge>
                    </div>
                    <div className="card-body">
                      <BarChart
                        rows={[
                          {
                            code: "promoters",
                            label: "Promoters (9-10)",
                            count: stats.nps.promoters,
                            share: stats.nps.answered
                              ? stats.nps.promoters / stats.nps.answered
                              : 0,
                          },
                          {
                            code: "passives",
                            label: "Passives (7-8)",
                            count: stats.nps.passives,
                            share: stats.nps.answered
                              ? stats.nps.passives / stats.nps.answered
                              : 0,
                          },
                          {
                            code: "detractors",
                            label: "Detractors (0-6)",
                            count: stats.nps.detractors,
                            share: stats.nps.answered
                              ? stats.nps.detractors / stats.nps.answered
                              : 0,
                          },
                        ]}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="fb-split">
                <div className="card">
                  <div className="card-head">
                    <div>
                      <h3>Mobile app use</h3>
                      <div className="card-sub">
                        How often parents open the app, across all responses.
                      </div>
                    </div>
                  </div>
                  <div className="card-body">
                    <BarChart rows={appUsage} />
                  </div>
                </div>

                <div className="card">
                  <div className="card-head">
                    <div>
                      <h3>Why parents have not used the app</h3>
                      <div className="card-sub">
                        Among the{" "}
                        {appUsage.find((entry) => entry.code === "never")?.count || 0}{" "}
                        who said they never have.
                      </div>
                    </div>
                  </div>
                  <div className="card-body">
                    <BarChart rows={appBarriers} tone="warn" />
                  </div>
                </div>
              </div>

              {followUps.length ? (
                <div className="card">
                  <div className="card-head">
                    <div>
                      <h3>Parents waiting for a reply</h3>
                      <div className="card-sub">
                        These parents asked to be contacted about their feedback.
                      </div>
                    </div>
                    <Badge tone="warn">{followUps.length} to contact</Badge>
                  </div>
                  <div className="card-body flush">
                    <Table
                      columns={[
                        {
                          key: "name",
                          header: "Parent",
                          render: (row) => (
                            <div className="row-meta">
                              <span className="primary">{row.followUp.name || "-"}</span>
                              <span className="secondary">
                                {studentYearLabel(row.context.studentYear)}
                              </span>
                            </div>
                          ),
                        },
                        {
                          key: "email",
                          header: "Email",
                          render: (row) =>
                            row.followUp.email ? (
                              <a href={`mailto:${row.followUp.email}`}>
                                {row.followUp.email}
                              </a>
                            ) : (
                              "-"
                            ),
                        },
                        {
                          key: "recommendation",
                          header: "Recommendation",
                          render: (row) =>
                            row.recommendation === null ? (
                              "-"
                            ) : (
                              <Badge
                                tone={
                                  row.recommendation >= 9
                                    ? "success"
                                    : row.recommendation >= 7
                                      ? "warn"
                                      : "danger"
                                }
                              >
                                {row.recommendation}/10
                              </Badge>
                            ),
                        },
                        {
                          key: "submitted",
                          header: "Submitted",
                          render: (row) => formatDate(row.createdAtIso),
                        },
                      ]}
                      getRowKey={(row) => row.id}
                      onRowClick={(row) => setDetail(row)}
                      rows={followUps}
                    />
                  </div>
                </div>
              ) : null}

              <div className="card">
                <div className="card-head">
                  <div>
                    <h3>In their own words</h3>
                    <div className="card-sub">
                      {comments.length} written answer{comments.length === 1 ? "" : "s"}{" "}
                      from {responses.length} response
                      {responses.length === 1 ? "" : "s"}.
                    </div>
                  </div>
                </div>
                <div className="card-body">
                  <div className="fb-comment-filters">
                    <div className="field-search grow">
                      <Icon className="search-icon" name="search" size={16} />
                      <input
                        className="input"
                        placeholder="Search what parents wrote"
                        value={commentSearch}
                        onChange={(e) => setCommentSearch(e.target.value)}
                      />
                    </div>
                    <div className="fb-kind-filter" role="group" aria-label="Filter by question">
                      {COMMENT_KINDS.map(([key, label]) => (
                        <button
                          className={commentKind === key ? "active" : ""}
                          key={key}
                          onClick={() => setCommentKind(key)}
                          type="button"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {comments.length === 0 ? (
                    <EmptyState icon="info" title="No written answers">
                      Nothing matches the current filters.
                    </EmptyState>
                  ) : (
                    <div className="fb-comments">
                      {comments.map((entry) => (
                        <button
                          className="fb-comment"
                          key={entry.key}
                          onClick={() =>
                            setDetail(rows.find((row) => row.id === entry.responseId))
                          }
                          type="button"
                        >
                          <span className="fb-comment-head">
                            <Badge
                              tone={
                                entry.kind === "change"
                                  ? "warn"
                                  : entry.kind === "strengths"
                                    ? "success"
                                    : "info"
                              }
                            >
                              {entry.question}
                            </Badge>
                            <span className="fb-comment-meta">
                              {studentYearLabel(entry.studentYear)}
                              {entry.recommendation === null
                                ? ""
                                : ` · ${entry.recommendation}/10`}
                              {` · ${formatDate(entry.createdAtIso)}`}
                            </span>
                          </span>
                          <span className="fb-comment-text">{entry.text}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </>
      ) : null}

      {detail ? (
        <Modal
          open
          busy={actionBusy}
          title={`Response from ${formatDate(detail.createdAtIso)}`}
          subtitle={`${studentYearLabel(detail.context.studentYear)} · ${
            detail.context.subjects.map(subjectLabel).join(", ") || "No subjects"
          }`}
          onClose={() => {
            if (!actionBusy) setDetail(null);
          }}
          footer={null}
        >
          <dl className="dlist compact fb-detail-dlist">
            <dt>Overall satisfaction</dt>
            <dd>
              {detail.overallSatisfaction === null
                ? "-"
                : `${detail.overallSatisfaction}/5 — ${satisfactionLabel(
                    detail.overallSatisfaction
                  )}`}
            </dd>
            <dt>Would recommend</dt>
            <dd>
              {detail.recommendation === null ? "-" : `${detail.recommendation}/10`}
            </dd>
            {LESSON_QUESTIONS.map((question) => (
              <React.Fragment key={question.id}>
                <dt>{question.text}</dt>
                <dd>{ratingLabel(detail.lessons?.[question.id])}</dd>
              </React.Fragment>
            ))}
            {COMMUNICATION_QUESTIONS.map((question) => (
              <React.Fragment key={question.id}>
                <dt>{question.text}</dt>
                <dd>{ratingLabel(detail.communication?.[question.id])}</dd>
              </React.Fragment>
            ))}
            <dt>App use</dt>
            <dd>{appUsageLabel(detail.app.usage)}</dd>
            {detail.app.usage === "never" ? (
              <>
                <dt>Reason</dt>
                <dd>
                  {appBarrierLabel(detail.app.barrier)}
                  {detail.app.otherBarrier ? ` — ${detail.app.otherBarrier}` : ""}
                </dd>
              </>
            ) : (
              <>
                <dt>App usefulness</dt>
                <dd>
                  {detail.app.usefulness === null
                    ? "-"
                    : `${detail.app.usefulness}/5 — ${appUsefulnessLabel(
                        detail.app.usefulness
                      )}`}
                </dd>
              </>
            )}
          </dl>

          {[
            ["What Tenacity does well", detail.comments.strengths],
            ["The one change to make", detail.comments.change],
            ["Requested app improvement", detail.app.improvement],
          ]
            .filter(([, text]) => text)
            .map(([label, text]) => (
              <div key={label} style={{ marginTop: 16 }}>
                <div className="label mb-2">{label}</div>
                <div className="card-sub" style={{ whiteSpace: "pre-wrap" }}>
                  {text}
                </div>
              </div>
            ))}

          {detail.followUp.requested ? (
            <div className="banner banner-info" style={{ marginTop: 16 }}>
              <div>
                <div className="banner-title">Asked to be contacted</div>
                <div>
                  {detail.followUp.name}
                  {detail.followUp.email ? (
                    <>
                      {" — "}
                      <a href={`mailto:${detail.followUp.email}`}>
                        {detail.followUp.email}
                      </a>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="card-sub" style={{ marginTop: 16 }}>
              Submitted anonymously — no contact details were given.
            </div>
          )}

          <div
            className="row gap-2"
            style={{ justifyContent: "flex-end", marginTop: 24 }}
          >
            <Button
              disabled={actionBusy}
              onClick={() => setDetail(null)}
              variant="secondary"
            >
              Close
            </Button>
            <Button
              loading={actionBusy}
              onClick={() =>
                runAction(
                  () => setParentSurveyResponseArchived(detail.id, !detail.archived),
                  detail.archived ? "Response restored." : "Response archived."
                )
              }
              variant="secondary"
            >
              {detail.archived ? "Restore" : "Archive"}
            </Button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
