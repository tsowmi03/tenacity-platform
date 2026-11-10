import React, { useCallback, useEffect, useRef, useState } from "react";
import { browseBank, getBankImages, getBankOptions } from "../backend/resourcesApi";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import BankDrawer, { StatusBadge } from "../components/bank/BankDrawer";
import { BANKS, bankById, matchesStatus, sourceLine, statusesFor } from "../components/bank/bankConfig";

const THUMBNAIL_GROUP = 6;
const SKELETON_ROWS = 8;

function SearchFilter({ filter, onChange, value }) {
  const [draft, setDraft] = useState(value || "");
  const first = useRef(true);
  useEffect(() => setDraft(value || ""), [value]);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    const timer = setTimeout(() => onChange(draft.trim()), 350);
    return () => clearTimeout(timer);
    // Only the typed text should restart the wait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
  const id = `bank-filter-${filter.key}`;
  return (
    <div className="bank-filter">
      <label className="label" htmlFor={id}>{filter.label}</label>
      <input className="input" id={id} onChange={(event) => setDraft(event.target.value)} placeholder={filter.placeholder} type="search" value={draft} />
    </div>
  );
}

function SelectFilter({ filter, filters, onChange, options, value }) {
  const id = `bank-filter-${filter.key}`;
  const locked = Boolean(filter.dependsOn && !filters[filter.dependsOn]);
  return (
    <div className="bank-filter">
      <label className="label" htmlFor={id}>{filter.label}</label>
      <select
        className="select"
        disabled={locked}
        id={id}
        onChange={(event) => onChange(event.target.value === "" ? "" : filter.numeric ? Number(event.target.value) : event.target.value)}
        value={value ?? ""}
      >
        <option value="">{locked ? filter.emptyLabel : "All"}</option>
        {filter.choices(options, filters).map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
      </select>
    </div>
  );
}

function Thumb({ loaded, src }) {
  if (src) return <span className="bank-thumb"><img alt="" src={src} /></span>;
  return <span className={`bank-thumb empty${loaded ? "" : " loading"}`}><Icon name="file-text" size={18} /></span>;
}

function Row({ bank, onOpen, record, thumb, thumbLoaded }) {
  const subtitle = bank.subtitle?.(record);
  const chips = bank.chips(record).filter(Boolean);
  return (
    <li>
      <button className={`bank-row${record.status === "hidden" ? " muted-row" : ""}`} onClick={() => onOpen(record)} type="button">
        {record.hasImage ? <Thumb loaded={thumbLoaded} src={thumb} /> : null}
        <span className="bank-row-main">
          <span className="bank-row-title">{bank.title(record)}</span>
          {subtitle ? <span className="bank-row-sub">{subtitle}</span> : null}
          <span className="bank-row-meta">
            <span>{sourceLine(record)}</span>
            {chips.map((chip) => <span className="bank-tag" key={chip}>{chip}</span>)}
          </span>
        </span>
        <span className="bank-row-end">
          {record.openFlags > 0 ? <span className="bank-flag-count"><Icon name="alert" size={13} />{record.openFlags}</span> : null}
          <StatusBadge status={record.status} />
          <Icon className="bank-row-chevron" name="chevron-right" size={16} />
        </span>
      </button>
    </li>
  );
}

function resultLabel(bank, total, count) {
  const shown = total ?? count;
  const noun = bank.noun[shown === 1 ? 0 : 1];
  if (total === null || total === undefined) return count ? `Showing ${count} ${noun}` : "";
  return `${total.toLocaleString()} ${noun}`;
}

export default function QuestionBankPage() {
  const [bankId, setBankId] = useState(BANKS[0].id);
  const [status, setStatus] = useState("live");
  const [filters, setFilters] = useState({});
  const [cursors, setCursors] = useState([null]); // the cursor of each page reached so far
  const [options, setOptions] = useState(null);
  const [optionsError, setOptionsError] = useState("");
  const [result, setResult] = useState({ records: [], nextCursor: null, total: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [thumbs, setThumbs] = useState({});
  const [thumbsDone, setThumbsDone] = useState({});
  const [open, setOpen] = useState(null);
  const latest = useRef(0);

  const bank = bankById(bankId);
  const page = cursors.length;
  const cursor = cursors[cursors.length - 1];
  const filterKey = JSON.stringify(filters);

  const loadOptions = useCallback(() => {
    getBankOptions()
      .then((data) => { setOptions(data); setOptionsError(""); })
      .catch((err) => setOptionsError(err?.userMessage || err?.message || "Could not load the filters."));
  }, []);
  useEffect(loadOptions, [loadOptions]);

  useEffect(() => {
    const request = ++latest.current;
    setLoading(true);
    setError("");
    browseBank({ bank: bankId, status, filters, cursor })
      .then((data) => {
        if (request !== latest.current) return;
        setResult((current) => ({ ...data, total: data.total ?? (cursor ? current.total : null) }));
        setLoading(false);
      })
      .catch((err) => {
        if (request !== latest.current) return;
        setError(err?.userMessage || err?.message || "Could not load the bank.");
        setLoading(false);
      });
    // filterKey stands in for filters, which is a new object each change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankId, status, filterKey, cursor, retry]);

  // Thumbnails arrive a few at a time after the list, so the list never waits for images.
  useEffect(() => {
    if (!bank.images) return undefined;
    const wanted = result.records.filter((record) => record.hasImage && !(`${bankId}:${record.id}` in thumbs)).map((record) => record.id);
    if (!wanted.length) return undefined;
    let cancelled = false;
    (async () => {
      for (let start = 0; start < wanted.length && !cancelled; start += THUMBNAIL_GROUP) {
        const group = wanted.slice(start, start + THUMBNAIL_GROUP);
        let images = {};
        try {
          ({ images } = await getBankImages({ bank: bankId, ids: group }));
        } catch {
          images = {};
        }
        if (cancelled) return;
        const entries = group.map((id) => [`${bankId}:${id}`, images[id] || null]);
        setThumbs((current) => ({ ...current, ...Object.fromEntries(entries) }));
        setThumbsDone((current) => ({ ...current, ...Object.fromEntries(entries.map(([key]) => [key, true])) }));
      }
    })();
    return () => { cancelled = true; };
    // Keyed on the page of records; thumbs is only read to skip cached ones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.records, bankId]);

  function resetPaging() {
    setCursors([null]);
  }

  function chooseBank(id) {
    if (id === bankId) return;
    setBankId(id);
    setStatus("live");
    setFilters({});
    setResult({ records: [], nextCursor: null, total: null });
    resetPaging();
    setOpen(null);
  }

  function chooseStatus(value) {
    setStatus(value);
    resetPaging();
  }

  function setFilter(filter, value) {
    setFilters((current) => {
      const next = { ...current };
      if (value === "" || value === null || value === undefined) delete next[filter.key];
      else next[filter.key] = value;
      for (const other of bank.filters) if (other.dependsOn === filter.key) delete next[other.key];
      return next;
    });
    resetPaging();
  }

  function clearFilters() {
    setFilters({});
    resetPaging();
  }

  const onChanged = useCallback((record) => {
    setResult((current) => {
      const stillListed = matchesStatus(status, record);
      const present = current.records.some((row) => row.id === record.id);
      return {
        ...current,
        total: present && !stillListed && current.total !== null ? Math.max(0, current.total - 1) : current.total,
        records: stillListed
          ? current.records.map((row) => (row.id === record.id ? { ...row, ...record } : row))
          : current.records.filter((row) => row.id !== record.id),
      };
    });
    if (bank.flaggable) loadOptions();
  }, [bank.flaggable, loadOptions, status]);

  const hasFilters = Object.keys(filters).length > 0;
  const statuses = statusesFor(bank, options?.openFlags);
  const { records, nextCursor, total } = result;
  const showEmpty = !loading && !error && !records.length && !nextCursor;
  const label = resultLabel(bank, total, records.length);

  return (
    <>
      <PageHeader
        crumbs={[]}
        subtitle="Everything the generator can draw on. Hide what shouldn't be used and correct what's wrong."
        title="Question bank"
      />

      <div className="tabs bank-tabs" role="tablist" aria-label="Bank">
        {BANKS.map((entry) => (
          <button aria-selected={entry.id === bankId} className={`tab${entry.id === bankId ? " active" : ""}`} key={entry.id} onClick={() => chooseBank(entry.id)} role="tab" type="button">
            {entry.label}
          </button>
        ))}
      </div>

      {optionsError ? <div className="error mb-3" role="alert">{optionsError}</div> : null}

      <div className="bank-toolbar">
        <div className="bank-segment" role="radiogroup" aria-label="Status">
          {statuses.map((entry) => (
            <button aria-checked={entry.value === status} className={entry.value === status ? "on" : ""} key={entry.value} onClick={() => chooseStatus(entry.value)} role="radio" type="button">
              {entry.label}{" "}
              {entry.count ? <span className="bank-segment-count">{entry.count}</span> : null}
            </button>
          ))}
        </div>
        <div className="bank-result-label" aria-live="polite">{loading && !records.length ? "" : label}</div>
      </div>

      {bank.filters.length && options ? (
        <div className="bank-filters">
          {bank.filters.map((filter) => (filter.kind === "search" ? (
            <SearchFilter filter={filter} key={filter.key} onChange={(value) => setFilter(filter, value)} value={filters[filter.key]} />
          ) : (
            <SelectFilter filter={filter} filters={filters} key={filter.key} onChange={(value) => setFilter(filter, value)} options={options} value={filters[filter.key]} />
          )))}
          {hasFilters ? <Button className="bank-clear" onClick={clearFilters} size="sm" variant="ghost">Clear filters</Button> : null}
        </div>
      ) : null}

      {error ? (
        <div className="banner banner-danger mb-5" role="alert">
          <div className="grow">
            <div className="banner-title">Could not load the bank</div>
            <div>{error}</div>
          </div>
          <Button onClick={() => setRetry((count) => count + 1)} size="sm" variant="secondary">Try again</Button>
        </div>
      ) : null}

      <div className={`card bank-list-card${loading && records.length ? " refreshing" : ""}`}>
        {loading && !records.length ? (
          <ul aria-busy="true" className="bank-list">
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <li className="bank-row skeleton-row" key={index}>
                {bank.id === "maths" ? <span className="skeleton bank-thumb" /> : null}
                <span className="bank-row-main"><span className="skeleton bank-skeleton-line" /><span className="skeleton bank-skeleton-line short" /></span>
              </li>
            ))}
          </ul>
        ) : null}
        {showEmpty ? (
          <EmptyState icon="search" title={status === "flagged" ? "No open flags" : `No ${bank.noun[1]} found`}>
            {hasFilters ? "Try removing a filter." : status === "hidden" ? `Nothing here has been hidden.` : null}
          </EmptyState>
        ) : null}
        {records.length ? (
          <ul className="bank-list">
            {records.map((record) => (
              <Row
                bank={bank}
                key={record.id}
                onOpen={setOpen}
                record={record}
                thumb={thumbs[`${bankId}:${record.id}`]}
                thumbLoaded={Boolean(thumbsDone[`${bankId}:${record.id}`])}
              />
            ))}
          </ul>
        ) : null}
        {!records.length && !loading && nextCursor ? (
          <div className="bank-scan-note">No matches in this stretch of the bank. Keep looking to search further.</div>
        ) : null}
      </div>

      {page > 1 || nextCursor ? (
        <nav aria-label="Pages" className="bank-pager">
          <Button disabled={page <= 1 || loading} icon="chevron-left" onClick={() => setCursors((current) => current.slice(0, -1))} size="sm" variant="secondary">Previous</Button>
          <span className="bank-muted">Page {page}</span>
          <Button disabled={!nextCursor || loading} iconRight="chevron-right" onClick={() => setCursors((current) => [...current, nextCursor])} size="sm" variant="secondary">
            {records.length ? "Next" : "Keep looking"}
          </Button>
        </nav>
      ) : null}

      {open && options ? (
        <BankDrawer bank={bank} onChanged={onChanged} onClose={() => setOpen(null)} options={options} recordId={open.id} summary={open} />
      ) : null}
    </>
  );
}
