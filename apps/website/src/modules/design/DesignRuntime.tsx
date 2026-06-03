import { db } from "@lib/firebaseConfig";
import { sendEmailForm } from "@lib/utils/apiHelper";
import { addDoc, collection, getDocs } from "firebase/firestore";
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

type RegistrationData = {
  studentYear: string;
  studentSubjects: string[];
  classes: DesignClass[];
  studentFirstName: string;
  studentLastName: string;
  studentSchool: string;
  carerFirstName: string;
  carerLastName: string;
  carerEmail: string;
  carerPhone: string;
  emergencyContactFirstName: string;
  emergencyContactLastName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
  allergies: string;
  additionalInfo: string;
  permissionToLeave: boolean;
  termsAccepted: boolean;
};

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

const isClassAvailable = (slot: DesignClass) => {
  const enrolled = Array.isArray(slot.enrolledStudents)
    ? slot.enrolledStudents.length
    : 0;
  const capacity =
    typeof slot.capacity === "number" && slot.capacity > 0
      ? slot.capacity
      : Number.POSITIVE_INFINITY;
  return enrolled < capacity;
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

  const data: RegistrationData = {
    studentYear: "",
    studentSubjects: [],
    classes: [],
    studentFirstName: "",
    studentLastName: "",
    studentSchool: "",
    carerFirstName: "",
    carerLastName: "",
    carerEmail: "",
    carerPhone: "",
    emergencyContactFirstName: "",
    emergencyContactLastName: "",
    emergencyContactPhone: "",
    emergencyContactRelation: "",
    allergies: "",
    additionalInfo: "",
    permissionToLeave: false,
    termsAccepted: false,
  };

  let step = 1;
  let classSlots: DesignClass[] = [];
  let isSubmitting = false;

  const markErr = (id: string, on: boolean) => {
    const input = getEl<HTMLElement>(id);
    const field = input?.closest(".reg-field") ?? input?.closest(".reg-check");
    field?.classList.toggle("err", on);
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

  const requiredClassCount = () => data.studentSubjects.length;

  const selectedClassIds = () => new Set(data.classes.map((slot) => slot.id));

  const isSelected = (slot: DesignClass) => selectedClassIds().has(slot.id);

  const matchingSlots = () =>
    classSlots
      .filter(isClassAvailable)
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
        data.studentYear
      )} · ${data.studentYear}</span></span><span class="slot-tag few">Ask us</span>`;
      slotList.appendChild(empty);
      return;
    }

    slots.forEach((slot) => {
      const button = document.createElement("button");
      const selected = isSelected(slot);
      const selectionFull = data.classes.length >= required;
      button.type = "button";
      button.className = `slot${selected ? " selected" : ""}`;
      button.disabled = selectionFull && !selected;
      button.dataset.id = slot.id;
      const enrolled = Array.isArray(slot.enrolledStudents)
        ? slot.enrolledStudents.length
        : 0;
      const capacity = typeof slot.capacity === "number" ? slot.capacity : 0;
      const remaining = capacity ? capacity - enrolled : 3;
      button.innerHTML =
        `<span class="slot-day">${slot.day ?? "Class"}</span>` +
        `<span class="slot-meta"><span class="slot-time">${formatClassTime(
          slot.startTime
        )} - ${formatClassTime(slot.endTime)}</span>` +
        `<br><span class="slot-sub">${stageOf(data.studentYear)} · ${
          data.studentYear
        }</span></span>` +
        `<span class="slot-tag ${remaining <= 2 ? "few" : ""}">${
          remaining <= 2 ? "A few spots" : "Open"
        }</span>` +
        '<span class="slot-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg></span>';
      button.addEventListener("click", () => {
        if (isSelected(slot)) {
          data.classes = data.classes.filter(
            (selected) => selected.id !== slot.id
          );
        } else if (data.classes.length < requiredClassCount()) {
          data.classes.push(slot);
        }
        buildSlots();
      });
      slotList.appendChild(button);
    });
  };

  const buildSummary = () => {
    const summary = getEl<HTMLElement>("summaryList");
    if (!summary) return;
    const rows = [
      ["Year", data.studentYear],
      ["Subjects", data.studentSubjects.map(toDisplaySubject).join(" & ")],
      [
        "Classes",
        data.classes
          .map((slot) => `${slot.day ?? ""} ${formatClassTime(slot.startTime)}`)
          .join(" · "),
      ],
    ];
    summary.innerHTML = rows
      .map(([label, value]) => `<dt>${label}</dt><dd>${value || "-"}</dd>`)
      .join("");
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
    if (step === 1) return Boolean(data.studentYear) || warn();
    if (step === 2) return data.studentSubjects.length > 0 || warn();
    if (step === 3) {
      const uniqueClassCount = selectedClassIds().size;
      return (
        data.classes.length === data.studentSubjects.length &&
        uniqueClassCount === data.studentSubjects.length
      ) || warn();
    }
    if (step === 4) {
      data.studentFirstName =
        getEl<HTMLInputElement>("studentFirstName")?.value.trim() ?? "";
      data.studentLastName =
        getEl<HTMLInputElement>("studentLastName")?.value.trim() ?? "";
      data.studentSchool =
        getEl<HTMLInputElement>("studentSchool")?.value.trim() ?? "";
      markErr("studentFirstName", !data.studentFirstName);
      markErr("studentLastName", !data.studentLastName);
      return Boolean(data.studentFirstName && data.studentLastName) || warn();
    }
    if (step === 5) {
      data.carerFirstName =
        getEl<HTMLInputElement>("carerFirstName")?.value.trim() ?? "";
      data.carerLastName =
        getEl<HTMLInputElement>("carerLastName")?.value.trim() ?? "";
      data.carerEmail = getEl<HTMLInputElement>("carerEmail")?.value.trim() ?? "";
      data.carerPhone = getEl<HTMLInputElement>("carerPhone")?.value.trim() ?? "";
      const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.carerEmail);
      markErr("carerFirstName", !data.carerFirstName);
      markErr("carerLastName", !data.carerLastName);
      markErr("carerEmail", !emailOk);
      markErr("carerPhone", !data.carerPhone);
      return (
        Boolean(data.carerFirstName && data.carerLastName && data.carerPhone) &&
        emailOk
      ) || warn();
    }
    if (step === 6) {
      const emName = getEl<HTMLInputElement>("emName")?.value.trim() ?? "";
      const split = splitFullName(emName);
      data.emergencyContactFirstName = split.firstName;
      data.emergencyContactLastName = split.lastName;
      data.emergencyContactPhone =
        getEl<HTMLInputElement>("emPhone")?.value.trim() ?? "";
      data.emergencyContactRelation =
        getEl<HTMLInputElement>("emRelation")?.value.trim() ?? "";
      data.allergies = getEl<HTMLInputElement>("allergies")?.value.trim() ?? "";
      data.additionalInfo =
        getEl<HTMLTextAreaElement>("additionalInfo")?.value.trim() ?? "";
      data.permissionToLeave = Boolean(
        getEl<HTMLInputElement>("permissionToLeave")?.checked
      );
      data.termsAccepted = Boolean(
        getEl<HTMLInputElement>("termsAccepted")?.checked
      );

      markErr("emName", !emName);
      markErr("emPhone", !data.emergencyContactPhone);
      markErr("emRelation", !data.emergencyContactRelation);
      getEl<HTMLElement>("termsCheck")?.classList.toggle(
        "err",
        !data.termsAccepted
      );

      return (
        Boolean(
          emName && data.emergencyContactPhone && data.emergencyContactRelation
        ) && data.termsAccepted
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
    barFill.style.width = `${(step / 6) * 100}%`;
    backBtn.disabled = step === 1;
    nextBtn.innerHTML =
      step === 6
        ? 'Complete registration <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6L9 17l-5-5"/></svg>'
        : 'Continue <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
    if (step === 3) buildSlots();
    if (step === 6) {
      buildSummary();
      if (getEl<HTMLInputElement>("sameAsParent")?.checked) applySameAsParent();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async () => {
    if (isSubmitting) return;
    isSubmitting = true;
    nextBtn.disabled = true;
    nextBtn.textContent = "Submitting...";

    try {
      await addDoc(collection(db, "enrolments"), {
        ...trimStringsDeep(data),
        archived: false,
      });
      getEl<HTMLElement>("regProgress")?.style.setProperty("display", "none");
      document
        .querySelector<HTMLElement>(".reg-trial")
        ?.style.setProperty("display", "none");
      steps.forEach((stepEl) => stepEl.classList.remove("active"));
      getEl<HTMLElement>("regNav")?.style.setProperty("display", "none");
      const title = getEl<HTMLElement>("regTitle");
      if (title) title.textContent = "Registration complete";
      getEl<HTMLElement>("regIntro")?.style.setProperty("display", "none");
      const doneMessage = getEl<HTMLElement>("doneMsg");
      if (doneMessage) {
        doneMessage.textContent = `Thanks, ${
          data.carerFirstName || "there"
        }! We'll confirm ${
          data.studentFirstName || "your child"
        }'s class and free trial lesson within one business day.`;
      }
      getEl<HTMLElement>("regDone")?.classList.add("show");
    } catch (error) {
      console.error("Error submitting enrolment:", error);
      window.alert("Failed to submit enrolment.");
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
      data.studentYear = button.dataset.val ?? "";
      data.classes = [];
    });
  });

  document
    .querySelectorAll<HTMLButtonElement>("#subjectGrid .choice")
    .forEach((button) => {
      addListener(button, "click", () => {
        const subject = fromDisplaySubject(button.dataset.val ?? "");
        const index = data.studentSubjects.indexOf(subject);
        if (index >= 0) {
          data.studentSubjects.splice(index, 1);
          button.classList.remove("selected");
        } else {
          data.studentSubjects.push(subject);
          button.classList.add("selected");
        }
        data.classes = [];
      });
    });

  addListener(nextBtn, "click", () => {
    if (!validate()) return;
    if (step < 6) {
      step += 1;
      render();
      return;
    }
    void submit();
  });
  addListener(backBtn, "click", () => {
    if (step > 1) {
      step -= 1;
      render();
    }
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
        data.studentYear = parsed.year;
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
        if (!data.studentSubjects.includes(storedSubject)) {
          data.studentSubjects.push(storedSubject);
        }
      });
    }
  };

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

  return () => cleanups.forEach((cleanup) => cleanup());
};

const DesignRuntime = ({ page }: DesignRuntimeProps) => {
  useEffect(() => {
    return setupDesignInteractions(page);
  }, [page]);

  return null;
};

export default DesignRuntime;
