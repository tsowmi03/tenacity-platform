import { db } from "@lib/firebaseConfig";
import {
  isReferralSourceCode,
  REFERRAL_SOURCE_OPTIONS,
  referralSourceOption,
  type ReferralSourceCode,
} from "@lib/referralSources";
import { sendEmailForm } from "@lib/utils/apiHelper";
import { collection, getDocs } from "firebase/firestore";
import { useEffect } from "react";

export type DesignRuntimePage =
  | "home"
  | "programs"
  | "about"
  | "contact"
  | "register";

type DesignRuntimeProps = {
  page: DesignRuntimePage;
};

type TurnstileWidgetId = string;

type TurnstileRenderOptions = {
  sitekey: string;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
};

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: TurnstileRenderOptions
      ) => TurnstileWidgetId;
      reset: (widgetId?: TurnstileWidgetId) => void;
    };
  }
}

type DesignClass = {
  id: string;
  type?: string;
  enrolledStudents?: unknown[];
  startTime?: string;
  endTime?: string;
  capacity?: number;
  day?: string;
  [key: string]: unknown;
};

type StudentData = {
  studentYear: string;
  studentSubjects: string[];
  classes: DesignClass[];
  studentFirstName: string;
  studentLastName: string;
  allergies: string;
  additionalInfo: string;
  permissionToLeave: boolean;
};

type FamilyData = {
  carerFirstName: string;
  carerLastName: string;
  carerEmail: string;
  carerPhone: string;
  emergencyContactFirstName: string;
  emergencyContactLastName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
  referralSource: ReferralSourceCode | "";
  referralSourceDetail: string;
  termsAccepted: boolean;
};

const emptyStudent = (): StudentData => ({
  studentYear: "",
  studentSubjects: [],
  classes: [],
  studentFirstName: "",
  studentLastName: "",
  allergies: "",
  additionalInfo: "",
  permissionToLeave: false,
});

const cloneStudent = (student: StudentData): StudentData => ({
  ...student,
  studentSubjects: [...student.studentSubjects],
  classes: [...student.classes],
});

const TOTAL_REG_STEPS = 7;
const MAX_CHILDREN = 5;

const trimStringsDeep = <T,>(value: T): T => {
  if (typeof value === "string") return value.trim() as T;
  if (Array.isArray(value)) {
    return value.map((item) => trimStringsDeep(item)) as T;
  }
  if (value && typeof value === "object") {
    if (value instanceof Date) return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        trimStringsDeep(val),
      ])
    ) as T;
  }
  return value;
};

const getEl = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T | null;

const fromDisplaySubject = (subject: string) =>
  subject === "Mathematics" ? "Maths" : subject;

const toDisplaySubject = (subject: string) =>
  subject === "Maths" ? "Mathematics" : subject;

const splitFullName = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
};

