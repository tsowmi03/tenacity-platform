import React, { useEffect, useMemo, useState } from "react";
import { getBankGaps } from "../../backend/resourcesApi";
import Button from "../Button";
import EmptyState from "../EmptyState";
import { humanise } from "./bankConfig";

// RES-74. Where the maths bank has no diagram to offer. Everything here comes
// from one summary document a daily job writes; the page never reads the bank.

export const FIX_LABELS = {
  add_material: "Add Drive material",
  extract_more: "Extract more pages",
  answer_check: "Answer check problem",
  review_crops: "Review the crops",
  generator: "Question couldn't be swapped",
  bank_step_failed: "Bank step failed",
};

const FIX_HINTS = {
  add_material: "The bank has little or nothing for this. Add textbooks or papers that cover it to Drive.",
  extract_more: "The bank has questions here, but none suited. More pages or more variety would help.",
  answer_check: "A bank diagram was found, but its answer could not be confirmed.",
  review_crops: "The diagram found was not usable as printed.",
  generator: "The generated question could not take a bank diagram. Not a gap in the bank.",
  bank_step_failed: "The bank step failed or ran out of time. Not a gap in the bank.",
};

const FIX_TONE = { add_material: "danger", extract_more: "warn", answer_check: "info", review_crops: "info", generator: "neutral", bank_step_failed: "neutral" };

export const REASON_LABELS = {
  no_candidates: "Nothing found",
  none_suitable: "None suited",
  answer_check: "Answer check",
  crop_unfit: "Crop unusable",
  not_swappable: "Not swappable",
  failed: "Step failed",
};

const INITIAL_ROWS = 12;

