import Head from "@modules/common/components/head";
import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import {
  APP_BARRIER_OPTIONS,
  APP_USAGE_OPTIONS,
  APP_USEFULNESS_OPTIONS,
  COMMUNICATION_QUESTIONS,
  LESSON_QUESTIONS,
  RATING_OPTIONS,
  SATISFACTION_OPTIONS,
  STUDENT_YEAR_OPTIONS,
  SUBJECT_OPTIONS,
  type RatingValue,
} from "@lib/parentFeedback";

const STEPS = [
  {
    label: "About your family",
    shortLabel: "About",
    title: "A little context",
    blurb:
      "Tell us who your feedback relates to and how your family’s overall experience has been.",
  },
  {
    label: "Lessons",
    shortLabel: "Lessons",
    title: "Your child’s lesson experience",
    blurb:
      "Answer based on what your child tells you and what you observe before and after lessons.",
  },
  {
    label: "Communication",
    shortLabel: "Contact",
    title: "Progress, communication and administration",
    blurb: "Choose “Not sure” if you have not needed or seen a particular service.",
  },
  {
    label: "Mobile app",
    shortLabel: "App",
    title: "The Tenacity mobile app",
    blurb: "We want to know what is genuinely useful, difficult to use or missing.",
  },
  {
    label: "Final thoughts",
    shortLabel: "Finish",
    title: "Your final thoughts",
    blurb: "Tell us what is working and the one change that would matter most.",
  },
] as const;

const LAST_STEP = STEPS.length - 1;

const RECOMMENDATION_LABELS: Record<number, string> = {
  0: "0 out of 10 — not at all likely",
  10: "10 out of 10 — extremely likely",
};

// A step change re-renders the button under the pointer. Ignoring activations for
// a moment afterwards stops a double-click from validating — and rejecting — a
// step the parent has not had a chance to look at yet. The window has to outlast
// a slow system double-click (~500ms) without being long enough to swallow a
// deliberate second press.
const STEP_SETTLE_MS = 700;

// Clearance for the fixed header, so a step change does not park the progress
// bar underneath it.
const NAV_OFFSET = 100;

type Ratings = Record<string, RatingValue>;

type SurveyState = {
  context: {
    studentYear: string;
    subjects: string[];
  };
  overallSatisfaction: number | null;
  lessons: Ratings;
  communication: Ratings;
  app: {
    usage: string;
    usefulness: number | null;
    barrier: string;
    otherBarrier: string;
    improvement: string;
  };
  recommendation: number | null;
  comments: {
    strengths: string;
    change: string;
  };
  followUp: {
    requested: boolean;
    name: string;
    email: string;
  };
  website: string;
};

const initialState: SurveyState = {
  context: { studentYear: "", subjects: [] },
  overallSatisfaction: null,
  lessons: {},
  communication: {},
  app: {
    usage: "",
    usefulness: null,
    barrier: "",
    otherBarrier: "",
    improvement: "",
  },
  recommendation: null,
  comments: { strengths: "", change: "" },
  followUp: { requested: false, name: "", email: "" },
  website: "",
};

const Tick = () => (
  <span className="pf-tick" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  </span>
);

