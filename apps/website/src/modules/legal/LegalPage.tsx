import Head from "@modules/common/components/head";
import Link from "next/link";
import type { ReactNode } from "react";

type LegalPageProps = {
  title: string;
  description: string;
  canonicalPath: string;
  intro: ReactNode;
  children: ReactNode;
};

/**
 * The frame shared by the website's legal pages (/privacy, /terms): the
 * simple nav, a centred heading with an intro line, and the document in a
 * card. Long-form styles come from `.privacy-policy` in claude-design.css.
 */
const LegalPage = ({
  title,
  description,
  canonicalPath,
  intro,
  children,
}: LegalPageProps) => (
  <>
    <Head title={title} description={description} canonicalPath={canonicalPath} />
    <header className="nav solid">
      <div className="wrap nav-inner">
        <Link href="/" className="nav-logo" aria-label="Tenacity Tutoring home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/claude-design/logo-horizontal.png"
            alt="Tenacity Tutoring"
            className="logo-color"
          />
        </Link>
        <nav className="nav-links">
          <Link href="/">Home</Link>
          <Link href="/programs">Subjects</Link>
          <Link href="/about">About</Link>
          <Link href="/contact">Contact</Link>
        </nav>
        <div className="nav-cta">
          <Link href="/contact#enquire" className="nav-phone">
            Send an enquiry
          </Link>
        </div>
      </div>
    </header>

    <main className="reg-section">
      <div className="wrap">
        <div className="reg-shell">
          <div className="reg-head legal-head">
            <h1>{title}</h1>
            <p>{intro}</p>
          </div>
          <article className="reg-card privacy-policy">{children}</article>
        </div>
      </div>
    </main>
  </>
);

export default LegalPage;
