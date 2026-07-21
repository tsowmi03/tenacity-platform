/* =========================================================
   Attendance maintenance
   ========================================================= */

const Attendance = ({ route }) => {
  const toast = useToast();
  const [scope, setScope] = useState("class"); // class | term
  const [classId, setClassId] = useState(CLASSES[0]?.id || "");
  const [termId, setTermId] = useState(TERMS.find(t => t.status === "active")?.id || TERMS[0]?.id);
  const [fromDate, setFromDate] = useState(TODAY.toISOString().slice(0, 10));
  const [overwrite, setOverwrite] = useState(false);
  const [selectedClasses, setSelectedClasses] = useState([]);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const run = () => {
    setBusy(true);
    setTimeout(() => {
      const considered = scope === "class" ? 10 : selectedClasses.length === 0 ? 70 : selectedClasses.length * 10;
      const skipped = overwrite ? 0 : Math.floor(considered * 0.2);
      const written = considered - skipped;
      setLastResult({ scope, classId, termId, considered, written, skipped, ranAt: new Date() });
      setBusy(false);
      toast.success("Attendance run complete", `Wrote ${written} of ${considered} docs. Skipped ${skipped} existing.`);
    }, 1200);
  };

  return (
    <Fragment>
      <PageHead
        title="Attendance maintenance"
        sub="Repair or regenerate weekly attendance documents. Daily marking stays in the Flutter app."
      />

      <Banner kind="info" title="When to use this">
        <div className="mt-3"></div>
        Use class-level generation for newly-created classes or repairs. Use term-level regeneration after rolling over a term, fixing class day/time, or backfilling attendance.
      </Banner>

      <div className="card mt-5">
        <div className="card-head"><h3><span className="brand-stripe"></span>1. Pick a scope</h3></div>
        <div className="card-body">
          <div className="grid grid-2 gap-3">
            {[
              { id: "class", icon: "classes", label: "Generate for one class", sub: "adminGenerateAttendanceForClass — repair or set up a specific class." },
              { id: "term", icon: "calendar", label: "Regenerate for a term", sub: "adminRegenerateAttendanceForTerm — term-level setup or rollover." },
            ].map((opt) => (
              <button key={opt.id} onClick={() => setScope(opt.id)} style={{
                textAlign: "left", padding: "16px 18px", borderRadius: "var(--r-md)",
                border: `1.5px solid ${scope === opt.id ? "var(--brand-navy)" : "var(--ink-300)"}`,
                background: scope === opt.id ? "var(--brand-blue-50)" : "var(--white)",
                cursor: "pointer", transition: "all var(--dur)",
              }}>
                <div className="row gap-3 mb-2">
                  <div style={{width: 32, height: 32, borderRadius: "var(--r-sm)", background: scope === opt.id ? "var(--brand-navy)" : "var(--ink-100)", color: scope === opt.id ? "var(--white)" : "var(--ink-700)", display: "grid", placeItems: "center"}}>
                    <Icon name={opt.icon} size={16}/>
                  </div>
                  <span className="weight-600">{opt.label}</span>
                </div>
                <div className="text-sm muted text-mono">{opt.sub}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-head"><h3><span className="brand-stripe"></span>2. Set parameters</h3></div>
        <div className="card-body">
          {scope === "class" ? (
            <div className="grid grid-2 gap-4">
              <div className="field"><label className="label">Class <span className="req">*</span></label>
                <select className="select" value={classId} onChange={(e) => setClassId(e.target.value)}>
                  {CLASSES.map((c) => <option key={c.id} value={c.id}>{c.type} · {c.day} {c.startTime}</option>)}
                </select>
              </div>
              <div className="field"><label className="label">From date <span className="req">*</span></label>
                <input className="input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}/>
              </div>
              <div className="field"><label className="label">Terms</label>
                <select className="select" multiple defaultValue={[termId]} style={{height: 100}}>
                  {TERMS.map((t) => <option key={t.id} value={t.id}>{t.year} Term {t.termNum} ({t.weeksNum}w)</option>)}
                </select>
                <span className="hint">Leave selection on the active term unless backfilling.</span>
              </div>
              <div className="field">
                <label className="label">Overwrite existing</label>
                <div className="row between" style={{padding: "10px 14px", background: overwrite ? "var(--warn-100)" : "var(--ink-50)", borderRadius: "var(--r-md)", border: overwrite ? "1px solid rgba(197,138,30,0.3)" : "none"}}>
                  <span className="text-sm">{overwrite ? "Will replace existing attendance lists." : "Skips weeks that already have docs."}</span>
                  <div className={`switch ${overwrite ? "on" : ""}`} onClick={() => setOverwrite(!overwrite)}/>
                </div>
              </div>
            </div>
          ) : (
            <div className="col gap-4">
              <div className="grid grid-2 gap-4">
                <div className="field"><label className="label">Term <span className="req">*</span></label>
                  <select className="select" value={termId} onChange={(e) => setTermId(e.target.value)}>
                    {TERMS.map((t) => <option key={t.id} value={t.id}>{t.year} Term {t.termNum} ({t.weeksNum}w · {t.status})</option>)}
                  </select>
                </div>
                <div className="field"><label className="label">From date <span className="opt">defaults to term start</span></label>
                  <input className="input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}/>
                </div>
              </div>

              <div className="field">
                <label className="label">Classes to include <span className="opt">leave empty for all classes</span></label>
                <div className="grid grid-2 gap-2">
                  {CLASSES.map((c) => (
                    <label key={c.id} className="row gap-2" style={{padding: "8px 12px", background: selectedClasses.includes(c.id) ? "var(--brand-blue-50)" : "var(--ink-50)", borderRadius: "var(--r-sm)", cursor: "pointer", border: `1px solid ${selectedClasses.includes(c.id) ? "var(--brand-blue)" : "transparent"}`}}>
                      <input type="checkbox" checked={selectedClasses.includes(c.id)} onChange={(e) => setSelectedClasses(e.target.checked ? [...selectedClasses, c.id] : selectedClasses.filter(x => x !== c.id))}/>
                      <span className="text-sm">{c.type} · {c.day}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="row between" style={{padding: "10px 14px", background: overwrite ? "var(--warn-100)" : "var(--ink-50)", borderRadius: "var(--r-md)", border: overwrite ? "1px solid rgba(197,138,30,0.3)" : "none"}}>
                <div>
                  <div className="weight-600">Overwrite existing</div>
                  <div className="text-xs muted">{overwrite ? "Existing attendance lists will be replaced." : "Existing weeks are skipped."}</div>
                </div>
                <div className={`switch ${overwrite ? "on" : ""}`} onClick={() => setOverwrite(!overwrite)}/>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-head"><h3><span className="brand-stripe"></span>3. Review and run</h3></div>
        <div className="card-body">
          <div className="grid grid-3 gap-4 mb-4">
            <div>
              <div className="text-xs muted weight-700" style={{textTransform: "uppercase", letterSpacing: "0.08em"}}>Scope</div>
              <div className="weight-600 mt-1">{scope === "class" ? "One class" : "Whole term"}</div>
            </div>
            <div>
              <div className="text-xs muted weight-700" style={{textTransform: "uppercase", letterSpacing: "0.08em"}}>Target</div>
              <div className="weight-600 mt-1">{scope === "class" ? findClass(classId)?.type : `${termId} (${selectedClasses.length === 0 ? "all classes" : selectedClasses.length + " classes"})`}</div>
            </div>
            <div>
              <div className="text-xs muted weight-700" style={{textTransform: "uppercase", letterSpacing: "0.08em"}}>From</div>
              <div className="weight-600 mt-1">{fmt.date(new Date(fromDate))}</div>
            </div>
          </div>

          <div className="row gap-2" style={{justifyContent: "flex-end"}}>
            <Button variant="secondary" onClick={() => { setLastResult(null); setSelectedClasses([]); setOverwrite(false); }}>Reset</Button>
            <Button variant="primary" icon="play" onClick={run} loading={busy}>Run attendance {scope === "class" ? "generation" : "regeneration"}</Button>
          </div>
        </div>
      </div>

      {lastResult && (
        <div className="card mt-4">
          <div className="card-head">
            <h3><span className="brand-stripe"></span>Last run</h3>
            <span className="text-sm muted">{fmt.relTime(lastResult.ranAt)}</span>
          </div>
          <div className="card-body">
            <div className="grid grid-3 gap-4">
              <div>
                <div className="text-xs muted weight-700" style={{textTransform: "uppercase", letterSpacing: "0.08em"}}>Considered</div>
                <div style={{fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 700}}>{lastResult.considered}</div>
              </div>
              <div>
                <div className="text-xs muted weight-700" style={{textTransform: "uppercase", letterSpacing: "0.08em"}}>Written</div>
                <div style={{fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 700, color: "var(--success-700)"}}>{lastResult.written}</div>
              </div>
              <div>
                <div className="text-xs muted weight-700" style={{textTransform: "uppercase", letterSpacing: "0.08em"}}>Skipped existing</div>
                <div style={{fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 700, color: "var(--ink-500)"}}>{lastResult.skipped}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Fragment>
  );
};

window.Views = Object.assign(window.Views || {}, { Attendance });
