import {
  analyticsEnabled,
  hasOptedOut,
  optIn,
  optOut,
  whenAnalyticsReady,
} from "@lib/analytics";
import Head from "@modules/common/components/head";
import Link from "next/link";
import { useEffect, useState } from "react";

const LAST_UPDATED = "13 October 2026";

type AnalyticsState = "loading" | "off_here" | "on" | "opted_out";

const AnalyticsChoice = () => {
  const [state, setState] = useState<AnalyticsState>("loading");

  useEffect(() => {
    if (!analyticsEnabled()) {
      setState("off_here");
      return;
    }
    let active = true;
    whenAnalyticsReady(() => {
      if (active) setState(hasOptedOut() ? "opted_out" : "on");
    });
    return () => {
      active = false;
    };
  }, []);

  if (state === "loading") return null;

  if (state === "off_here") {
    return (
      <p className="privacy-choice">
        Website analytics are not running in this browser.
      </p>
    );
  }

  return (
    <div className="privacy-choice">
      <p>
        {state === "on"
          ? "Website analytics are on in this browser."
          : "You have turned off website analytics in this browser."}
      </p>
      <button
        type="button"
        className="btn btn-outline"
        onClick={() => {
          if (state === "on") {
            optOut();
            setState("opted_out");
          } else {
            optIn();
            setState("on");
          }
        }}
      >
        {state === "on" ? "Turn off analytics" : "Turn analytics back on"}
      </button>
    </div>
  );
};

export default function Privacy() {
  return (
    <>
      <Head
        title="Privacy policy"
        description="How Tenacity Tutoring collects, uses and protects your family's information, including website analytics."
        canonicalPath="/privacy"
      />
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
            <div className="reg-head">
              <h1>Privacy policy</h1>
              <p>
                How we collect, use and look after your family&apos;s
                information on this website. Last updated {LAST_UPDATED}.
              </p>
            </div>

            <article className="reg-card privacy-policy">
              <h2>Who we are</h2>
              <p>
                Tenacity Tutoring runs small-group Maths and English classes at
                16 Broadarrow Road, Narwee NSW 2209. In this policy,
                &ldquo;we&rdquo; and &ldquo;us&rdquo; mean Tenacity Tutoring.
                This policy covers tenacitytutoring.com. The Tenacity mobile app
                is covered by its own terms of use.
              </p>

              <h2>What we collect</h2>
              <p>We only collect what you give us through a form, plus the website analytics described below.</p>
              <ul>
                <li>
                  <strong>Enquiry form:</strong> your name, phone number and
                  email, your child&apos;s year and subject, and your message.
                </li>
                <li>
                  <strong>Registration:</strong> your name, email and phone
                  number; an emergency contact&apos;s name, phone number and
                  relationship; each child&apos;s name, school year, subjects
                  and class times; any allergies, medical information or notes
                  you choose to give us; whether your child may leave the
                  centre unaccompanied; and how you heard about us, including a
                  referral link if you used one.
                </li>
                <li>
                  <strong>Year 11 interest:</strong> your contact details and
                  each student&apos;s name, school, year, course choices,
                  preferred days and any notes.
                </li>
                <li>
                  <strong>Parent feedback:</strong> your answers. Your name and
                  email are only collected if you ask us to follow up;
                  otherwise feedback is anonymous.
                </li>
                <li>
                  <strong>Email preferences:</strong> whether you want to
                  receive our weekly parent email.
                </li>
              </ul>

              <h2>How we use it</h2>
              <ul>
                <li>To reply to your enquiry and arrange classes and a free trial lesson.</li>
                <li>To contact you about your child&apos;s lessons, schedule and invoices.</li>
                <li>
                  To keep students safe. We only use allergy and medical
                  information to care for your child at the centre.
                </li>
                <li>To record referrals so the referring family receives their reward.</li>
                <li>To understand how families use the website, so we can improve it.</li>
              </ul>
              <p>
                We do not sell your information, and we do not use it for
                advertising.
              </p>

              <h2>Who handles it for us</h2>
              <p>
                We use a small number of service providers to run the website.
                Some store or process information outside Australia.
              </p>
              <div className="privacy-table" role="table">
                <div role="row">
                  <span role="columnheader">Provider</span>
                  <span role="columnheader">What it does</span>
                  <span role="columnheader">Where</span>
                </div>
                <div role="row">
                  <span role="cell">Google Firebase</span>
                  <span role="cell">Stores registrations, Year 11 interest and feedback</span>
                  <span role="cell">United States</span>
                </div>
                <div role="row">
                  <span role="cell">SendGrid (Twilio)</span>
                  <span role="cell">Delivers form submissions to our team by email</span>
                  <span role="cell">United States</span>
                </div>
                <div role="row">
                  <span role="cell">Cloudflare Turnstile</span>
                  <span role="cell">Checks that a form is sent by a person, using your IP address and browser signals</span>
                  <span role="cell">Global</span>
                </div>
                <div role="row">
                  <span role="cell">Vercel</span>
                  <span role="cell">Hosts the website and keeps short-term server logs</span>
                  <span role="cell">Global</span>
                </div>
                <div role="row">
                  <span role="cell">PostHog</span>
                  <span role="cell">Website analytics (see below)</span>
                  <span role="cell">United States</span>
                </div>
              </div>

              <h2 id="analytics">Website analytics</h2>
              <p>
                We use PostHog to see how families use the website: which pages
                are visited, which buttons and links are used, how far people
                get through our forms, and whether a form was sent
                successfully. PostHog also records your device and browser
                type, the website or campaign link that brought you here, and
                an approximate location (city and country) worked out from your
                IP address.
              </p>
              <p>
                <strong>Analytics never includes</strong> names, email
                addresses, phone numbers, children&apos;s details, medical
                information, anything you type into a form, or referral codes.
                We do not record your screen. Analytics data is stored in the
                United States and is only used to improve this website.
              </p>
              <p>
                PostHog keeps a random ID in a cookie and in your
                browser&apos;s local storage, so visits from the same browser
                can be counted together. You can turn analytics off for this
                browser here, or block cookies in your browser settings.
              </p>
              <AnalyticsChoice />

              <h2>Keeping your information</h2>
              <p>
                We keep enrolment and enquiry information for as long as we
                need it to provide our services and meet our legal and
                record-keeping obligations. Website analytics data is kept for
                a limited period and then deleted.
              </p>

              <h2>Your choices</h2>
              <p>
                You can ask to see the information we hold about your family,
                correct it, or ask us to delete it, by emailing{" "}
                <a href="mailto:enquiries@tenacitytutoring.com">
                  enquiries@tenacitytutoring.com
                </a>{" "}
                or calling <a href="tel:0401455112">0401 455 112</a>. If you
                have a concern about how we have handled your information,
                please tell us first so we can put it right. If you are not
                satisfied, you can contact the Office of the Australian
                Information Commissioner at{" "}
                <a href="https://www.oaic.gov.au" target="_blank" rel="noreferrer">
                  oaic.gov.au
                </a>
                .
              </p>

              <h2>Changes to this policy</h2>
              <p>
                If we change how we handle your information, we will update
                this page and the date at the top.
              </p>
            </article>
          </div>
        </div>
      </main>
    </>
  );
}
