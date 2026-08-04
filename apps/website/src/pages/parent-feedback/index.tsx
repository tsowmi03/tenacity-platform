import Head from "@modules/common/components/head";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  APP_BARRIER_OPTIONS,
  APP_QUESTIONS,
  APP_USAGE_OPTIONS,
  COMMUNICATION_QUESTIONS,
  IMPROVEMENT_OPTIONS,
  LESSON_QUESTIONS,
  MAX_IMPROVEMENT_PRIORITIES,
  RATING_OPTIONS,
  STUDENT_YEAR_OPTIONS,
  SUBJECT_OPTIONS,
  TENURE_OPTIONS,
  type RatingValue,
} from "@lib/parentFeedback";

const STEPS = [
  { label: "About your family", shortLabel: "About" },
  { label: "Lessons", shortLabel: "Lessons" },
  { label: "Communication", shortLabel: "Contact" },
  { label: "Mobile app", shortLabel: "App" },
  { label: "Your priorities", shortLabel: "Priorities" },
] as const;

type Ratings = Record<string, RatingValue>;

type SurveyState = {
  context: {
    studentYear: string;
    tenure: string;
    subjects: string[];
  };
  lessons: Ratings;
  communication: Ratings;
  app: {
    usage: string;
    barriers: string[];
    otherBarrier: string;
    ratings: Ratings;
    improvement: string;
  };
  improvementPriorities: string[];
  recommendation: number | null;
  comments: {
    strengths: string;
    change: string;
    missing: string;
  };
  followUp: {
    requested: boolean;
    name: string;
    email: string;
  };
  website: string;
};