const Arrow = ({ direction = "right" }: { direction?: "left" | "right" }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
    style={direction === "left" ? { transform: "rotate(180deg)" } : undefined}
  >
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

function SingleChoice({
  name,
  legend,
  hint,
  options,
  value,
  onChange,
  columns = 3,
}: {
  name: string;
  legend: string;
  hint?: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  columns?: 2 | 3 | 4;
}) {
  return (
    <fieldset className="pf-fieldset">
      <legend>{legend}</legend>
      {hint && <p className="pf-field-hint">{hint}</p>}
      <div className={`pf-choice-grid pf-cols-${columns}`}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label className={`pf-choice ${selected ? "selected" : ""}`} key={option.value}>
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
              />
              <span>{option.label}</span>
              {selected && <Tick />}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function RatingQuestions({
  questions,
  ratings,
  onChange,
}: {
  questions: readonly { id: string; text: string }[];
  ratings: Ratings;
  onChange: (id: string, value: RatingValue) => void;
}) {
  return (
    <div className="pf-ratings">
      <p className="pf-scale-key" aria-hidden="true">
        <span>1 = Strongly disagree</span>
        <span>5 = Strongly agree</span>
        <span>N/A = Not sure</span>
      </p>
      {questions.map((question, index) => (
        <fieldset className="pf-rating-question" key={question.id}>
          <legend>
            <span className="pf-question-number">{index + 1}</span>
            {question.text}
          </legend>
          <div className="pf-rating-options">
            {RATING_OPTIONS.map((option) => {
              const selected = ratings[question.id] === option.value;
              return (
                <label
                  key={String(option.value)}
                  className={`pf-rating ${selected ? "selected" : ""}`}
                >
                  <input
                    type="radio"
                    name={question.id}
                    value={option.value}
                    checked={selected}
                    onChange={() => onChange(question.id, option.value)}
                    // The short label is hidden on narrow screens, so the number
                    // alone would be the whole accessible name without this.
                    aria-label={option.label}
                  />
                  <span>{option.value === "not_sure" ? "N/A" : option.value}</span>
                  <small>{option.shortLabel}</small>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function FivePointScale({
  name,
  legend,
  options,
  value,
  onChange,
}: {
  name: string;
  legend: string;
  options: readonly { value: number; label: string }[];
  value: number | null;
  onChange: (value: number) => void;
}) {
  return (
    <fieldset className="pf-fieldset">
      <legend>{legend}</legend>
      <div className="pf-five-scale">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <label
              key={option.value}
              className={`pf-five-rating ${selected ? "selected" : ""}`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
              />
              <strong>{option.value}</strong>
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function CheckboxChoices({
  legend,
  hint,
  options,
  values,
  onToggle,
  max,
}: {
  legend: string;
  hint?: string;
  options: readonly { value: string; label: string }[];
  values: string[];
  onToggle: (value: string) => void;
  max?: number;
}) {
  const atLimit = Boolean(max && values.length >= max);

  return (
    <fieldset className="pf-fieldset">
      <legend>{legend}</legend>
      {hint && <p className="pf-field-hint">{hint}</p>}
      <div className="pf-check-grid">
        {options.map((option) => {
          const selected = values.includes(option.value);
          return (
            <label
              key={option.value}
              className={`pf-check-choice ${selected ? "selected" : ""} ${
                atLimit && !selected ? "at-limit" : ""
              }`}
            >
              <input
                type="checkbox"
                value={option.value}
                checked={selected}
                disabled={atLimit && !selected}
                onChange={() => onToggle(option.value)}
              />
              <span className="pf-checkbox" aria-hidden="true">
                {selected && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </span>
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function ParentFeedbackPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<SurveyState>(initialState);
  // The step whose problems are currently on show. Errors are re-derived from the
  // live answers, so they clear themselves as the parent fixes each one.
  const [errorStep, setErrorStep] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const errorsRef = useRef<HTMLDivElement>(null);
  const surveyRef = useRef<HTMLElement>(null);
  const mounted = useRef(false);
  const lastStepChange = useRef(0);
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileError, setTurnstileError] = useState("");
  const [turnstileWidgetId, setTurnstileWidgetId] = useState<string | null>(null);

  // Rendered once, on the last step, matching the registration form's pattern:
  // the widget only needs to exist right before submission, and rendering it
  // earlier would let its token expire while a parent is still answering.
  useEffect(() => {
    if (step !== LAST_STEP || !turnstileRef.current || turnstileWidgetId) return;

    let cancelled = false;
    let retry: number | undefined;

    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!siteKey) {
      setTurnstileError("Verification is not configured.");
      return;
    }

    const renderTurnstile = () => {
      if (cancelled || !turnstileRef.current || turnstileWidgetId) return;
      if (!window.turnstile) {
        retry = window.setTimeout(renderTurnstile, 250);
        return;
      }
      const widgetId = window.turnstile.render(turnstileRef.current, {
        sitekey: siteKey,
        callback: (token: string) => {
          setTurnstileToken(token);
          setTurnstileError("");
        },
        "expired-callback": () => {
          setTurnstileToken("");
        },
        "error-callback": () => {
          setTurnstileToken("");
          setTurnstileError("Verification failed. Please try again.");
        },
      });
      setTurnstileWidgetId(widgetId);
    };

    renderTurnstile();
    return () => {
      cancelled = true;
      if (retry) window.clearTimeout(retry);
    };
  }, [step, turnstileWidgetId]);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    // preventScroll: the smooth scroll back to the top is already running.
    stepHeadingRef.current?.focus({ preventScroll: true });
  }, [step]);

  useEffect(() => {
    if (errorStep !== null || submitError) {
      errorsRef.current?.focus({ preventScroll: true });
    }
  }, [errorStep, submitError]);

  const updateRatings = (
    section: "lessons" | "communication",
    id: string,
    value: RatingValue
  ) => {
    setForm((current) => ({
      ...current,
      [section]: { ...current[section], [id]: value },
    }));
  };

  const toggleListValue = (
    values: string[],
    value: string,
    max = Number.POSITIVE_INFINITY
  ) => {
    if (values.includes(value)) return values.filter((item) => item !== value);
    if (values.length >= max) return values;
    return [...values, value];
  };

  const validateStep = (stepToValidate: number) => {
    const found: string[] = [];

    if (stepToValidate === 0) {
      if (!form.context.studentYear) found.push("Select your child’s year group.");
      if (form.context.subjects.length === 0) found.push("Select at least one subject.");
      if (form.overallSatisfaction === null) {
        found.push("Rate your family’s overall experience with Tenacity.");
      }
    }

    if (stepToValidate === 1) {
      const missing = LESSON_QUESTIONS.some((question) => !form.lessons[question.id]);
      if (missing) found.push("Please answer every question about lessons. Choose ‘Not sure’ where needed.");
    }

    if (stepToValidate === 2) {
      const missing = COMMUNICATION_QUESTIONS.some(
        (question) => !form.communication[question.id]
      );
      if (missing) found.push("Please answer every question about communication and administration.");
    }

    if (stepToValidate === 3) {
      if (!form.app.usage) {
        found.push("Tell us how often you use the Tenacity mobile app.");
      } else if (form.app.usage === "never") {
        if (!form.app.barrier) found.push("Select the main reason you have not used the app.");
        if (form.app.barrier === "other" && !form.app.otherBarrier.trim()) {
          found.push("Tell us the other reason you have not used the app.");
        }
      } else {
        if (form.app.usefulness === null) {
          found.push("Rate how useful you find the Tenacity mobile app.");
        }
      }
    }

    if (stepToValidate === 4) {
      if (form.recommendation === null) found.push("Select how likely you are to recommend Tenacity.");
      if (!form.comments.change.trim()) {
        found.push("Tell us the one change we should make next term.");
      }
      if (form.followUp.requested) {
        if (!form.followUp.name.trim()) found.push("Enter your name so we can follow up.");
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.followUp.email.trim())) {
          found.push("Enter a valid email address for follow-up.");
        }
      }
      if (!turnstileToken) {
        found.push("Please complete the verification check.");
      }
    }

    return found;
  };

  const errors = errorStep === step ? validateStep(step) : [];

  const scrollTo = (top: number) => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
  };

  // Land on the progress bar rather than the very top: on a step change the
  // parent wants the next set of questions, not the page introduction again.
  const scrollToSurvey = () => {
    const shell = surveyRef.current;
    if (!shell) return scrollTo(0);
    const top = shell.getBoundingClientRect().top + window.scrollY - NAV_OFFSET;
    scrollTo(Math.max(top, 0));
  };

  // True for a short moment after the step changes, while the pointer is still
  // over a button that has just been replaced by the next step's button.
  const settling = () => Date.now() - lastStepChange.current < STEP_SETTLE_MS;

  const moveTo = (nextStep: number) => {
    if (nextStep < 0 || nextStep > LAST_STEP || settling()) return;

    if (nextStep > step && validateStep(step).length > 0) {
      setErrorStep(step);
      return;
    }

    setErrorStep(null);
    setSubmitError(null);
    lastStepChange.current = Date.now();
    setStep(nextStep);
    scrollToSurvey();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || settling()) return;

    setSubmitError(null);
    if (validateStep(LAST_STEP).length > 0) {
      setErrorStep(LAST_STEP);
      return;
    }
    setErrorStep(null);

    setSubmitting(true);
    try {
      const response = await fetch("/api/parent-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, turnstileToken }),
      });

      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);

      setSubmitted(true);
      scrollTo(0);
    } catch (error) {
      console.error("Parent feedback submission failed:", error);
      setSubmitError(
        "Please try again in a moment. If it keeps failing, contact Tenacity directly and we will take your feedback another way."
      );
      // A Turnstile token is single-use: a failed submit still consumed it,
      // so the retry needs a fresh one rather than resending the same token.
      setTurnstileToken("");
      if (turnstileWidgetId && window.turnstile) {
        window.turnstile.reset(turnstileWidgetId);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head
        title="Parent feedback"
        description="Share confidential feedback about your family's experience with Tenacity Tutoring."
        canonicalPath="/parent-feedback"
      >
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <header className="nav solid pf-nav">
        <div className="wrap nav-inner">
          <Link href="/" className="nav-logo" aria-label="Tenacity Tutoring home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/claude-design/logo-horizontal.png"
              alt="Tenacity Tutoring"
              className="logo-color"
            />
          </Link>
          <Link href="/" className="pf-return-link">
            Return to website
          </Link>
        </div>
      </header>

      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
      />

      <main className="pf-page">
        <div className="pf-orb pf-orb-one" aria-hidden="true" />
        <div className="pf-orb pf-orb-two" aria-hidden="true" />
        <div className="wrap pf-wrap">
          {!submitted ? (
            <>
              <section className="pf-intro">
                <div>
                  <span className="eyebrow">Parent feedback</span>
                  <h1>Help us make Tenacity better for your child.</h1>
                  <p>
                    We want an honest view of the lessons, communication and tools your
                    family experiences. Specific criticism is welcome and will guide what
                    we change next.
                  </p>
                </div>
                <aside className="pf-privacy-card">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <rect x="4" y="10" width="16" height="10" rx="2" />
                    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                  </svg>
                  <div>
                    <strong>Anonymous by default</strong>
                    <p>
                      Your name is not required. If you ask us to contact you, your contact
                      details will be saved with your answers.
                    </p>
                  </div>
                </aside>
              </section>

              <section className="pf-survey-shell" aria-label="Parent feedback survey" ref={surveyRef}>
                <div className="pf-progress" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
                  <div className="pf-progress-topline">
                    <span>Step {step + 1} of {STEPS.length}</span>
                    <span>About 3 minutes</span>
                  </div>
                  <div className="pf-progress-track" aria-hidden="true">
                    <span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
                  </div>
                  <ol className="pf-step-labels">
                    {STEPS.map((item, index) => (
                      <li className={index === step ? "active" : index < step ? "done" : ""} key={item.label}>
                        <span className="pf-step-dot">{index < step ? "✓" : index + 1}</span>
                        <span className="pf-step-full">{item.label}</span>
                        <span className="pf-step-short">{item.shortLabel}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                <form onSubmit={submit} noValidate>
                  <div className="pf-honeypot" hidden aria-hidden="true">
                    <label htmlFor="pf-website">Website</label>
                    <input
                      id="pf-website"
                      name="website"
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={form.website}
                      onChange={(event) => setForm((current) => ({ ...current, website: event.target.value }))}
                    />
                  </div>

                  <div className="pf-card">
                    <div className="pf-step-heading">
                      <span>{STEPS[step].label}</span>
                      <h2 ref={stepHeadingRef} tabIndex={-1}>{STEPS[step].title}</h2>
                      <p>{STEPS[step].blurb}</p>
                    </div>

                    {(submitError || errors.length > 0) && (
                      <div className="pf-errors" role="alert" tabIndex={-1} ref={errorsRef}>
                        {submitError ? (
                          <>
                            <strong>We could not save your feedback.</strong>
                            <p>{submitError}</p>
                          </>
                        ) : (
                          <>
                            <strong>Please check your answers:</strong>
                            <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul>
                          </>
                        )}
                      </div>
                    )}

                    {step === 0 && (
                      <div className="pf-step-content">
                        <SingleChoice
                          name="student-year"
                          legend="What year group is your child in?"
                          options={STUDENT_YEAR_OPTIONS}
                          value={form.context.studentYear}
                          onChange={(studentYear) => setForm((current) => ({
                            ...current,
                            context: { ...current.context, studentYear },
                          }))}
                        />
                        <CheckboxChoices
                          legend="Which subjects does your child attend for?"
                          hint="Select all that apply."
                          options={SUBJECT_OPTIONS}
                          values={form.context.subjects}
                          onToggle={(subject) => setForm((current) => ({
                            ...current,
                            context: {
                              ...current.context,
                              subjects: toggleListValue(current.context.subjects, subject),
                            },
                          }))}
                        />
                        <FivePointScale
                          name="overall-satisfaction"
                          legend="Overall, how satisfied are you with your family’s experience at Tenacity?"
                          options={SATISFACTION_OPTIONS}
                          value={form.overallSatisfaction}
                          onChange={(overallSatisfaction) => setForm((current) => ({
                            ...current,
                            overallSatisfaction,
                          }))}
                        />
                      </div>
                    )}

                    {step === 1 && (
                      <RatingQuestions
                        questions={LESSON_QUESTIONS}
                        ratings={form.lessons}
                        onChange={(id, value) => updateRatings("lessons", id, value)}
                      />
                    )}

                    {step === 2 && (
                      <RatingQuestions
                        questions={COMMUNICATION_QUESTIONS}
                        ratings={form.communication}
                        onChange={(id, value) => updateRatings("communication", id, value)}
                      />
                    )}

                    {step === 3 && (
                      <div className="pf-step-content">
                        <SingleChoice
                          name="app-usage"
                          legend="How often do you use the Tenacity mobile app?"
                          options={APP_USAGE_OPTIONS}
                          columns={4}
                          value={form.app.usage}
                          onChange={(usage) => setForm((current) => ({
                            ...current,
                            app: { ...current.app, usage },
                          }))}
                        />

                        {form.app.usage === "never" && (
                          <div className="pf-branch-panel">
                            <SingleChoice
                              name="app-barrier"
                              legend="What is the main reason you do not use the app?"
                              options={APP_BARRIER_OPTIONS}
                              columns={2}
                              value={form.app.barrier}
                              onChange={(barrier) => setForm((current) => ({
                                ...current,
                                app: { ...current.app, barrier },
                              }))}
                            />
                            {form.app.barrier === "other" && (
                              <div className="pf-text-field">
                                <label htmlFor="app-other-barrier">What is the other reason?</label>
                                <textarea
                                  id="app-other-barrier"
                                  maxLength={500}
                                  value={form.app.otherBarrier}
                                  onChange={(event) => setForm((current) => ({
                                    ...current,
                                    app: { ...current.app, otherBarrier: event.target.value },
                                  }))}
                                />
                              </div>
                            )}
                          </div>
                        )}

                        {form.app.usage && form.app.usage !== "never" && (
                          <div className="pf-branch-panel">
                            <FivePointScale
                              name="app-usefulness"
                              legend="How useful is the mobile app overall?"
                              options={APP_USEFULNESS_OPTIONS}
                              value={form.app.usefulness}
                              onChange={(usefulness) => setForm((current) => ({
                                ...current,
                                app: { ...current.app, usefulness },
                              }))}
                            />
                            <div className="pf-text-field">
                              <label htmlFor="app-improvement">What is the most important change we could make to the app? (optional)</label>
                              <textarea
                                id="app-improvement"
                                maxLength={1500}
                                placeholder="A feature, confusing process or problem you would like us to address…"
                                value={form.app.improvement}
                                onChange={(event) => setForm((current) => ({
                                  ...current,
                                  app: { ...current.app, improvement: event.target.value },
                                }))}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {step === 4 && (
                      <div className="pf-step-content">
                        <fieldset className="pf-fieldset pf-recommendation">
                          <legend>How likely are you to recommend Tenacity to another parent?</legend>
                          <div className="pf-number-scale">
                            {Array.from({ length: 11 }, (_, value) => (
                              <label
                                className={form.recommendation === value ? "selected" : ""}
                                key={value}
                              >
                                <input
                                  type="radio"
                                  name="recommendation"
                                  value={value}
                                  checked={form.recommendation === value}
                                  onChange={() => setForm((current) => ({ ...current, recommendation: value }))}
                                  aria-label={RECOMMENDATION_LABELS[value] ?? `${value} out of 10`}
                                />
                                <span>{value}</span>
                              </label>
                            ))}
                          </div>
                          {/* The numbers are part of the copy so the key still reads
                              correctly when the scale wraps onto two rows. */}
                          <p className="pf-number-labels" aria-hidden="true">
                            <span>0 = Not at all likely</span>
                            <span>10 = Extremely likely</span>
                          </p>
                        </fieldset>

                        <div className="pf-written-grid">
                          <div className="pf-text-field">
                            <label htmlFor="strengths">What is Tenacity doing particularly well for your child or family? (optional)</label>
                            <textarea
                              id="strengths"
                              maxLength={2000}
                              placeholder="A tutor, part of the lesson, process or feature that works well…"
                              value={form.comments.strengths}
                              onChange={(event) => setForm((current) => ({
                                ...current,
                                comments: { ...current.comments, strengths: event.target.value },
                              }))}
                            />
                          </div>
                          <div className="pf-text-field">
                            <label htmlFor="change">If we made one change next term, what should it be?</label>
                            <textarea
                              id="change"
                              maxLength={2000}
                              placeholder="Please be direct and specific…"
                              value={form.comments.change}
                              onChange={(event) => setForm((current) => ({
                                ...current,
                                comments: { ...current.comments, change: event.target.value },
                              }))}
                            />
                          </div>
                        </div>

                        <div className="pf-follow-up">
                          <label className="pf-follow-toggle">
                            <input
                              type="checkbox"
                              checked={form.followUp.requested}
                              onChange={(event) => setForm((current) => ({
                                ...current,
                                followUp: { ...current.followUp, requested: event.target.checked },
                              }))}
                            />
                            <span className="pf-checkbox" aria-hidden="true">
                              {form.followUp.requested && (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                  <path d="M20 6 9 17l-5-5" />
                                </svg>
                              )}
                            </span>
                            <span>
                              <strong>I would like Tenacity to contact me about my feedback.</strong>
                              <small>Leave this unticked to submit anonymously.</small>
                            </span>
                          </label>

                          {form.followUp.requested && (
                            <div className="pf-contact-fields">
                              <div className="pf-text-field">
                                <label htmlFor="follow-up-name">Your name</label>
                                <input
                                  id="follow-up-name"
                                  type="text"
                                  autoComplete="name"
                                  maxLength={160}
                                  value={form.followUp.name}
                                  onChange={(event) => setForm((current) => ({
                                    ...current,
                                    followUp: { ...current.followUp, name: event.target.value },
                                  }))}
                                />
                              </div>
                              <div className="pf-text-field">
                                <label htmlFor="follow-up-email">Email address</label>
                                <input
                                  id="follow-up-email"
                                  type="email"
                                  autoComplete="email"
                                  maxLength={180}
                                  value={form.followUp.email}
                                  onChange={(event) => setForm((current) => ({
                                    ...current,
                                    followUp: { ...current.followUp, email: event.target.value },
                                  }))}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {step === LAST_STEP && (
                      <div className="pf-turnstile">
                        <div ref={turnstileRef} />
                        {turnstileError ? <span className="pf-turnstile-error">{turnstileError}</span> : null}
                      </div>
                    )}

                    <div className="pf-actions">
                      {step > 0 ? (
                        <button type="button" className="pf-back" onClick={() => moveTo(step - 1)} disabled={submitting}>
                          <Arrow direction="left" /> Back
                        </button>
                      ) : (
                        <span />
                      )}
                      {step < STEPS.length - 1 ? (
                        <button type="button" className="btn btn-primary btn-lg" onClick={() => moveTo(step + 1)}>
                          Continue <Arrow />
                        </button>
                      ) : (
                        <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
                          {submitting ? "Submitting…" : "Submit feedback"}
                          {!submitting && <Arrow />}
                        </button>
                      )}
                    </div>
                  </div>
                </form>
              </section>
            </>
          ) : (
            <section className="pf-success">
              <div className="pf-success-icon">
                <Tick />
              </div>
              <span className="eyebrow center">Response received</span>
              <h1>Thank you for being candid.</h1>
              <p>
                Your response has been saved. We will review the themes across all parent
                responses and use them to decide what to change next.
              </p>
              {form.followUp.requested && (
                <p className="pf-follow-up-note">You asked us to follow up, so we will contact you using the email provided.</p>
              )}
              <Link href="/" className="btn btn-navy btn-lg">Return to Tenacity</Link>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
