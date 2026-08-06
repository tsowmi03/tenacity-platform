import { useState } from "react";
import type { GetServerSideProps } from "next";
import Head from "@modules/common/components/head";
import Link from "next/link";
import {
  uidFromUnsubscribeToken,
  unsubscribeSecret,
} from "@lib/unsubscribeToken";

type Props = {
  token: string | null;
  valid: boolean;
};

type Status = "idle" | "working" | "unsubscribed" | "resubscribed" | "error";

/**
 * The visible unsubscribe link from the weekly parent email.
 *
 * The opt-out is applied on an explicit click rather than on page load, so that
 * link scanners and inbox prefetchers cannot unsubscribe someone who never
 * asked to leave. One-click clients use the POST API route instead.
 */
export default function Unsubscribe({ token, valid }: Props) {
  const [status, setStatus] = useState<Status>("idle");

  const submit = async (resubscribe: boolean) => {
    setStatus("working");
    try {
      const response = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, resubscribe }),
      });
      if (!response.ok) throw new Error("Request failed");
      setStatus(resubscribe ? "resubscribed" : "unsubscribed");
    } catch {
      setStatus("error");
    }
  };

  return (
    <>
      <Head
        title="Email preferences"
        description="Manage whether you receive the Tenacity Tutoring weekly update."
      />
      <main className="reg-section">
        <div className="wrap">
          <div className="reg-shell">
            <div className="reg-card">
              <div className="reg-done show">
                {!valid ? (
                  <>
                    <h2>This link is no longer valid</h2>
                    <p>
                      We couldn&apos;t check your email preferences from that
                      link. Email us and we&apos;ll update them for you.
                    </p>
                    <div className="rd-actions">
                      <a
                        className="btn btn-navy btn-lg"
                        href="mailto:enquiries@tenacitytutoring.com?subject=Email%20preferences"
                      >
                        Email us
                      </a>
                      <Link href="/" className="btn btn-outline btn-lg">
                        Back to home
                      </Link>
                    </div>
                  </>
                ) : null}

                {valid && (status === "idle" || status === "working") ? (
                  <>
                    <h2>Unsubscribe from weekly updates</h2>
                    <p>
                      You&apos;ll stop receiving the weekly parent email. You
                      will still get important messages about your child&apos;s
                      lessons, invoices and account.
                    </p>
                    <div className="rd-actions">
                      <button
                        type="button"
                        className="btn btn-navy btn-lg"
                        onClick={() => submit(false)}
                        disabled={status === "working"}
                      >
                        {status === "working"
                          ? "Updating…"
                          : "Unsubscribe me"}
                      </button>
                      <Link href="/" className="btn btn-outline btn-lg">
                        Keep receiving them
                      </Link>
                    </div>
                  </>
                ) : null}

                {status === "unsubscribed" ? (
                  <>
                    <h2>You&apos;ve been unsubscribed</h2>
                    <p>
                      You won&apos;t receive the weekly update again. Changed
                      your mind?
                    </p>
                    <div className="rd-actions">
                      <button
                        type="button"
                        className="btn btn-outline btn-lg"
                        onClick={() => submit(true)}
                      >
                        Resubscribe
                      </button>
                      <Link href="/" className="btn btn-navy btn-lg">
                        Back to home
                      </Link>
                    </div>
                  </>
                ) : null}

                {status === "resubscribed" ? (
                  <>
                    <h2>You&apos;re back on the list</h2>
                    <p>You&apos;ll receive the weekly update again.</p>
                    <div className="rd-actions">
                      <Link href="/" className="btn btn-navy btn-lg">
                        Back to home
                      </Link>
                    </div>
                  </>
                ) : null}

                {status === "error" ? (
                  <>
                    <h2>Something went wrong</h2>
                    <p>
                      We couldn&apos;t update your preferences. Please try again,
                      or email us and we&apos;ll sort it out.
                    </p>
                    <div className="rd-actions">
                      <button
                        type="button"
                        className="btn btn-navy btn-lg"
                        onClick={() => setStatus("idle")}
                      >
                        Try again
                      </button>
                      <a
                        className="btn btn-outline btn-lg"
                        href="mailto:enquiries@tenacitytutoring.com?subject=Email%20preferences"
                      >
                        Email us
                      </a>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async ({
  query,
}) => {
  const token = typeof query.token === "string" ? query.token : null;

  let valid = false;
  try {
    valid = Boolean(uidFromUnsubscribeToken(token, unsubscribeSecret()));
  } catch {
    valid = false;
  }

  return { props: { token, valid } };
};
