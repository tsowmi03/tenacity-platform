import Head from "@modules/common/components/head";
import Link from "next/link";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CURRENT_YEAR_OPTIONS,
  ENGLISH_COURSE_OPTIONS,
  MATHS_COURSE_OPTIONS,
  MAX_STUDENTS_PER_INTEREST,
  PREFERRED_DAY_OPTIONS,
  STUDENT_STATUS_OPTIONS,
} from "@lib/year11Courses";

type StudentForm = {
  studentFirstName: string;
  studentLastName: string;
  school: string;
  currentYear: string;
  studentStatus: string;
  mathsCourses: string[];
  englishCourse: string;
  preferredDays: string[];
  notes: string;
};

const emptyStudent = (): StudentForm => ({
  studentFirstName: "",
  studentLastName: "",
  school: "",
  currentYear: "",
  studentStatus: "",
  mathsCourses: [],
  englishCourse: "",
  preferredDays: [],
  notes: "",
});

const Tick = () => (
  <span className="ch-tick">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  </span>
);

const toggle = (list: string[], value: string) =>
  list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];

export default function Year11Interest() {
  const [parent, setParent] = useState({
    parentFirstName: "",
    parentLastName: "",
    parentEmail: "",
    parentPhone: "",
  });
  const [students, setStudents] = useState<StudentForm[]>([emptyStudent()]);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileError, setTurnstileError] = useState("");

  const renderTurnstile = useCallback(() => {
    const container = turnstileRef.current;
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

    if (!container || widgetIdRef.current) return;

    if (!siteKey) {
      setTurnstileError("Verification is not configured.");
      return;
    }

    if (!window.turnstile) return;

    widgetIdRef.current = window.turnstile.render(container, {
      sitekey: siteKey,
      callback: (token) => {
        setTurnstileToken(token);
        setTurnstileError("");
      },
      "expired-callback": () => setTurnstileToken(""),
      "error-callback": () => {
        setTurnstileToken("");
        setTurnstileError("Verification failed. Please try again.");
      },
    });
  }, []);

  // The Cloudflare script loads asynchronously, so poll briefly until the
  // global is available rather than assuming it is ready on mount.
  useEffect(() => {
    if (submitted) return undefined;

    renderTurnstile();
    const interval = window.setInterval(() => {
      if (widgetIdRef.current) {
        window.clearInterval(interval);
        return;
      }
      renderTurnstile();
    }, 250);

    return () => window.clearInterval(interval);
  }, [renderTurnstile, submitted]);

  const resetTurnstile = () => {
    setTurnstileToken("");
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  };

  const updateParent = (patch: Partial<typeof parent>) => {
    setParent((current) => ({ ...current, ...patch }));
  };

  const updateStudent = (index: number, patch: Partial<StudentForm>) => {
    setStudents((current) =>
      current.map((student, i) =>
        i === index ? { ...student, ...patch } : student
      )
    );
  };

  // Derive the next value from current state rather than the rendered copy, so
  // two quick clicks cannot overwrite each other.
  const toggleStudentValue = (
    index: number,
    key: "mathsCourses" | "preferredDays",
    value: string
  ) => {
    setStudents((current) =>
      current.map((student, i) =>
        i === index ? { ...student, [key]: toggle(student[key], value) } : student
      )
    );
  };

  const selectEnglishCourse = (index: number, code: string) => {
    setStudents((current) =>
      current.map((student, i) =>
        i === index
          ? {
              ...student,
              englishCourse: student.englishCourse === code ? "" : code,
            }
          : student
      )
    );
  };

  const validate = () => {
    const found: string[] = [];

    if (!parent.parentFirstName.trim() || !parent.parentLastName.trim()) {
      found.push("Enter the parent or guardian's first and last name.");
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(parent.parentEmail.trim())) {
      found.push("Enter a valid email address.");
    }
    if (!parent.parentPhone.trim()) {
      found.push("Enter a contact phone number.");
    }

    students.forEach((student, index) => {
      const label =
        students.length > 1 ? `Student ${index + 1}: ` : "";

      if (!student.studentFirstName.trim() || !student.studentLastName.trim()) {
        found.push(`${label}Enter the student's first and last name.`);
      }
      if (!student.school.trim()) {
        found.push(`${label}Enter the school the student attends.`);
      }
      if (!student.currentYear) {
        found.push(`${label}Select the student's current year.`);
      }
      if (!student.studentStatus) {
        found.push(
          `${label}Tell us whether the student currently attends Tenacity.`
        );
      }
      if (student.mathsCourses.length === 0 && !student.englishCourse) {
        found.push(`${label}Select at least one Maths or English course.`);
      }
    });

    if (!turnstileToken) {
      found.push("Please complete the verification before submitting.");
    }

    return found;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const found = validate();
    setErrors(found);
    if (found.length > 0) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/year11-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent, students, turnstileToken }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      setSubmitted(true);
    } catch (error) {
      console.error("Year 11 interest submission failed:", error);
      setErrors([
        "Something went wrong sending your registration. Please try again, or contact us directly.",
      ]);
      resetTurnstile();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head
        title="Year 11 classes - register your interest"
        description="Register your interest in Tenacity Tutoring's Year 11 Maths and English classes. Small groups, two subject tutors in every class."
      />
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
      />

      <header className="nav solid">
        <div className="wrap nav-inner">
          <Link
            href="/"
            className="nav-logo"
            aria-label="Tenacity Tutoring home"
          >
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
              <h1>Year 11 classes</h1>
              <p>
                Small groups, clear teaching and individual help with the work
                that matters at school. Tell us your child&apos;s subject,
                course level and school so we can form the right groups.
              </p>
            </div>

            {!submitted && (
              <div className="reg-card" style={{ marginBottom: "1.6rem" }}>
                <h2 style={{ fontSize: "1.35rem", marginBottom: ".6rem" }}>
                  How classes run
                </h2>
                <p style={{ color: "var(--muted)", marginBottom: "1.4rem" }}>
                  Every class has two capable subject tutors. Both work closely
                  with students through questions, guided practice, re-teaching,
                  extension work and current school assessments. Maths runs as
                  small course-based groups; English groups students by school so
                  they can work through the same modules, texts and assessment
                  timing.
                </p>

                <h3
                  style={{
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    marginBottom: ".8rem",
                  }}
                >
                  Year 11 fees
                </h3>
                <div className="reg-summary" style={{ marginBottom: 0 }}>
                  <dl>
                    <dt>Standard and Advanced classes</dt>
                    <dd>2 hours | $130 per session</dd>
                    <dt>Extension classes</dt>
                    <dd>1.5 hours | $100 per session</dd>
                  </dl>
                  <p
                    style={{
                      color: "var(--muted)",
                      fontSize: ".88rem",
                      marginTop: "1rem",
                      marginBottom: 0,
                    }}
                  >
                    Senior pricing keeps our existing high-school rate: $70 for
                    the first hour, with $10 off the second hour.
                  </p>
                </div>
              </div>
            )}

            <div className="reg-card">
              {submitted ? (
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
                  <h2>Interest registered</h2>
                  <p>
                    Thanks - we have your details. Once we know each
                    student&apos;s subject, course level and school we will form
                    the groups and get in touch to confirm class times and
                    enrolment details.
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
              ) : (
                <form onSubmit={handleSubmit} noValidate>
                  <h2 style={{ fontSize: "1.35rem", marginBottom: ".4rem" }}>
                    Parent or guardian
                  </h2>
                  <p className="step-sub">
                    We will use these details to confirm groups and class times.
                  </p>

                  <div className="reg-form-grid">
                    <div className="reg-field">
                      <label htmlFor="parentFirstName">
                        First name <span className="req">*</span>
                      </label>
                      <input
                        id="parentFirstName"
                        type="text"
                        placeholder="First name"
                        value={parent.parentFirstName}
                        onChange={(e) =>
                          updateParent({ parentFirstName: e.target.value })
                        }
                      />
                    </div>
                    <div className="reg-field">
                      <label htmlFor="parentLastName">
                        Last name <span className="req">*</span>
                      </label>
                      <input
                        id="parentLastName"
                        type="text"
                        placeholder="Last name"
                        value={parent.parentLastName}
                        onChange={(e) =>
                          updateParent({ parentLastName: e.target.value })
                        }
                      />
                    </div>
                    <div className="reg-field">
                      <label htmlFor="parentEmail">
                        Email <span className="req">*</span>
                      </label>
                      <input
                        id="parentEmail"
                        type="email"
                        placeholder="you@email.com"
                        value={parent.parentEmail}
                        onChange={(e) =>
                          updateParent({ parentEmail: e.target.value })
                        }
                      />
                    </div>
                    <div className="reg-field">
                      <label htmlFor="parentPhone">
                        Phone <span className="req">*</span>
                      </label>
                      <input
                        id="parentPhone"
                        type="tel"
                        placeholder="04xx xxx xxx"
                        value={parent.parentPhone}
                        onChange={(e) =>
                          updateParent({ parentPhone: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  {students.map((student, index) => (
                    <div key={index} className="child-extra">
                      {students.length > 1 && (
                        <div className="child-chip">Student {index + 1}</div>
                      )}

                      <div className="reg-form-grid">
                        <div className="reg-field">
                          <label htmlFor={`studentFirstName-${index}`}>
                            Student&apos;s first name{" "}
                            <span className="req">*</span>
                          </label>
                          <input
                            id={`studentFirstName-${index}`}
                            type="text"
                            placeholder="First name"
                            value={student.studentFirstName}
                            onChange={(e) =>
                              updateStudent(index, {
                                studentFirstName: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="reg-field">
                          <label htmlFor={`studentLastName-${index}`}>
                            Student&apos;s last name{" "}
                            <span className="req">*</span>
                          </label>
                          <input
                            id={`studentLastName-${index}`}
                            type="text"
                            placeholder="Last name"
                            value={student.studentLastName}
                            onChange={(e) =>
                              updateStudent(index, {
                                studentLastName: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="reg-field full">
                          <label htmlFor={`school-${index}`}>
                            School <span className="req">*</span>
                          </label>
                          <input
                            id={`school-${index}`}
                            type="text"
                            placeholder="Which school does your child attend?"
                            value={student.school}
                            onChange={(e) =>
                              updateStudent(index, { school: e.target.value })
                            }
                          />
                          <p className="field-help">
                            English groups are formed by school so classes match
                            the same modules, texts and assessment timing.
                          </p>
                        </div>
                        <div className="reg-field">
                          <label htmlFor={`currentYear-${index}`}>
                            Current year <span className="req">*</span>
                          </label>
                          <div className="select-wrap">
                            <select
                              id={`currentYear-${index}`}
                              value={student.currentYear}
                              onChange={(e) =>
                                updateStudent(index, {
                                  currentYear: e.target.value,
                                })
                              }
                            >
                              <option value="">Select an option</option>
                              {CURRENT_YEAR_OPTIONS.map((option) => (
                                <option key={option.code} value={option.code}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="reg-field">
                          <label htmlFor={`studentStatus-${index}`}>
                            Tenacity student? <span className="req">*</span>
                          </label>
                          <div className="select-wrap">
                            <select
                              id={`studentStatus-${index}`}
                              value={student.studentStatus}
                              onChange={(e) =>
                                updateStudent(index, {
                                  studentStatus: e.target.value,
                                })
                              }
                            >
                              <option value="">Select an option</option>
                              {STUDENT_STATUS_OPTIONS.map((option) => (
                                <option key={option.code} value={option.code}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      <div style={{ marginTop: "1.6rem" }}>
                        <div className="ce-title">Mathematics</div>
                        <p className="slot-hint">
                          Select any that apply. Extension 1 is a separate
                          course, so it can be taken on its own or alongside
                          Advanced.
                        </p>
                        <div className="choice-grid cols-3">
                          {MATHS_COURSE_OPTIONS.map((option) => {
                            const selected = student.mathsCourses.includes(
                              option.code
                            );
                            return (
                              <button
                                key={option.code}
                                type="button"
                                className={`choice${selected ? " selected" : ""}`}
                                aria-pressed={selected}
                                onClick={() =>
                                  toggleStudentValue(
                                    index,
                                    "mathsCourses",
                                    option.code
                                  )
                                }
                              >
                                <Tick />
                                <span className="ch-k">{option.label}</span>
                                <span className="ch-d">{option.detail}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div style={{ marginTop: "1.6rem" }}>
                        <div className="ce-title">English</div>
                        <p className="slot-hint">
                          Select one pathway. Senior English pathways are never
                          combined.
                        </p>
                        <div className="choice-grid cols-3">
                          {ENGLISH_COURSE_OPTIONS.map((option) => {
                            const selected = student.englishCourse === option.code;
                            return (
                              <button
                                key={option.code}
                                type="button"
                                className={`choice${selected ? " selected" : ""}`}
                                aria-pressed={selected}
                                onClick={() =>
                                  selectEnglishCourse(index, option.code)
                                }
                              >
                                <Tick />
                                <span className="ch-k">{option.label}</span>
                                <span className="ch-d">{option.detail}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div style={{ marginTop: "1.6rem" }}>
                        <div className="ce-title">
                          Preferred days{" "}
                          <span
                            style={{
                              fontWeight: 500,
                              color: "var(--muted)",
                              fontSize: ".88rem",
                            }}
                          >
                            (optional)
                          </span>
                        </div>
                        <p className="slot-hint">
                          Classes run Monday to Thursday, 4-8pm. This helps us
                          shape the timetable.
                        </p>
                        <div className="choice-grid cols-3">
                          {PREFERRED_DAY_OPTIONS.map((option) => {
                            const selected = student.preferredDays.includes(
                              option.code
                            );
                            return (
                              <button
                                key={option.code}
                                type="button"
                                className={`choice${selected ? " selected" : ""}`}
                                aria-pressed={selected}
                                onClick={() =>
                                  toggleStudentValue(
                                    index,
                                    "preferredDays",
                                    option.code
                                  )
                                }
                              >
                                <Tick />
                                <span className="ch-k">{option.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="reg-field" style={{ marginTop: "1.6rem" }}>
                        <label htmlFor={`notes-${index}`}>
                          Anything else we should know? (optional)
                        </label>
                        <textarea
                          id={`notes-${index}`}
                          placeholder="Current results, goals, or anything you would like us to keep in mind."
                          value={student.notes}
                          onChange={(e) =>
                            updateStudent(index, { notes: e.target.value })
                          }
                        />
                      </div>

                      {students.length > 1 && (
                        <button
                          type="button"
                          className="cc-btn danger"
                          style={{ marginTop: "1rem" }}
                          onClick={() =>
                            setStudents((current) =>
                              current.filter((_, i) => i !== index)
                            )
                          }
                        >
                          Remove student {index + 1}
                        </button>
                      )}
                    </div>
                  ))}

                  {students.length < MAX_STUDENTS_PER_INTEREST && (
                    <button
                      type="button"
                      className="add-child"
                      style={{ marginTop: "1.6rem" }}
                      onClick={() =>
                        setStudents((current) => [...current, emptyStudent()])
                      }
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      Add another child
                    </button>
                  )}

                  <p
                    className="slot-hint"
                    style={{ marginTop: "1.8rem", marginBottom: "1rem" }}
                  >
                    Registering interest does not confirm a place. Classes are
                    confirmed once we have enough committed enrolments to form a
                    group, and we will contact you before anything is finalised.
                  </p>

                  <div
                    className={`reg-human${turnstileError ? " err" : ""}`}
                    style={{ marginBottom: "1rem" }}
                  >
                    <div ref={turnstileRef} />
                    {turnstileError && (
                      <p
                        className="reg-human-error"
                        style={{ display: "block" }}
                      >
                        {turnstileError}
                      </p>
                    )}
                  </div>

                  {errors.length > 0 && (
                    <div
                      role="alert"
                      style={{
                        background: "#fee4e2",
                        color: "#b42318",
                        borderRadius: "var(--r-sm)",
                        padding: "14px 18px",
                        marginBottom: "1.2rem",
                        fontSize: ".92rem",
                      }}
                    >
                      <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                        {errors.map((error) => (
                          <li key={error}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="btn btn-primary btn-lg reg-next"
                    disabled={submitting}
                  >
                    {submitting ? "Sending..." : "Register interest"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
