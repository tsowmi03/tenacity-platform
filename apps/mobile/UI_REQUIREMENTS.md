# Tenacity App — UI Requirements for Redesign (v3)

Requirements for the `redesign-v3` visual/UX overhaul, organized page by page
and role by role. This documents the **current, as-built UI functionality**
in `lib/src/ui/` so it can be re-implemented with the new design system
(`lib/src/ui/theme/design_tokens.dart`) without losing any existing behavior.
Roles: **Parent**, **Tutor**, **Admin** — the only three roles the app
currently models (`lib/src/models/app_user_model.dart`).

---

## 1. Global / cross-cutting requirements

- **Navigation shell**: bottom nav bar (`home_screen.dart`), tabs vary by role:
  - Parent (5 tabs): Dashboard, Classes, Announcements, Messages, Invoices
  - Tutor (5 tabs): Dashboard, Classes, Announcements, Users, Messages
  - Admin (6 tabs): Dashboard, Classes, Announcements, Users, Messages, Invoices
- **Badge indicators**: red-dot badges on the relevant tab for unread
  messages, unpaid invoices, and unread announcements. Preserve this pattern,
  restyled with the new design tokens.
- **Design tokens**: `design_tokens.dart` defines `AppColors`, `AppRadii`,
  `AppShadows`, `AppText` (Bricolage Grotesque for display, Plus Jakarta Sans
  for body). Nothing currently consumes it — every existing screen hardcodes
  `Color(0xFF1C71AF)` gradients inline. Every page below is a full re-skin
  against the token file, not an incremental tweak.
- **Profile/settings entry point**: an icon on the dashboard app bar, not a
  bottom-nav tab.
- **Offline state**: `login_screen.dart` has an explicit offline guard;
  carry a consistent offline/empty-state treatment across all list-based
  screens (timetable, announcements, inbox, invoices, users list).

---

## 2. Page-by-page requirements

### 2.1 Login (`login_screen.dart`)
- **All roles (signed out)**: email + password fields, sign-in button,
  "Forgot Password?" link (wired to `AuthService.sendPasswordResetEmail`),
  offline state. No self-serve signup — registration happens on the
  marketing website, so there is no "Create account" affordance here.

### 2.2 Terms & Conditions (`terms_screen.dart`)
- **All roles**, shown once when `needsToAcceptTerms` is true: scrollable
  markdown T&Cs, "Accept" button disabled/hidden until the user has scrolled
  to the bottom.

### 2.3 Home Dashboard (`home_dashboard.dart`)
- **All roles**: Next Class card, Unread Messages card, Latest Announcement
  card.
- **Parent only**: Student Feedback card (expandable, per-child preview of
  latest progress note), Unpaid Invoice card (amount + pay shortcut).
- **Admin only**: "Create Invoice" shortcut card.
- **Tutor**: no tutor-specific cards beyond the shared "all roles" set.

### 2.4 Timetable / Classes (`timetable_screen.dart`)
Weekly grid of day columns × time slots, backed by `TimetableController`.

- **Parent**:
  - Browse the weekly class grid.
  - Enrol a child permanently in a class, or book a single one-off session.
  - Join/leave a waitlist when a class is full or not yet open.
  - Swap a child's enrolment between classes.
  - View which of their own children are booked into which slot.
- **Tutor**:
  - Same grid, read-oriented for classes they're not assigned to.
  - View their own assigned classes/rosters.
  - Mark attendance for their sessions (embedded in a dialog off the class
    card).
- **Admin**:
  - All Tutor capabilities, plus: create/edit classes, assign/edit tutors
    per class (supports "this week only" vs "permanent" tutor assignment),
    cancel a specific session, edit enrolled students directly, manage/
    promote waitlist entries.

### 2.5 Announcements
- **List** (`announcements_screen.dart`): all roles read a feed filtered to
  `audience ∈ {all, <own role>}`. **Admin only**: FAB to add a new
  announcement, swipe-to-delete.
- **Add** (`announcement_add_screen.dart`, **admin only**): title, body,
  archived toggle, audience picker (all/admin/tutor/parent).
- **Detail** (`announcement_details_screen.dart`): full text, clickable
  links (Linkify), marks read on open — read state drives the dashboard's
  unread badge.

### 2.6 Messaging
- **Inbox** (`inbox_screen.dart`): all roles — list of 1:1 threads, search by
  name, swipe-to-delete, unread badges.
- **New chat** (`new_chat_screen.dart`): all roles — contact picker to start
  a new 1:1 thread. Parents cannot message other parents — filtered out of
  the picker.
- **Thread** (`chat_screen.dart`): all roles — text messages, image/file
  attachment (camera, photo library, file picker), typing indicator, read
  receipts.

### 2.7 Users / people management (Admin & Tutor only — not in Parent nav)
- **List** (`users_list_screen.dart`): searchable list across all roles.
- **Detail** (`user_details_screen.dart`):
  - For a Parent user: lesson-token balance (admin-editable), expandable
    list of their students (grade, subjects, "View Feedback" button per
    student), most recent invoice with PDF link.
  - **Admin only**: edit lesson tokens, unenrol a student, destructive
    "Remove Tutor"/"Remove Parent" actions (cascade to remove students).

### 2.8 Student feedback / progress notes (`feedback_screen.dart`)
- **Parent**: read-only list of feedback notes for their child(ren).
- **Admin**: FAB to add a new note (subject + free-text feedback tied to a
  student).
- **Tutor**: read-only, same as Parent — no add affordance in the current UI.

### 2.9 Invoices & billing
- **Parent** (`invoices_screen.dart`): list own invoices, pay one or "pay
  all outstanding" via Stripe payment sheet, view invoice PDF.
- **Admin console** (`admin_invoice_view.dart`): filter (all/unpaid/paid/
  overdue), sort (due date/amount/created/parent name), search, multi-select,
  bulk actions.
- **Admin create** (`admin_create_invoice_screen.dart` →
  `admin_review_invoice_screen.dart`): pick parent → pick student(s) → set
  session count/weeks/due date → review/edit line items → finalize.

### 2.10 Payroll / payslips
- `payslips_screen.dart` (tutor-facing list, PDF links) and
  `admin_create_payslip_screen.dart` (admin creates a payslip: tutor picker,
  gross pay/deductions/hours/period) exist and function, but neither is
  reachable from any live navigation — the Tutor "Payslips" tab is
  commented out in `home_screen.dart`. Not part of the current live UI.

### 2.11 Profile & settings
- **Profile** (`profile_screen.dart`): all roles — name/email/phone. Parent
  additionally sees lesson-token balance, expandable list of children with
  class enrolment, "Enrol Another Student" (external link to the
  registration website), and Sign Out.
- **Edit profile** (`edit_profile_screen.dart`): all roles — edit name,
  email, phone.
- **Change password** (`change_password_screen.dart`): all roles — current/
  new/confirm password form.
- **Settings** (`settings_screen.dart`): notification-preference toggles,
  shown only for the Parent role.

### 2.12 Out of scope for redesign
- `debug_log_screen.dart` — dev-only utility screen, not linked from main
  nav, no end-user-facing requirement.

---

## 3. Data models referenced above

See `lib/src/models/`: `AppUser`/`Admin`/`Tutor`/`Parent`, `Student`,
`ClassModel`, `Attendance`, `Term`, `WaitlistEntry`, `Invoice`/`Payment`/
`InvoiceDraft`, `Payslip`, `StudentFeedback`, `Announcement`, `Chat`/
`Message`, `TermsAndConditions`.