function formatUpdated(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function percent(part, whole) {
  return whole ? `${Math.round((part / whole) * 100)}%` : "0%";
}

// The bank's category ids read as code ("shape_2d"); these are the words a tutor would use.
const TYPE_LABELS = {
  shape_2d: "2D shapes", solid_3d: "3D solids", scale_drawing: "Scale drawings", right_triangle: "Right-angled triangles",
  non_right_triangle: "Non-right-angled triangles", elevation_bearings: "Elevation and bearings", angle_relationships: "Angle relationships",
  congruence_similarity: "Congruence and similarity", circle_geometry: "Circle geometry", transformations: "Transformations",
  number_plane: "Number plane", straight_line: "Straight-line graphs", parabola: "Parabolas", other_curve: "Other curves",
  trig_graph: "Trigonometric graphs", calculus_graph: "Calculus graphs", region_inequality: "Inequalities and regions",
  data_display: "Data displays", normal_curve: "Normal curves", probability_diagram: "Probability diagrams", network: "Networks",
  vectors: "Vectors", mechanics: "Mechanics", other: "Other",
};
export const typeLabel = (type) => TYPE_LABELS[type] || humanise(type);

function categoryOf(row) {
  if (!row.bankDiagramType) return "Not in the bank's categories";
  return row.bankSkill ? `${typeLabel(row.bankDiagramType)}: ${humanise(row.bankSkill).toLowerCase()}` : typeLabel(row.bankDiagramType);
}

function Stat({ label, value, note }) {
  return (
    <div className="bank-gap-stat">
      <div className="bank-gap-stat-value">{value}</div>
      <div className="bank-gap-stat-label">{label}</div>
      {note ? <div className="bank-muted">{note}</div> : null}
    </div>
  );
}

function Reasons({ reasons }) {
  const entries = Object.entries(reasons || {}).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return <span className="bank-muted">—</span>;
  return (
    <span className="bank-gap-reasons">
      {entries.map(([reason, count]) => <span className="bank-tag" key={reason}>{REASON_LABELS[reason] || humanise(reason)}{count > 1 ? ` ×${count}` : ""}</span>)}
    </span>
  );
}

function DemandTable({ rows, showFix, thin }) {
  return (
    <div className="table-wrap">
      <table className="table bank-gap-table">
        <thead>
          <tr>
            <th scope="col">Year</th>
            <th scope="col">What was needed</th>
            <th className="num" scope="col">Needed</th>
            <th className="num" scope="col">From bank</th>
            <th className="num" scope="col">Drawn</th>
            <th scope="col">Why drawn</th>
            <th className="num" scope="col">In bank</th>
            {showFix ? <th scope="col">Likely fix</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.year}|${row.bankDiagramType}|${row.bankSkill}`}>
              <td>Year {row.year}</td>
              <td>
                <div className="bank-gap-category">{categoryOf(row)}</div>
                {row.skills?.length ? <div className="bank-muted">{row.skills.map((skill) => skill.name).join("; ")}</div> : null}
              </td>
              <td className="num">{row.needed}</td>
              <td className="num">{row.used}</td>
              <td className="num">{row.drawn ? <strong>{row.drawn}</strong> : 0}</td>
              <td><Reasons reasons={row.reasons} /></td>
              <td className={`num${row.supply !== null && row.supply < thin ? " bank-gap-thin" : ""}`}>{row.supply === null || row.supply === undefined ? "—" : row.supply.toLocaleString()}</td>
              {showFix ? (
                <td>{row.fix ? <span className={`badge badge-${FIX_TONE[row.fix] || "neutral"}`} title={FIX_HINTS[row.fix]}>{FIX_LABELS[row.fix] || humanise(row.fix)}</span> : null}</td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SupplyTable({ summary }) {
  const types = useMemo(() => Object.entries(summary.supply.byType || {}).sort((a, b) => b[1].total - a[1].total), [summary]);
  const [type, setType] = useState("");
  const years = summary.years || [5, 6, 7, 8, 9, 10, 11, 12];
  const thin = summary.thinSupply ?? 10;
  const rows = type
    ? Object.entries(summary.supply.byType[type]?.skills || {}).sort((a, b) => b[1].total - a[1].total).map(([name, cell]) => ({ name: humanise(name), cell }))
    : types.map(([name, cell]) => ({ name: typeLabel(name), cell }));
  return (
    <>
      <div className="bank-gap-supply-head">
        <div className="bank-filter">
          <label className="label" htmlFor="bank-gap-type">Diagram type</label>
          <select className="select" id="bank-gap-type" onChange={(event) => setType(event.target.value)} value={type}>
            <option value="">All types</option>
            {types.map(([name]) => <option key={name} value={name}>{typeLabel(name)}</option>)}
          </select>
        </div>
        <div className="bank-muted">Highlighted cells hold fewer than {thin} questions. A question for Years 9–10 counts in both.</div>
      </div>
      <div className="table-wrap">
        <table className="table bank-gap-table">
          <thead>
            <tr>
              <th scope="col">{type ? "Skill" : "Diagram type"}</th>
              {years.map((year) => <th className="num" key={year} scope="col">Y{year}</th>)}
              <th className="num" scope="col">All</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ name, cell }) => (
              <tr key={name}>
                <td>{name}</td>
                {years.map((year) => {
                  const count = cell.byYear?.[year] || 0;
                  return <td className={`num${count < thin ? " bank-gap-thin" : ""}`} key={year}>{count ? count.toLocaleString() : "·"}</td>;
                })}
                <td className="num"><strong>{cell.total.toLocaleString()}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function BankGapsPanel() {
  const [state, setState] = useState({ loading: true, error: "", summary: null });
  const [retry, setRetry] = useState(0);
  const [allGaps, setAllGaps] = useState(false);
  const [allDemand, setAllDemand] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: "" }));
    getBankGaps()
      .then(({ summary }) => { if (!cancelled) setState({ loading: false, error: "", summary }); })
      .catch((err) => { if (!cancelled) setState({ loading: false, error: err?.userMessage || err?.message || "Could not load the summary.", summary: null }); });
    return () => { cancelled = true; };
  }, [retry]);

  if (state.loading) {
    return <div aria-busy="true" className="card bank-gap-card"><div className="skeleton bank-skeleton-block" /><div className="skeleton bank-skeleton-line" /></div>;
  }
  if (state.error) {
    return (
      <div className="banner banner-danger" role="alert">
        <div className="grow"><div className="banner-title">Could not load the gaps</div><div>{state.error}</div></div>
        <Button onClick={() => setRetry((count) => count + 1)} size="sm" variant="secondary">Try again</Button>
      </div>
    );
  }
  const { summary } = state;
  if (!summary) {
    return <div className="card bank-gap-card"><EmptyState icon="clock" title="No summary yet">The summary is rebuilt every night. It will appear here after the next run.</EmptyState></div>;
  }

  const { totals, rows } = summary.demand;
  const thin = summary.thinSupply ?? 10;
  const gaps = allGaps ? summary.gaps : summary.gaps.slice(0, INITIAL_ROWS);
  const demand = allDemand ? rows : rows.slice(0, INITIAL_ROWS);

  return (
    <div className="bank-gaps">
      <div className="bank-gap-stats">
        <Stat label="live maths questions in the bank" value={summary.supply.total.toLocaleString()} />
        <Stat label={`diagram questions in the last ${summary.windowDays} days`} note={`${summary.jobs} maths ${summary.jobs === 1 ? "resource" : "resources"}`} value={totals.slots.toLocaleString()} />
        <Stat label="came from the bank" note={`${totals.used.toLocaleString()} questions`} value={percent(totals.used, totals.slots)} />
        <Stat label="were drawn instead" note={`${totals.drawn.toLocaleString()} questions`} value={percent(totals.drawn, totals.slots)} />
      </div>
      <div className="bank-muted bank-gap-updated">Updated {formatUpdated(summary.updatedAt) || "recently"}. Rebuilt every night.</div>

      <section aria-labelledby="bank-gaps-heading" className="card bank-gap-card">
        <h2 className="bank-gap-title" id="bank-gaps-heading">Gaps</h2>
        <p className="bank-muted">Where a diagram was drawn because the bank had none to use, most often first.</p>
        {summary.gaps.length ? <DemandTable rows={gaps} showFix thin={thin} /> : <EmptyState icon="check-circle" title="Nothing was drawn">Every diagram question in this period came from the bank.</EmptyState>}
        {summary.gaps.length > INITIAL_ROWS ? (
          <Button className="bank-gap-more" onClick={() => setAllGaps((value) => !value)} size="sm" variant="ghost">{allGaps ? "Show fewer" : `Show all ${summary.gaps.length}`}</Button>
        ) : null}
      </section>

      <section aria-labelledby="bank-demand-heading" className="card bank-gap-card">
        <h2 className="bank-gap-title" id="bank-demand-heading">Demand</h2>
        <p className="bank-muted">What resources asked for, most often first, and how much of it the bank supplied.</p>
        {rows.length ? <DemandTable rows={demand} thin={thin} /> : <EmptyState icon="search" title="No maths resources in this period" />}
        {rows.length > INITIAL_ROWS ? (
          <Button className="bank-gap-more" onClick={() => setAllDemand((value) => !value)} size="sm" variant="ghost">{allDemand ? "Show fewer" : `Show all ${rows.length}`}</Button>
        ) : null}
      </section>

      <section aria-labelledby="bank-supply-heading" className="card bank-gap-card">
        <h2 className="bank-gap-title" id="bank-supply-heading">Supply</h2>
        <p className="bank-muted">Live bank questions by diagram type and school year.</p>
        <SupplyTable summary={summary} />
      </section>
    </div>
  );
}
