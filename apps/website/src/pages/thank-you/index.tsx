import Head from "@modules/common/components/head";
import Link from "next/link";

export default function ThankYou() {
  return (
    <>
      <Head
        title="Registration complete"
        description="Thanks for registering with Tenacity Tutoring. We will confirm your child's class and free trial lesson within one business day."
      />
      <main className="reg-section">
        <div className="wrap">
          <div className="reg-shell">
            <div className="reg-card">
              <div className="reg-done show">
                <div className="rd-ic">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                <h2>Registration complete</h2>
                <p>
                  Thanks for registering with Tenacity. We&apos;ll confirm your
                  child&apos;s class and free trial lesson within one business
                  day.
                </p>
                <div className="rd-actions">
                  <Link href="/" className="btn btn-navy btn-lg">
                    Back to home
                  </Link>
                  <Link href="/programs" className="btn btn-outline btn-lg">
                    Explore subjects
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