const initialState: SurveyState = {
  context: { studentYear: "", tenure: "", subjects: [] },
  lessons: {},
  communication: {},
  app: {
    usage: "",
    barriers: [],
    otherBarrier: "",
    ratings: {},
    improvement: "",
  },
  improvementPriorities: [],
  recommendation: null,
  comments: { strengths: "", change: "", missing: "" },
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
  legend,
  options,
  value,
  onChange,
  columns = 3,
}: {
  legend: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  columns?: 2 | 3 | 4;
}) {
  return (
    <fieldset className="pf-fieldset">
      <legend>{legend}</legend>
      <div className={`pf-choice-grid pf-cols-${columns}`}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label className={`pf-choice ${selected ? "selected" : ""}`} key={option.value}>
              <input
                type="radio"
                name={legend}
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
      <div className="pf-scale-key" aria-hidden="true">
        <span>1 = Strongly disagree</span>
        <span>5 = Strongly agree</span>
      </div>
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
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const errorsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (step > 0) stepHeadingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (errors.length > 0) errorsRef.current?.focus();
  }, [errors]);

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
      if (!form.context.tenure) found.push("Select how long your family has attended Tenacity.");
      if (form.context.subjects.length === 0) found.push("Select at least one subject.");
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
        if (form.app.barriers.length === 0) found.push("Select at least one reason you have not used the app.");
        if (form.app.barriers.includes("other") && !form.app.otherBarrier.trim()) {
          found.push("Tell us the other reason you have not used the app.");
        }
      } else {
        const missing = APP_QUESTIONS.some((question) => !form.app.ratings[question.id]);
        if (missing) found.push("Please rate each app area. Choose ‘Not sure’ for features you have not used.");
      }
    }

    if (stepToValidate === 4) {
      if (form.improvementPriorities.length === 0) found.push("Choose at least one improvement priority.");
      if (form.recommendation === null) found.push("Select how likely you are to recommend Tenacity.");
      const hasWrittenResponse = Object.values(form.comments).some((value) => value.trim());
      if (!hasWrittenResponse) found.push("Please answer at least one written feedback question.");
      if (form.followUp.requested) {
        if (!form.followUp.name.trim()) found.push("Enter your name so we can follow up.");
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.followUp.email.trim())) {
          found.push("Enter a valid email address for follow-up.");
        }
      }
    }

    return found;
  };

  const moveTo = (nextStep: number) => {
    if (nextStep > step) {
      const found = validateStep(step);
      setErrors(found);
      if (found.length > 0) return;
    }

    setErrors([]);
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const found = validateStep(4);
    setErrors(found);
    if (found.length > 0) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/parent-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);

      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error("Parent feedback submission failed:", error);
      setErrors([
        "Your feedback could not be submitted. Please try again, or contact Tenacity directly.",
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  const stepTitle = [
    "A little context",
    "Your child’s lesson experience",
    "Progress, communication and administration",
    "The Tenacity mobile app",
    "What should we work on next?",
  ][step];

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

              <section className="pf-survey-shell" aria-label="Parent feedback survey">
                <div className="pf-progress" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
                  <div className="pf-progress-topline">
                    <span>Step {step + 1} of {STEPS.length}</span>
                    <span>About 5 minutes</span>
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
                      <h2 ref={stepHeadingRef} tabIndex={-1}>{stepTitle}</h2>
                      {step === 0 && <p>This information lets us see whether experiences differ across age groups and subjects.</p>}
                      {step === 1 && <p>Answer based on what your child tells you and what you observe before and after lessons.</p>}
                      {step === 2 && <p>Choose “Not sure” if you have not needed or seen a particular service.</p>}
                      {step === 3 && <p>We want to know what is genuinely useful, difficult to use or missing.</p>}
                      {step === 4 && <p>Choose the areas that would make the largest difference to your family.</p>}
                    </div>

                    {errors.length > 0 && (
                      <div className="pf-errors" role="alert" tabIndex={-1} ref={errorsRef}>
                        <strong>Please check your answers:</strong>
                        <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul>
                      </div>
                    )}

                    {step === 0 && (
                      <div className="pf-step-content">
                        <SingleChoice
                          legend="What year group is your child in?"
                          options={STUDENT_YEAR_OPTIONS}
                          value={form.context.studentYear}
                          onChange={(studentYear) => setForm((current) => ({
                            ...current,
                            context: { ...current.context, studentYear },
                          }))}
                        />
                        <SingleChoice
                          legend="How long has your family been with Tenacity?"
                          options={TENURE_OPTIONS}
                          value={form.context.tenure}
                          onChange={(tenure) => setForm((current) => ({
                            ...current,
                            context: { ...current.context, tenure },
                          }))}
                        />
                        <CheckboxChoices
                          legend="Which subjects does your child attend for?"
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
                            <CheckboxChoices
                              legend="Why have you not used the app?"
                              hint="Select all that apply."
                              options={APP_BARRIER_OPTIONS}
                              values={form.app.barriers}
                              onToggle={(barrier) => setForm((current) => ({
                                ...current,
                                app: {
                                  ...current.app,
                                  barriers: toggleListValue(current.app.barriers, barrier),
                                },
                              }))}
                            />
                            {form.app.barriers.includes("other") && (
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
                            <RatingQuestions
                              questions={APP_QUESTIONS}
                              ratings={form.app.ratings}
                              onChange={(id, value) => setForm((current) => ({
                                ...current,
                                app: {
                                  ...current.app,
                                  ratings: { ...current.app.ratings, [id]: value },
                                },
                              }))}
                            />
                            <div className="pf-text-field">
                              <label htmlFor="app-improvement">What is the most important change we could make to the app?</label>
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
                        <CheckboxChoices
                          legend="Which areas should Tenacity prioritise improving?"
                          hint={`Choose up to ${MAX_IMPROVEMENT_PRIORITIES}. ${form.improvementPriorities.length} selected.`}
                          options={IMPROVEMENT_OPTIONS}
                          values={form.improvementPriorities}
                          max={MAX_IMPROVEMENT_PRIORITIES}
                          onToggle={(priority) => setForm((current) => ({
                            ...current,
                            improvementPriorities: toggleListValue(
                              current.improvementPriorities,
                              priority,
                              MAX_IMPROVEMENT_PRIORITIES
                            ),
                          }))}
                        />

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
                                />
                                <span>{value}</span>
                              </label>
                            ))}
                          </div>
                          <div className="pf-number-labels" aria-hidden="true">
                            <span>Not at all likely</span>
                            <span>Extremely likely</span>
                          </div>
                        </fieldset>

                        <div className="pf-written-grid">
                          <div className="pf-text-field">
                            <label htmlFor="strengths">What is Tenacity doing particularly well?</label>
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
                          <div className="pf-text-field full">
                            <label htmlFor="missing">Is there anything you wish Tenacity offered that we do not currently provide?</label>
                            <textarea
                              id="missing"
                              maxLength={1500}
                              placeholder="A class, resource, update, app feature or other form of support…"
                              value={form.comments.missing}
                              onChange={(event) => setForm((current) => ({
                                ...current,
                                comments: { ...current.comments, missing: event.target.value },
                              }))}
                            />
                            <p>Answer at least one of the three written questions.</p>
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
