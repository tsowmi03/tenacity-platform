import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../AuthProvider";
import {
  REFERRAL_STATUS_OPTIONS,
  listReferrals,
  referralStatusLabel,
  referralStatusTone,
  setReferralRewardApplied,
  setReferralStatus,
} from "../backend/referralsApi";
import { listUsers } from "../backend/usersApi";
import Badge from "../components/Badge";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";
import Table from "../components/Table";
import { useToast } from "../components/ToastProvider";

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

/**
 * Referrals from parents' referral links (TP-33). An admin decides whether each
 * one counts and ticks off the reward once they've applied it by hand on both
 * families' invoices. Nothing on this page changes an invoice.
 */
export default function ReferralsPage() {
  const toast = useToast();
  const { user, isAdmin } = useAuth();

  const [rows, setRows] = useState([]);
  const [names, setNames] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadKey, setLoadKey] = useState(0);
  const [tab, setTab] = useState("pending");
  const [actionId, setActionId] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError("");
      if (!user) {
        setError("You must be signed in to view referrals.");
        return;
      }
      if (!isAdmin) {
        setError('Access denied: requires admin role ("role: admin").');
        return;
      }

      setBusy(true);
      try {
        const [referrals, parents] = await Promise.all([
          listReferrals(),
          listUsers({ role: "parent" }),
        ]);
        if (cancelled) return;
        setRows(referrals);
        setNames(
          Object.fromEntries(parents.map((parent) => [parent.id, parent.displayName]))
        );
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(e?.message || "Failed to load referrals.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user, isAdmin, loadKey]);

  const counts = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({ ...acc, [row.status]: (acc[row.status] || 0) + 1 }),
        {}
      ),
    [rows]
  );

  const visibleRows = useMemo(() => rows.filter((row) => row.status === tab), [rows, tab]);

  // A successful referral whose reward hasn't been ticked off yet is the one
  // thing on this page that is still owed to a family.
  const rewardsOwed = useMemo(
    () => rows.filter((row) => row.status === "successful" && !row.rewardApplied).length,
    [rows]
  );

  const nameOf = (uid) => names[uid] || "Unknown parent";

  async function runAction(row, fn, successMessage) {
    setActionId(row.id);
    try {
      await fn();
      toast.success(successMessage);
      setLoadKey((key) => key + 1);
    } catch (e) {
      console.error(e);
      toast.error(e?.userMessage || e?.message || "Could not update this referral.");
    } finally {
      setActionId("");
    }
  }

  const columns = [
    {
      key: "referrer",
      header: "Referred by",
      mobile: "title",
      render: (row) => (
        <Link to={`/people/parents/${row.referrerParentId}`}>
          {nameOf(row.referrerParentId)}
        </Link>
      ),
    },
    {
      key: "newFamily",
      header: "New family",
      render: (row) => (
        <span className="row gap-2">
          <Link to={`/people/parents/${row.newParentId}`}>
            {nameOf(row.newParentId)}
          </Link>
          {row.newParentExisted ? <Badge tone="warn">Existing family</Badge> : null}
        </span>
      ),
    },
    {
      key: "enrolments",
      header: "Enrolments",
      render: (row) =>
        row.enrolmentIds.length ? (
          <span className="row gap-2" style={{ flexWrap: "wrap" }}>
            {row.enrolmentIds.map((enrolmentId, index) => (
              <Link key={enrolmentId} to={`/enrolments/${enrolmentId}`}>
                {row.enrolmentIds.length > 1 ? `Child ${index + 1}` : "View"}
              </Link>
            ))}
          </span>
        ) : (
          "-"
        ),
    },
    { key: "date", header: "Accepted", render: (row) => formatDate(row.createdAtIso) },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <span className="row gap-2">
          <Badge tone={referralStatusTone(row.status)}>{referralStatusLabel(row.status)}</Badge>
          {row.status === "successful" ? (
            row.rewardApplied ? (
              <Badge tone="success">Reward applied</Badge>
            ) : (
              <Badge tone="warn">Reward owed</Badge>
            )
          ) : null}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (row) => {
        const disabled = Boolean(actionId);
        if (row.status === "pending") {
          return (
            <span className="row gap-2">
              <Button
                disabled={disabled}
                onClick={() =>
                  runAction(row, () => setReferralStatus(row.id, "successful"), "Marked successful.")
                }
                size="sm"
              >
                Mark successful
              </Button>
              <Button
                disabled={disabled}
                onClick={() =>
                  runAction(row, () => setReferralStatus(row.id, "rejected"), "Referral rejected.")
                }
                size="sm"
                variant="secondary"
              >
                Reject
              </Button>
            </span>
          );
        }
        return (
          <span className="row gap-2">
            {row.status === "successful" ? (
              <Button
                disabled={disabled}
                onClick={() =>
                  runAction(
                    row,
                    () => setReferralRewardApplied(row.id, !row.rewardApplied),
                    row.rewardApplied ? "Reward un-marked." : "Reward marked as applied."
                  )
                }
                size="sm"
                variant={row.rewardApplied ? "secondary" : "primary"}
              >
                {row.rewardApplied ? "Un-mark reward" : "Reward applied"}
              </Button>
            ) : null}
            <Button
              disabled={disabled || (row.status === "successful" && row.rewardApplied)}
              onClick={() =>
                runAction(row, () => setReferralStatus(row.id, "pending"), "Moved back to pending.")
              }
              size="sm"
              variant="secondary"
            >
              Back to pending
            </Button>
          </span>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Referrals"
        subtitle="Families who enrolled through another parent's referral link. Mark each one, then tick off the reward once you've applied $10/hr off for a term on both families' invoices."
        crumbs={[{ label: "Overview", href: "/" }, { label: "Referrals" }]}
      />

      {error ? (
        <div className="banner banner-danger">
          <div>
            <div className="banner-title">Could not load referrals</div>
            <div>{error}</div>
          </div>
        </div>
      ) : null}

      {!error && rewardsOwed > 0 ? (
        <div className="banner banner-warn">
          <div>
            <div className="banner-title">
              {rewardsOwed} reward{rewardsOwed === 1 ? "" : "s"} still to apply
            </div>
            <div>Successful referrals whose discount hasn't been ticked off yet.</div>
          </div>
        </div>
      ) : null}

      {!error ? (
        <>
          <div className="tabs">
            {REFERRAL_STATUS_OPTIONS.map((option) => (
              <button
                className={`tab ${tab === option.code ? "active" : ""}`}
                disabled={busy}
                key={option.code}
                onClick={() => setTab(option.code)}
                type="button"
              >
                {option.label}
                <span className="count">{counts[option.code] || 0}</span>
              </button>
            ))}
          </div>

          <div className="card">
            <div className="card-body flush">
              {busy ? <div className="route-inline-state">Loading referrals...</div> : null}
              {!busy ? (
                visibleRows.length === 0 ? (
                  <EmptyState icon="people" title="No referrals here">
                    Referrals appear once you accept an enrolment that came through a parent's
                    referral link.
                  </EmptyState>
                ) : (
                  <Table columns={columns} getRowKey={(row) => row.id} rows={visibleRows} />
                )
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