const formatClassTime = (time?: string) => {
  if (!time) return "";
  if (/am|pm/i.test(time)) return time;

  const [hoursRaw, minutesRaw = "00"] = time.split(":");
  const hours = Number.parseInt(hoursRaw, 10);
  if (Number.isNaN(hours)) return time;

  const minutes = Number.parseInt(minutesRaw, 10);
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${String(Number.isNaN(minutes) ? 0 : minutes).padStart(
    2,
    "0"
  )} ${suffix}`;
};

const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const classSortValue = (slot: DesignClass) => {
  const dayIndex = dayOrder.indexOf(String(slot.day ?? ""));
  return `${dayIndex === -1 ? 99 : dayIndex}-${slot.startTime ?? ""}`;
};

const classSpotsRemaining = (slot: DesignClass) => {
  if (
    typeof slot.capacity !== "number" ||
    !Number.isFinite(slot.capacity) ||
    slot.capacity <= 0
  ) {
    return null;
  }

  const enrolled = Array.isArray(slot.enrolledStudents)
    ? slot.enrolledStudents.length
    : 0;
  return Math.max(0, Math.floor(slot.capacity) - enrolled);
};

const setupDesignInteractions = (page: DesignRuntimePage) => {
  const cleanups: Array<() => void> = [];
  const addListener = (
    target: EventTarget | null,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions
  ) => {
    if (!target) return;
    target.addEventListener(type, listener, options);
    cleanups.push(() => target.removeEventListener(type, listener, options));
  };

  const nav = getEl<HTMLElement>("nav");
  const forceSolid = Boolean(nav?.hasAttribute("data-solid"));
  const setNavState = () => {
    if (!nav) return;
    if (forceSolid || window.scrollY > 40) nav.classList.add("solid");
    else nav.classList.remove("solid");
  };
  addListener(window, "scroll", setNavState as EventListener, {
    passive: true,
  });
  setNavState();

  const menu = getEl<HTMLElement>("mobileMenu");
  const openBtn = getEl<HTMLButtonElement>("hamburger");
  const closeBtn = getEl<HTMLButtonElement>("mmClose");
  const openMenu = () => {
    menu?.classList.add("open");
    document.body.style.overflow = "hidden";
  };
  const closeMenu = () => {
    menu?.classList.remove("open");
    document.body.style.overflow = "";
  };
  addListener(openBtn, "click", openMenu as EventListener);
  addListener(closeBtn, "click", closeMenu as EventListener);
  menu
    ?.querySelectorAll<HTMLAnchorElement>("a")
    .forEach((link) => addListener(link, "click", closeMenu as EventListener));

  const heroGo = getEl<HTMLAnchorElement>("hero-go");
  addListener(heroGo, "click", () => {
    const year = getEl<HTMLSelectElement>("hero-year")?.value;
    const subject = getEl<HTMLSelectElement>("hero-subject")?.value;
    const prefill: Record<string, string> = {};
    if (year) prefill.year = year;
    if (subject) prefill.subject = subject;
    if (Object.keys(prefill).length) {
      window.localStorage.setItem("tenacity_prefill", JSON.stringify(prefill));
    }
  });

  const faqItems = Array.from(
    document.querySelectorAll<HTMLElement>("#faqList .faq-item")
  );
  const closeFaqItem = (item: HTMLElement) => {
    item.classList.remove("open");
    const answer = item.querySelector<HTMLElement>(".faq-a");
    if (answer) answer.style.maxHeight = "";
  };
  const openFaqItem = (item: HTMLElement) => {
    item.classList.add("open");
    const answer = item.querySelector<HTMLElement>(".faq-a");
    if (answer) answer.style.maxHeight = `${answer.scrollHeight}px`;
  };
  faqItems.forEach((item) => {
    const question = item.querySelector<HTMLButtonElement>(".faq-q");
    addListener(question, "click", () => {
      const isOpen = item.classList.contains("open");
      faqItems.forEach(closeFaqItem);
      if (!isOpen) openFaqItem(item);
    });
  });
  if (faqItems.length) openFaqItem(faqItems[0]);

  const track = getEl<HTMLElement>("revTrack");
  const navWrap = getEl<HTMLElement>("revNav");
  let reviewTimer: number | null = null;
  let resizeTimer: number | null = null;
  if (track && navWrap) {
    const cards = Array.from(track.children) as HTMLElement[];
    let index = 0;
    let pages = 0;

    const perView = () => {
      if (window.innerWidth <= 760) return 1;
      if (window.innerWidth <= 1000) return 2;
      return 3;
    };

    const go = (nextIndex: number) => {
      pages = Math.max(1, cards.length - perView() + 1);
      index = Math.max(0, Math.min(nextIndex, pages - 1));
      const card = cards[0];
      const step = card ? card.getBoundingClientRect().width + 24 : 0;
      track.style.transform = `translateX(${-index * step}px)`;
      Array.from(navWrap.children).forEach((dot, dotIndex) => {
        dot.classList.toggle("active", dotIndex === index);
      });
    };

    const restart = () => {
      if (reviewTimer) window.clearInterval(reviewTimer);
      reviewTimer = window.setInterval(() => {
        go(index + 1 >= pages ? 0 : index + 1);
      }, 5000);
    };

    const buildDots = () => {
      navWrap.innerHTML = "";
      pages = Math.max(1, cards.length - perView() + 1);
      for (let i = 0; i < pages; i += 1) {
        const dot = document.createElement("button");
        dot.className = `rev-dot${i === 0 ? " active" : ""}`;
        dot.setAttribute("aria-label", `Go to review ${i + 1}`);
        dot.addEventListener("click", () => {
          go(i);
          restart();
        });
        navWrap.appendChild(dot);
      }
    };

    const rebuild = () => {
      buildDots();
      go(Math.min(index, pages - 1));
    };

    buildDots();
    go(0);
    restart();
    addListener(window, "resize", () => {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(rebuild, 200);
    });

    let startX = 0;
    let startY = 0;
    let swiping = false;
    addListener(
      track,
      "touchstart",
      ((event: TouchEvent) => {
        startX = event.touches[0]?.clientX ?? 0;
        startY = event.touches[0]?.clientY ?? 0;
        swiping = true;
      }) as EventListener,
      { passive: true }
    );
    addListener(
      track,
      "touchend",
      ((event: TouchEvent) => {
        if (!swiping) return;
        swiping = false;
        const touch = event.changedTouches[0];
        if (!touch) return;
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
          go(dx < 0 ? index + 1 : index - 1);
          restart();
        }
      }) as EventListener,
      { passive: true }
    );
  }

  const form = getEl<HTMLFormElement>("enquireForm");
  if (form) {
    const clearFormError = () => {
      form.querySelector<HTMLElement>(".form-error")?.remove();
    };
    const showFormError = (message: string) => {
      clearFormError();
      const error = document.createElement("p");
      error.className = "form-error";
      error.textContent = message;
      error.style.color = "#b42318";
      error.style.fontWeight = "600";
      error.style.marginTop = "14px";
      form.appendChild(error);
    };
    const submit = async (event: Event) => {
      event.preventDefault();
      clearFormError();

      const required = ["f-name", "f-phone", "f-email"];
      let ok = true;
      required.forEach((id) => {
        const input = getEl<HTMLInputElement>(id);
        if (!input?.value.trim()) {
          if (input) input.style.borderColor = "#e0573a";
          ok = false;
        } else {
          input.style.borderColor = "";
        }
      });

      const email = getEl<HTMLInputElement>("f-email");
      if (
        email?.value &&
        !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value)
      ) {
        email.style.borderColor = "#e0573a";
        ok = false;
      }
      if (!ok) return;

      const button = form.querySelector<HTMLButtonElement>(
        'button[type="submit"]'
      );
      const buttonHtml = button?.innerHTML;
      if (button) {
        button.disabled = true;
        button.textContent = "Sending...";
      }

      const year = getEl<HTMLSelectElement>("f-year")?.value;
      const subject = getEl<HTMLSelectElement>("f-subject")?.value;
      const message = getEl<HTMLTextAreaElement>("f-msg")?.value.trim() ?? "";
      const details = [year, subject].filter(Boolean).join(" ");

      try {
        await sendEmailForm({
          name: getEl<HTMLInputElement>("f-name")?.value.trim() ?? "",
          phoneNumber: getEl<HTMLInputElement>("f-phone")?.value.trim() ?? "",
          email: email?.value.trim() ?? "",
          reason: details
            ? `Enquiry Request for ${details}`
            : "Enquiry Request",
          additionalInfo: message,
        });
        form.style.display = "none";
        getEl<HTMLElement>("formSuccess")?.classList.add("show");
      } catch (error) {
        console.error("Failed to send enquiry:", error);
        showFormError("Failed to send your message. Please try again later.");
        if (button) {
          button.disabled = false;
          button.innerHTML = buttonHtml ?? "Send enquiry";
        }
      }
    };

    addListener(form, "submit", submit as EventListener);
    form.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
      addListener(input, "input", () => {
        input.style.borderColor = "";
        clearFormError();
      });
    });
  }

  const revealEls = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach((el) => observer.observe(el));
    cleanups.push(() => observer.disconnect());
  } else {
    revealEls.forEach((el) => el.classList.add("in"));
  }

  const slides = Array.from(
    document.querySelectorAll<HTMLElement>(".hero-bg .hero-slide")
  );
  let heroTimer: number | null = null;
  if (slides.length > 1) {
    let currentSlide = slides.findIndex((slide) =>
      slide.classList.contains("is-active")
    );
    if (currentSlide < 0) currentSlide = 0;
    heroTimer = window.setInterval(() => {
      slides[currentSlide]?.classList.remove("is-active");
      currentSlide = (currentSlide + 1) % slides.length;
      slides[currentSlide]?.classList.add("is-active");
    }, 5500);
  }

  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((link) => {
    addListener(link, "click", (event) => {
      const id = link.getAttribute("href");
      if (!id || id.length < 2) return;
      const target = document.querySelector<HTMLElement>(id);
      if (!target) return;
      event.preventDefault();
      const y = target.getBoundingClientRect().top + window.scrollY - 70;
      window.scrollTo({ top: y, behavior: "smooth" });
    });
  });

  if (page === "register") {
    cleanups.push(setupRegistrationRuntime());
  }

  return () => {
    cleanups.forEach((cleanup) => cleanup());
    document.body.style.overflow = "";
    if (reviewTimer) window.clearInterval(reviewTimer);
    if (resizeTimer) window.clearTimeout(resizeTimer);
    if (heroTimer) window.clearInterval(heroTimer);
  };
};

const setupRegistrationRuntime = () => {
  const cleanups: Array<() => void> = [];
  const addListener = (
    target: EventTarget | null,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions
  ) => {
    if (!target) return;
    target.addEventListener(type, listener, options);
    cleanups.push(() => target.removeEventListener(type, listener, options));
  };

  const steps = Array.from(document.querySelectorAll<HTMLElement>(".reg-step"));
  const stepItems = Array.from(document.querySelectorAll<HTMLElement>("#regSteps .rs"));
  const barFill = getEl<HTMLElement>("regBarFill");
  const backBtn = getEl<HTMLButtonElement>("regBack");
  const nextBtn = getEl<HTMLButtonElement>("regNext");
  const slotList = getEl<HTMLElement>("slotList");

  if (!steps.length || !barFill || !backBtn || !nextBtn || !slotList) {
    return () => undefined;
  }

  const family: FamilyData = {
    carerFirstName: "",
    carerLastName: "",
    carerEmail: "",
    carerPhone: "",
    emergencyContactFirstName: "",
    emergencyContactLastName: "",
    emergencyContactPhone: "",
    emergencyContactRelation: "",
    referralSource: "",
    referralSourceDetail: "",
    termsAccepted: false,
  };

  const students: StudentData[] = [];
  let draft: StudentData = emptyStudent();
  let editingIndex: number | null = null;

  let step = 1;
  let classSlots: DesignClass[] = [];
  let isSubmitting = false;
  let turnstileToken = "";
  let turnstileWidgetId: TurnstileWidgetId | null = null;
  let turnstileRetry: number | null = null;

  const markErr = (id: string, on: boolean) => {
    const input = getEl<HTMLElement>(id);
    const field = input?.closest(".reg-field") ?? input?.closest(".reg-check");
    field?.classList.toggle("err", on);
  };

  const markTurnstileErr = (on: boolean) => {
    getEl<HTMLElement>("turnstileCheck")?.classList.toggle("err", on);
  };

  const warn = () => {
    nextBtn.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-6px)" },
        { transform: "translateX(6px)" },
        { transform: "translateX(0)" },
      ],
      { duration: 260 }
    );
    return false;
  };

  const stageOf = (year: string) => {
    const yearNumber = Number.parseInt(year.replace("Year ", ""), 10);
    return yearNumber <= 6 ? "Primary" : "High School";
  };

  const requiredClassCount = () => draft.studentSubjects.length;

  const selectedClassIds = () => new Set(draft.classes.map((slot) => slot.id));

  const isSelected = (slot: DesignClass) => selectedClassIds().has(slot.id);

  // Spots already claimed by other children in this registration.
  const siblingClassCount = (slotId: string) =>
    students.reduce((count, student, index) => {
      if (index === editingIndex) return count;
      return (
        count + student.classes.filter((slot) => slot.id === slotId).length
      );
    }, 0);

  const adjustedSpotsRemaining = (slot: DesignClass) => {
    const remaining = classSpotsRemaining(slot);
    if (remaining === null) return null;
    return Math.max(0, remaining - siblingClassCount(slot.id));
  };

  const matchingSlots = () =>
    classSlots
      .filter((slot) => {
        const remaining = adjustedSpotsRemaining(slot);
        return remaining === null || remaining > 0 || isSelected(slot);
      })
      .sort((a, b) => classSortValue(a).localeCompare(classSortValue(b)));

  const buildSlots = () => {
    slotList.innerHTML = "";
    const hint = getEl<HTMLElement>("slotHint");
    const required = requiredClassCount();
    if (hint) {
      hint.textContent =
        required > 1
          ? `Select ${required} different weekly class times. Each class can support Maths or English.`
          : "Select your preferred weekly class time.";
    }

    if (!classSlots.length) {
      const empty = document.createElement("p");
      empty.className = "slot-hint";
      empty.textContent = "Loading class times...";
      slotList.appendChild(empty);
      return;
    }

    const slots = matchingSlots();
    if (!slots.length) {
      const empty = document.createElement("div");
      empty.className = "slot";
      empty.innerHTML = `<span class="slot-day">Full</span><span class="slot-meta"><span class="slot-time">No available times</span><br><span class="slot-sub">${stageOf(
        draft.studentYear
      )} · ${draft.studentYear}</span></span><span class="slot-tag neutral">Ask us</span>`;
      slotList.appendChild(empty);
      return;
    }

    slots.forEach((slot) => {
      const button = document.createElement("button");
      const selected = isSelected(slot);
      const selectionFull = draft.classes.length >= required;
      button.type = "button";
      button.className = `slot${selected ? " selected" : ""}`;
      button.disabled = selectionFull && !selected;
      button.dataset.id = slot.id;
      const remaining = adjustedSpotsRemaining(slot);
      const availabilityClass =
        remaining === null
          ? "neutral"
          : remaining === 1
            ? "critical"
            : remaining === 2
              ? "limited"
              : "available";
      const availabilityLabel =
        remaining === null
          ? "Contact us"
          : `${remaining} ${remaining === 1 ? "spot" : "spots"}`;
      button.innerHTML =
        `<span class="slot-day">${slot.day ?? "Class"}</span>` +
        `<span class="slot-meta"><span class="slot-time">${formatClassTime(
          slot.startTime
        )} - ${formatClassTime(slot.endTime)}</span>` +
        `<br><span class="slot-sub">${stageOf(draft.studentYear)} · ${
          draft.studentYear
        }</span></span>` +
        `<span class="slot-tag ${availabilityClass}">${availabilityLabel}</span>` +
        '<span class="slot-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg></span>';
      button.addEventListener("click", () => {
        if (isSelected(slot)) {
          draft.classes = draft.classes.filter(
            (selected) => selected.id !== slot.id
          );
        } else if (draft.classes.length < requiredClassCount()) {
          draft.classes.push(slot);
        }
        buildSlots();
      });
      slotList.appendChild(button);
    });
  };

  const studentName = (student: StudentData) =>
    `${student.studentFirstName} ${student.studentLastName}`.trim();

  const studentMeta = (student: StudentData) =>
    [
      student.studentYear,
      student.studentSubjects.map(toDisplaySubject).join(" & "),
      student.classes
        .map((slot) => `${slot.day ?? ""} ${formatClassTime(slot.startTime)}`)
        .join(" · "),
    ]
      .filter(Boolean)
      .join(" · ");

  const buildSummary = () => {
    const summary = getEl<HTMLElement>("summaryList");
    if (!summary) return;
    const referralOption = referralSourceOption(family.referralSource);
    const referralSummary = referralOption
      ? `${referralOption.label}${
          family.referralSourceDetail ? `: ${family.referralSourceDetail}` : ""
        }`
      : "Not selected";
    const rows = students
      .map((student, index): [string, string] => [
        studentName(student) || `Child ${index + 1}`,
        studentMeta(student),
      ])
      .concat([["Heard about us", referralSummary]]);
    summary.replaceChildren(
      ...rows.flatMap(([label, value]) => {
        const term = document.createElement("dt");
        term.textContent = label;
        const description = document.createElement("dd");
        description.textContent = value || "-";
        return [term, description];
      })
    );
  };

  const syncChoiceUi = () => {
    document
      .querySelectorAll<HTMLButtonElement>("#yearGrid .choice")
      .forEach((button) => {
        button.classList.toggle(
          "selected",
          Boolean(draft.studentYear) && button.dataset.val === draft.studentYear
        );
      });
    document
      .querySelectorAll<HTMLButtonElement>("#subjectGrid .choice")
      .forEach((button) => {
        button.classList.toggle(
          "selected",
          draft.studentSubjects.includes(
            fromDisplaySubject(button.dataset.val ?? "")
          )
        );
      });
  };

  const syncStudentInputs = () => {
    const firstName = getEl<HTMLInputElement>("studentFirstName");
    const lastName = getEl<HTMLInputElement>("studentLastName");
    if (firstName) firstName.value = draft.studentFirstName;
    if (lastName) lastName.value = draft.studentLastName;
    markErr("studentFirstName", false);
    markErr("studentLastName", false);
  };

  const updateChildChip = () => {
    const chip = getEl<HTMLElement>("childChip");
    if (!chip) return;
    const inChildSteps = step <= 4;
    const show =
      inChildSteps && (students.length > 0 || editingIndex !== null);
    chip.toggleAttribute("hidden", !show);
    if (!show) return;
    const childNumber = (editingIndex ?? students.length) + 1;
    chip.textContent = draft.studentFirstName
      ? `Child ${childNumber} · ${draft.studentFirstName}`
      : `Child ${childNumber}`;
  };

  const commitDraft = () => {
    const committed = cloneStudent(draft);
    if (editingIndex !== null) students[editingIndex] = committed;
    else students.push(committed);
    editingIndex = null;
  };

  const startChild = (index: number | null) => {
    editingIndex = index;
    draft = index === null ? emptyStudent() : cloneStudent(students[index]);
    step = 1;
    render();
  };

  const buildChildList = () => {
    const list = getEl<HTMLElement>("childList");
    if (!list) return;
    list.replaceChildren(
      ...students.map((student, index) => {
        const card = document.createElement("div");
        card.className = "child-card";

        const info = document.createElement("div");
        info.className = "cc-info";
        const name = document.createElement("div");
        name.className = "cc-name";
        name.textContent = studentName(student) || `Child ${index + 1}`;
        const meta = document.createElement("div");
        meta.className = "cc-meta";
        meta.textContent = studentMeta(student);
        info.append(name, meta);

        const actions = document.createElement("div");
        actions.className = "cc-actions";
        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "cc-btn";
        edit.textContent = "Edit";
        edit.addEventListener("click", () => startChild(index));
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "cc-btn danger";
        remove.textContent = "Remove";
        remove.addEventListener("click", () => {
          students.splice(index, 1);
          if (!students.length) startChild(null);
          else buildChildList();
        });
        actions.append(edit, remove);

        card.append(info, actions);
        return card;
      })
    );

    const atLimit = students.length >= MAX_CHILDREN;
    getEl<HTMLButtonElement>("addChildBtn")?.toggleAttribute("hidden", atLimit);
    getEl<HTMLElement>("childLimitHint")?.toggleAttribute("hidden", !atLimit);
  };

  const buildChildExtras = () => {
    const container = getEl<HTMLElement>("childExtras");
    if (!container) return;
    container.replaceChildren(
      ...students.map((student, index) => {
        const block = document.createElement("div");
        block.className = "child-extra";

        if (students.length > 1) {
          const title = document.createElement("h3");
          title.className = "ce-title";
          title.textContent = `For ${
            studentName(student) || `child ${index + 1}`
          }`;
          block.appendChild(title);
        }

        const grid = document.createElement("div");
        grid.className = "reg-form-grid";

        const allergiesField = document.createElement("div");
        allergiesField.className = "reg-field full";
        const allergiesLabel = document.createElement("label");
        allergiesLabel.textContent = "Allergies / medical (optional)";
        const allergiesInput = document.createElement("input");
        allergiesInput.type = "text";
        allergiesInput.placeholder = "Anything we should know";
        allergiesInput.value = student.allergies;
        allergiesInput.addEventListener("input", () => {
          student.allergies = allergiesInput.value;
        });
        allergiesField.append(allergiesLabel, allergiesInput);

        const infoField = document.createElement("div");
        infoField.className = "reg-field full";
        const infoLabel = document.createElement("label");
        infoLabel.textContent = "Anything else? (optional)";
        const infoInput = document.createElement("textarea");
        infoInput.placeholder = "Goals, areas to focus on…";
        infoInput.value = student.additionalInfo;
        infoInput.addEventListener("input", () => {
          student.additionalInfo = infoInput.value;
        });
        infoField.append(infoLabel, infoInput);

        grid.append(allergiesField, infoField);

        const permission = document.createElement("label");
        permission.className = "reg-check";
        const permissionInput = document.createElement("input");
        permissionInput.type = "checkbox";
        permissionInput.checked = student.permissionToLeave;
        permissionInput.addEventListener("change", () => {
          student.permissionToLeave = permissionInput.checked;
        });
        const permissionText = document.createElement("span");
        permissionText.className = "rc-t";
        const emphasis = document.createElement("b");
        emphasis.textContent = "leave the centre unaccompanied";
        permissionText.append(
          `I give permission for ${
            student.studentFirstName || "my child"
          } to `,
          emphasis,
          " after their class ends."
        );
        permission.append(permissionInput, permissionText);

        block.append(grid, permission);
        return block;
      })
    );
  };

  const setupReferralSource = () => {
    const select = getEl<HTMLSelectElement>("referralSource");
    if (!select || select.options.length > 1) return;

    REFERRAL_SOURCE_OPTIONS.forEach((source) => {
      const option = document.createElement("option");
      option.value = source.code;
      option.textContent = source.label;
      select.appendChild(option);
    });
  };

  const updateReferralSource = () => {
    const select = getEl<HTMLSelectElement>("referralSource");
    const detailField = getEl<HTMLElement>("referralSourceDetailField");
    const detailInput = getEl<HTMLInputElement>("referralSourceDetail");
    const detailLabel = getEl<HTMLElement>("referralSourceDetailLabel");
    const selected = select?.value ?? "";
    const option = referralSourceOption(selected);
    const sourceChanged = selected !== family.referralSource;

    family.referralSource = isReferralSourceCode(selected) ? selected : "";
    detailField?.toggleAttribute("hidden", !option?.detailLabel);

    if (sourceChanged && detailInput) {
      detailInput.value = "";
      family.referralSourceDetail = "";
    }
    if (detailLabel && option?.detailLabel) {
      detailLabel.textContent = option.detailLabel;
    }
    if (!option?.detailLabel && detailInput) {
      detailInput.value = "";
      family.referralSourceDetail = "";
    }

    select?.closest(".reg-field")?.classList.remove("err");
    buildSummary();
  };

  const resetTurnstile = () => {
    turnstileToken = "";
    markTurnstileErr(false);
    if (turnstileWidgetId && window.turnstile) {
      window.turnstile.reset(turnstileWidgetId);
    }
  };

  const renderTurnstile = () => {
    const container = getEl<HTMLElement>("turnstileWidget");
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

    if (!container || turnstileWidgetId) return;

    if (!siteKey) {
      markTurnstileErr(true);
      const error = getEl<HTMLElement>("turnstileError");
      if (error) error.textContent = "Verification is not configured.";
      return;
    }

    if (!window.turnstile) {
      if (!turnstileRetry) {
        turnstileRetry = window.setTimeout(() => {
          turnstileRetry = null;
          renderTurnstile();
        }, 250);
      }
      return;
    }

    turnstileWidgetId = window.turnstile.render(container, {
      sitekey: siteKey,
      callback: (token) => {
        turnstileToken = token;
        markTurnstileErr(false);
      },
      "expired-callback": () => {
        turnstileToken = "";
      },
      "error-callback": () => {
        turnstileToken = "";
        markTurnstileErr(true);
      },
    });
  };

  const applySameAsParent = () => {
    const sameAsParent = getEl<HTMLInputElement>("sameAsParent");
    const on = Boolean(sameAsParent?.checked);
    const emName = getEl<HTMLInputElement>("emName");
    const emPhone = getEl<HTMLInputElement>("emPhone");
    const emRelation = getEl<HTMLInputElement>("emRelation");

    if (on) {
      const fullName = `${getEl<HTMLInputElement>("carerFirstName")?.value.trim() ?? ""} ${
        getEl<HTMLInputElement>("carerLastName")?.value.trim() ?? ""
      }`.trim();
      if (emName) emName.value = fullName;
      if (emPhone) emPhone.value = getEl<HTMLInputElement>("carerPhone")?.value.trim() ?? "";
      if (emRelation) emRelation.value = "Parent / Carer";
    } else {
      if (emName) emName.value = "";
      if (emPhone) emPhone.value = "";
      if (emRelation) emRelation.value = "";
    }

    ["emName", "emPhone", "emRelation"].forEach((id) => {
      const input = getEl<HTMLInputElement>(id);
      if (!input) return;
      input.disabled = on;
      const field = input.closest(".reg-field");
      field?.classList.remove("err");
      field?.classList.toggle("autofilled", on);
    });
  };

  const validate = () => {
    if (step === 1) return Boolean(draft.studentYear) || warn();
    if (step === 2) return draft.studentSubjects.length > 0 || warn();
    if (step === 3) {
      const uniqueClassCount = selectedClassIds().size;
      return (
        draft.classes.length === draft.studentSubjects.length &&
        uniqueClassCount === draft.studentSubjects.length
      ) || warn();
    }
    if (step === 4) {
      draft.studentFirstName =
        getEl<HTMLInputElement>("studentFirstName")?.value.trim() ?? "";
      draft.studentLastName =
        getEl<HTMLInputElement>("studentLastName")?.value.trim() ?? "";
      markErr("studentFirstName", !draft.studentFirstName);
      markErr("studentLastName", !draft.studentLastName);
      return Boolean(draft.studentFirstName && draft.studentLastName) || warn();
    }
    if (step === 5) return students.length > 0 || warn();
    if (step === 6) {
      family.carerFirstName =
        getEl<HTMLInputElement>("carerFirstName")?.value.trim() ?? "";
      family.carerLastName =
        getEl<HTMLInputElement>("carerLastName")?.value.trim() ?? "";
      family.carerEmail =
        getEl<HTMLInputElement>("carerEmail")?.value.trim() ?? "";
      family.carerPhone =
        getEl<HTMLInputElement>("carerPhone")?.value.trim() ?? "";
      const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(family.carerEmail);
      markErr("carerFirstName", !family.carerFirstName);
      markErr("carerLastName", !family.carerLastName);
      markErr("carerEmail", !emailOk);
      markErr("carerPhone", !family.carerPhone);
      return (
        Boolean(
          family.carerFirstName && family.carerLastName && family.carerPhone
        ) && emailOk
      ) || warn();
    }
    if (step === 7) {
      const emName = getEl<HTMLInputElement>("emName")?.value.trim() ?? "";
      const split = splitFullName(emName);
      family.emergencyContactFirstName = split.firstName;
      family.emergencyContactLastName = split.lastName;
      family.emergencyContactPhone =
        getEl<HTMLInputElement>("emPhone")?.value.trim() ?? "";
      family.emergencyContactRelation =
        getEl<HTMLInputElement>("emRelation")?.value.trim() ?? "";
      const referralSource =
        getEl<HTMLSelectElement>("referralSource")?.value ?? "";
      family.referralSource = isReferralSourceCode(referralSource)
        ? referralSource
        : "";
      family.referralSourceDetail =
        getEl<HTMLInputElement>("referralSourceDetail")?.value.trim() ?? "";
      family.termsAccepted = Boolean(
        getEl<HTMLInputElement>("termsAccepted")?.checked
      );

      markErr("emName", !emName);
      markErr("emPhone", !family.emergencyContactPhone);
      markErr("emRelation", !family.emergencyContactRelation);
      markErr("referralSource", !family.referralSource);
      getEl<HTMLElement>("termsCheck")?.classList.toggle(
        "err",
        !family.termsAccepted
      );
      const turnstileOk = Boolean(turnstileToken);
      markTurnstileErr(!turnstileOk);

      return (
        Boolean(
          emName &&
            family.emergencyContactPhone &&
            family.emergencyContactRelation
        ) &&
        Boolean(family.referralSource) &&
        family.termsAccepted &&
        turnstileOk
      ) || warn();
    }
    return true;
  };

  const render = () => {
    steps.forEach((stepEl) => {
      stepEl.classList.toggle("active", Number(stepEl.dataset.step) === step);
    });
    stepItems.forEach((item, index) => {
      item.classList.toggle("active", index + 1 === step);
      item.classList.toggle("done", index + 1 < step);
    });
    barFill.style.width = `${(step / TOTAL_REG_STEPS) * 100}%`;
    backBtn.disabled =
      step === 1 && students.length === 0 && editingIndex === null;
    nextBtn.innerHTML =
      step === TOTAL_REG_STEPS
        ? 'Complete registration <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6L9 17l-5-5"/></svg>'
        : 'Continue <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
    if (step <= 2) syncChoiceUi();
    if (step === 3) buildSlots();
    if (step === 4) syncStudentInputs();
    if (step === 5) buildChildList();
    if (step === 7) {
      buildChildExtras();
      buildSummary();
      if (getEl<HTMLInputElement>("sameAsParent")?.checked) applySameAsParent();
      renderTurnstile();
    }
    updateChildChip();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async () => {
    if (isSubmitting) return;
    isSubmitting = true;
    nextBtn.disabled = true;
    nextBtn.textContent = "Submitting...";

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          family: trimStringsDeep(family),
          students: students.map((student) => trimStringsDeep(student)),
          turnstileToken,
        }),
      });
      if (!response.ok) {
        throw new Error("Registration API request failed.");
      }
      getEl<HTMLElement>("regProgress")?.style.setProperty("display", "none");
      document
        .querySelector<HTMLElement>(".reg-trial")
        ?.style.setProperty("display", "none");
      steps.forEach((stepEl) => stepEl.classList.remove("active"));
      getEl<HTMLElement>("regNav")?.style.setProperty("display", "none");
      getEl<HTMLElement>("childChip")?.setAttribute("hidden", "");
      const title = getEl<HTMLElement>("regTitle");
      if (title) title.textContent = "Registration complete";
      getEl<HTMLElement>("regIntro")?.style.setProperty("display", "none");
      const doneMessage = getEl<HTMLElement>("doneMsg");
      if (doneMessage) {
        const firstNames = students
          .map((student) => student.studentFirstName)
          .filter(Boolean);
        const nameList =
          firstNames.length > 1
            ? `${firstNames.slice(0, -1).join(", ")} and ${
                firstNames[firstNames.length - 1]
              }'s classes`
            : `${firstNames[0] || "your child"}'s class`;
        doneMessage.textContent = `Thanks, ${
          family.carerFirstName || "there"
        }! We'll confirm ${nameList} and free trial lesson${
          firstNames.length > 1 ? "s" : ""
        } within one business day.`;
      }
      getEl<HTMLElement>("regDone")?.classList.add("show");
    } catch (error) {
      console.error("Error submitting enrolment:", error);
      window.alert("Failed to submit enrolment.");
      resetTurnstile();
      isSubmitting = false;
      nextBtn.disabled = false;
      render();
    }
  };

  document.querySelectorAll<HTMLButtonElement>("#yearGrid .choice").forEach((button) => {
    addListener(button, "click", () => {
      document
        .querySelectorAll<HTMLButtonElement>("#yearGrid .choice")
        .forEach((item) => item.classList.remove("selected"));
      button.classList.add("selected");
      draft.studentYear = button.dataset.val ?? "";
      draft.classes = [];
    });
  });

  document
    .querySelectorAll<HTMLButtonElement>("#subjectGrid .choice")
    .forEach((button) => {
      addListener(button, "click", () => {
        const subject = fromDisplaySubject(button.dataset.val ?? "");
        const index = draft.studentSubjects.indexOf(subject);
        if (index >= 0) {
          draft.studentSubjects.splice(index, 1);
          button.classList.remove("selected");
        } else {
          draft.studentSubjects.push(subject);
          button.classList.add("selected");
        }
        draft.classes = [];
      });
    });

  addListener(nextBtn, "click", () => {
    if (!validate()) return;
    if (step === 4) {
      commitDraft();
      step = 5;
      render();
      return;
    }
    if (step < TOTAL_REG_STEPS) {
      step += 1;
      render();
      return;
    }
    void submit();
  });
  addListener(backBtn, "click", () => {
    if (step === 1) {
      // Cancel adding/editing this child and return to the children list.
      if (students.length > 0 || editingIndex !== null) {
        editingIndex = null;
        draft = emptyStudent();
        step = 5;
        render();
      }
      return;
    }
    if (step === 5) {
      // Step back into the most recently added child's details.
      editingIndex = students.length - 1;
      draft = cloneStudent(students[editingIndex]);
      step = 4;
      render();
      return;
    }
    step -= 1;
    render();
  });
  addListener(getEl<HTMLButtonElement>("addChildBtn"), "click", () => {
    if (students.length >= MAX_CHILDREN) return;
    startChild(null);
  });

  document
    .querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      ".reg-field input, .reg-field textarea"
    )
    .forEach((input) => {
      addListener(input, "input", () => {
        input.closest(".reg-field")?.classList.remove("err");
      });
    });

  addListener(getEl<HTMLInputElement>("termsAccepted"), "change", () => {
    getEl<HTMLElement>("termsCheck")?.classList.remove("err");
  });
  addListener(getEl<HTMLInputElement>("sameAsParent"), "change", applySameAsParent);
  addListener(
    getEl<HTMLSelectElement>("referralSource"),
    "change",
    updateReferralSource
  );
  addListener(getEl<HTMLInputElement>("referralSourceDetail"), "input", () => {
    family.referralSourceDetail =
      getEl<HTMLInputElement>("referralSourceDetail")?.value.trim() ?? "";
    buildSummary();
  });

  const prefill = () => {
    let parsed: { year?: string; subject?: string } | null = null;
    const query = new URLSearchParams(window.location.search);
    const queryYear = query.get("year");
    const querySubject = query.get("subject");
    if (queryYear || querySubject) {
      parsed = {
        year: queryYear
          ? queryYear.startsWith("Year ")
            ? queryYear
            : `Year ${queryYear}`
          : undefined,
        subject: querySubject ?? undefined,
      };
    } else {
      const raw = window.localStorage.getItem("tenacity_prefill");
      if (raw) {
        window.localStorage.removeItem("tenacity_prefill");
        try {
          parsed = JSON.parse(raw) as { year?: string; subject?: string };
        } catch {
          parsed = null;
        }
      }
    }

    if (!parsed) return;
    if (parsed.year) {
      const yearButton = document.querySelector<HTMLButtonElement>(
        `#yearGrid .choice[data-val="${parsed.year}"]`
      );
      if (yearButton) {
        yearButton.classList.add("selected");
        draft.studentYear = parsed.year;
      }
    }
    if (parsed.subject) {
      const subjects =
        parsed.subject === "Maths & English"
          ? ["Mathematics", "English"]
          : [parsed.subject];
      subjects.forEach((subject) => {
        const subjectButton = document.querySelector<HTMLButtonElement>(
          `#subjectGrid .choice[data-val="${subject}"]`
        );
        if (!subjectButton) return;
        subjectButton.classList.add("selected");
        const storedSubject = fromDisplaySubject(subject);
        if (!draft.studentSubjects.includes(storedSubject)) {
          draft.studentSubjects.push(storedSubject);
        }
      });
    }
  };

  setupReferralSource();
  prefill();
  render();

  void getDocs(collection(db, "classes"))
    .then((querySnapshot) => {
      classSlots = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      if (step === 3) buildSlots();
    })
    .catch((error) => {
      console.error("Error loading class slots:", error);
      slotList.innerHTML =
        '<p class="slot-hint">Class times could not be loaded. Please contact us and we will help you register.</p>';
    });

  return () => {
    cleanups.forEach((cleanup) => cleanup());
    if (turnstileRetry) window.clearTimeout(turnstileRetry);
  };
};

const DesignRuntime = ({ page }: DesignRuntimeProps) => {
  useEffect(() => {
    return setupDesignInteractions(page);
  }, [page]);

  return null;
};

export default DesignRuntime;
