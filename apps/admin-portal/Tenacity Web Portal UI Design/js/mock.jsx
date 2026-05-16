/* =========================================================
   Tenacity Portal — Mock data (modest fidelity)
   ========================================================= */

const today = new Date(2026, 4, 14); // May 14 2026
const daysAgo = (n) => new Date(today.getTime() - n * 86400000);
const daysAhead = (n) => new Date(today.getTime() + n * 86400000);

const TERMS = [
  { id: "2026-T1", year: "2026", termNum: 1, startDate: new Date(2026, 0, 27), endDate: new Date(2026, 2, 27), weeksNum: 9, status: "inactive", invoicesGeneratedAt: new Date(2026, 0, 20) },
  { id: "2026-T2", year: "2026", termNum: 2, startDate: new Date(2026, 3, 21), endDate: new Date(2026, 5, 26), weeksNum: 10, status: "active", invoicesGeneratedAt: new Date(2026, 3, 15) },
  { id: "2026-T3", year: "2026", termNum: 3, startDate: new Date(2026, 6, 14), endDate: new Date(2026, 8, 18), weeksNum: 10, status: "inactive", invoicesGeneratedAt: null },
  { id: "2026-T4", year: "2026", termNum: 4, startDate: new Date(2026, 9, 6), endDate: new Date(2026, 11, 11), weeksNum: 10, status: "inactive", invoicesGeneratedAt: null },
];

const USERS = [
  // Admins
  { uid: "u_admin_01", role: "admin", firstName: "Thomas", lastName: "Sowmi", email: "thomas@tenacitytutoring.com.au", phone: "+61 412 003 921", createdAt: new Date(2024, 3, 1), updatedAt: daysAgo(2) },
  { uid: "u_admin_02", role: "admin", firstName: "Priya", lastName: "Nair", email: "priya@tenacitytutoring.com.au", phone: "+61 421 884 002", createdAt: new Date(2024, 7, 12), updatedAt: daysAgo(7) },

  // Tutors
  { uid: "u_tut_01", role: "tutor", firstName: "Maya", lastName: "Lawson", email: "maya.l@tenacitytutoring.com.au", phone: "+61 431 200 113", createdAt: new Date(2025, 1, 14), updatedAt: daysAgo(12) },
  { uid: "u_tut_02", role: "tutor", firstName: "Owen", lastName: "Reyes", email: "owen.r@tenacitytutoring.com.au", phone: "+61 432 901 776", createdAt: new Date(2025, 2, 1), updatedAt: daysAgo(34) },
  { uid: "u_tut_03", role: "tutor", firstName: "Hannah", lastName: "Chen", email: "hannah.c@tenacitytutoring.com.au", phone: "+61 422 778 401", createdAt: new Date(2025, 5, 18), updatedAt: daysAgo(20) },
  { uid: "u_tut_04", role: "tutor", firstName: "Daniel", lastName: "Okafor", email: "daniel.o@tenacitytutoring.com.au", phone: "+61 411 552 904", createdAt: new Date(2025, 8, 2), updatedAt: daysAgo(3) },
  { uid: "u_tut_05", role: "tutor", firstName: "Sienna", lastName: "Vargas", email: "sienna.v@tenacitytutoring.com.au", phone: "+61 408 612 037", createdAt: new Date(2025, 10, 5), updatedAt: daysAgo(45) },

  // Parents (with students)
  { uid: "u_par_01", role: "parent", firstName: "Aisha", lastName: "Bennett", email: "aisha.bennett@gmail.com", phone: "+61 412 887 002", students: ["s_01", "s_02"], lessonTokens: 4, stripeCustomerId: "cus_RhDqp22LkPx", createdAt: new Date(2025, 1, 8), updatedAt: daysAgo(1) },
  { uid: "u_par_02", role: "parent", firstName: "Marcus", lastName: "Thorne", email: "marcus@thorne.co", phone: "+61 433 092 118", students: ["s_03"], lessonTokens: 0, stripeCustomerId: "cus_NkPwAa92TLb", createdAt: new Date(2025, 2, 12), updatedAt: daysAgo(8) },
  { uid: "u_par_03", role: "parent", firstName: "Yuki", lastName: "Tanaka", email: "yuki.tanaka@outlook.com", phone: "+61 421 887 311", students: ["s_04", "s_05"], lessonTokens: 8, stripeCustomerId: "cus_AvLPo10MzCq", createdAt: new Date(2025, 4, 22), updatedAt: daysAgo(14) },
  { uid: "u_par_04", role: "parent", firstName: "Rohan", lastName: "Mehta", email: "r.mehta@protonmail.com", phone: "+61 408 220 994", students: ["s_06"], lessonTokens: 2, createdAt: new Date(2025, 7, 1), updatedAt: daysAgo(30) },
  { uid: "u_par_05", role: "parent", firstName: "Elena", lastName: "Rossi", email: "elena.rossi@gmail.com", phone: "+61 437 119 008", students: ["s_07"], lessonTokens: 1, stripeCustomerId: "cus_KhWeQp7THb2", createdAt: new Date(2025, 9, 14), updatedAt: daysAgo(2) },
  { uid: "u_par_06", role: "parent", firstName: "Tariq", lastName: "Hassan", email: "tariq.hassan@hotmail.com", phone: "+61 414 522 901", students: ["s_08", "s_09"], lessonTokens: 6, stripeCustomerId: "cus_BtPpOlz09bM", createdAt: new Date(2025, 10, 3), updatedAt: daysAgo(5) },
  { uid: "u_par_07", role: "parent", firstName: "Naomi", lastName: "Park", email: "naomi.park@gmail.com", phone: "+61 422 113 776", students: ["s_10"], lessonTokens: 3, createdAt: new Date(2026, 1, 18), updatedAt: daysAgo(11) },
  { uid: "u_par_08", role: "parent", firstName: "Caleb", lastName: "Whitlock", email: "caleb.whitlock@yahoo.com.au", phone: "+61 401 998 220", students: [], lessonTokens: 0, createdAt: daysAgo(4), updatedAt: daysAgo(4) },
];

const STUDENTS = [
  { id: "s_01", firstName: "Liam", lastName: "Bennett", grade: "Year 6", subjects: ["Maths", "English"], parents: ["u_par_01"], primaryParentId: "u_par_01", createdAt: new Date(2025, 1, 8) },
  { id: "s_02", firstName: "Eva", lastName: "Bennett", grade: "Year 4", subjects: ["English"], parents: ["u_par_01"], primaryParentId: "u_par_01", createdAt: new Date(2025, 1, 8) },
  { id: "s_03", firstName: "Sebastian", lastName: "Thorne", grade: "Year 8", subjects: ["Maths", "Science"], parents: ["u_par_02"], primaryParentId: "u_par_02", createdAt: new Date(2025, 2, 12) },
  { id: "s_04", firstName: "Hiro", lastName: "Tanaka", grade: "Year 10", subjects: ["Maths Methods", "Chemistry"], parents: ["u_par_03"], primaryParentId: "u_par_03", createdAt: new Date(2025, 4, 22) },
  { id: "s_05", firstName: "Mei", lastName: "Tanaka", grade: "Year 7", subjects: ["Maths", "English"], parents: ["u_par_03"], primaryParentId: "u_par_03", createdAt: new Date(2025, 4, 22) },
  { id: "s_06", firstName: "Arjun", lastName: "Mehta", grade: "Year 11", subjects: ["Physics", "Maths Specialist"], parents: ["u_par_04"], primaryParentId: "u_par_04", createdAt: new Date(2025, 7, 1) },
  { id: "s_07", firstName: "Sofia", lastName: "Rossi", grade: "Year 9", subjects: ["English", "Humanities"], parents: ["u_par_05"], primaryParentId: "u_par_05", createdAt: new Date(2025, 9, 14) },
  { id: "s_08", firstName: "Layla", lastName: "Hassan", grade: "Year 5", subjects: ["Maths"], parents: ["u_par_06"], primaryParentId: "u_par_06", createdAt: new Date(2025, 10, 3) },
  { id: "s_09", firstName: "Yusuf", lastName: "Hassan", grade: "Year 12", subjects: ["Maths Methods", "Chemistry", "Physics"], parents: ["u_par_06"], primaryParentId: "u_par_06", createdAt: new Date(2025, 10, 3) },
  { id: "s_10", firstName: "Jacob", lastName: "Park", grade: "Year 6", subjects: ["English"], parents: ["u_par_07"], primaryParentId: "u_par_07", createdAt: new Date(2026, 1, 18) },
  // Orphan student (no parent)
  { id: "s_11", firstName: "Ada", lastName: "Okonkwo", grade: "Year 3", subjects: ["Maths"], parents: [], createdAt: daysAgo(6) },
];

const CLASSES = [
  { id: "c_mon_yr5_6", type: "Primary — Yr 5/6", day: "Monday", startTime: "16:00", endTime: "17:30", capacity: 8, enrolledStudents: ["s_01", "s_08", "s_10"], tutors: ["u_tut_01"], createdAt: new Date(2025, 10, 1) },
  { id: "c_tue_yr7_8", type: "Junior High — Yr 7/8", day: "Tuesday", startTime: "16:30", endTime: "18:00", capacity: 8, enrolledStudents: ["s_03", "s_05"], tutors: ["u_tut_02", "u_tut_03"], createdAt: new Date(2025, 10, 1) },
  { id: "c_wed_yr9_10", type: "Senior — Yr 9/10", day: "Wednesday", startTime: "16:30", endTime: "18:30", capacity: 6, enrolledStudents: ["s_04", "s_07"], tutors: ["u_tut_02"], createdAt: new Date(2025, 10, 1) },
  { id: "c_thu_vce_meth", type: "VCE Maths Methods", day: "Thursday", startTime: "17:00", endTime: "19:00", capacity: 6, enrolledStudents: ["s_06", "s_09"], tutors: ["u_tut_04"], createdAt: new Date(2025, 11, 12) },
  { id: "c_thu_vce_chem", type: "VCE Chemistry", day: "Thursday", startTime: "19:00", endTime: "20:30", capacity: 6, enrolledStudents: ["s_09"], tutors: ["u_tut_04"], createdAt: new Date(2025, 11, 12) },
  { id: "c_sat_eng_jr", type: "Primary English", day: "Saturday", startTime: "10:00", endTime: "11:30", capacity: 8, enrolledStudents: ["s_02"], tutors: ["u_tut_01", "u_tut_05"], createdAt: new Date(2026, 0, 10) },
  { id: "c_sat_phys", type: "VCE Physics", day: "Saturday", startTime: "13:00", endTime: "15:00", capacity: 6, enrolledStudents: ["s_06"], tutors: [], createdAt: new Date(2026, 2, 1) }, // missing tutor
];

const ENROLMENTS = [
  {
    id: "e_001", status: "pending", archived: false,
    studentFirstName: "Noah", studentLastName: "Calder", studentYear: "Year 7", studentSubjects: ["Maths", "English"],
    classes: [{ id: "c_tue_yr7_8", day: "Tuesday", startTime: "16:30" }],
    carerFirstName: "Eliza", carerLastName: "Calder", carerEmail: "eliza.calder@gmail.com", carerPhone: "+61 414 002 991",
    emergencyContactFirstName: "Peter", emergencyContactLastName: "Calder", emergencyContactPhone: "+61 433 901 220", emergencyContactRelation: "Father",
    allergies: "Peanuts (severe)", permissionToLeave: false, additionalInfo: "Noah is preparing for selective school applications. Confident in English, finds algebra challenging.",
    createdAt: daysAgo(2),
  },
  {
    id: "e_002", status: "pending", archived: false,
    studentFirstName: "Isla", studentLastName: "Greaves", studentYear: "Year 5", studentSubjects: ["Maths"],
    classes: [{ id: "c_mon_yr5_6", day: "Monday", startTime: "16:00" }],
    carerFirstName: "Rebecca", carerLastName: "Greaves", carerEmail: "becca.greaves@outlook.com", carerPhone: "+61 421 778 003",
    emergencyContactFirstName: "James", emergencyContactLastName: "Greaves", emergencyContactPhone: "+61 401 220 998", emergencyContactRelation: "Father",
    allergies: "None", permissionToLeave: true, additionalInfo: "",
    createdAt: daysAgo(4),
  },
  {
    id: "e_003", status: "pending", archived: false,
    studentFirstName: "Theo", studentLastName: "Marchetti", studentYear: "Year 11", studentSubjects: ["Maths Methods", "Physics"],
    classes: [
      { id: "c_thu_vce_meth", day: "Thursday", startTime: "17:00" },
      { id: "c_sat_phys", day: "Saturday", startTime: "13:00" },
    ],
    carerFirstName: "Anna", carerLastName: "Marchetti", carerEmail: "anna.marchetti@gmail.com", carerPhone: "+61 432 884 117",
    emergencyContactFirstName: "Luca", emergencyContactLastName: "Marchetti", emergencyContactPhone: "+61 421 003 998", emergencyContactRelation: "Father",
    allergies: "Tree nuts (mild)", permissionToLeave: true, additionalInfo: "Aiming for ENG/SCI at Melb Uni.",
    createdAt: daysAgo(1),
  },
  {
    id: "e_004", status: "accepted", archived: false,
    studentFirstName: "Jacob", studentLastName: "Park", studentYear: "Year 6", studentSubjects: ["English"],
    classes: [{ id: "c_sat_eng_jr", day: "Saturday", startTime: "10:00" }],
    carerFirstName: "Naomi", carerLastName: "Park", carerEmail: "naomi.park@gmail.com", carerPhone: "+61 422 113 776",
    emergencyContactFirstName: "David", emergencyContactLastName: "Park", emergencyContactPhone: "+61 411 220 778", emergencyContactRelation: "Father",
    allergies: "", permissionToLeave: true, additionalInfo: "",
    createdAt: new Date(2026, 1, 16), acceptedAt: new Date(2026, 1, 18), acceptedBy: "u_admin_01",
    createdParentId: "u_par_07", createdStudentId: "s_10",
  },
  {
    id: "e_005", status: "archived", archived: true,
    studentFirstName: "Charlie", studentLastName: "Vincent", studentYear: "Year 9", studentSubjects: ["English"],
    classes: [],
    carerFirstName: "Sarah", carerLastName: "Vincent", carerEmail: "sarah.vincent@gmail.com", carerPhone: "+61 433 220 887",
    emergencyContactFirstName: "Mark", emergencyContactLastName: "Vincent", emergencyContactPhone: "+61 421 992 011", emergencyContactRelation: "Father",
    allergies: "", permissionToLeave: false, additionalInfo: "Withdrew before class allocation.",
    createdAt: daysAgo(40), archivedAt: daysAgo(28), archivedBy: "u_admin_02",
  },
  {
    id: "e_006", status: "deleted", archived: false,
    studentFirstName: "Test", studentLastName: "Submission", studentYear: "Year 8", studentSubjects: [],
    classes: [],
    carerFirstName: "Test", carerLastName: "Test", carerEmail: "test@test.com", carerPhone: "+61 400 000 000",
    emergencyContactFirstName: "—", emergencyContactLastName: "—", emergencyContactPhone: "—", emergencyContactRelation: "—",
    allergies: "", permissionToLeave: false, additionalInfo: "",
    createdAt: daysAgo(50), deletedAt: daysAgo(48), deletedBy: "u_admin_01", deleteReason: "Duplicate test submission.",
  },
];

const INVOICES = [
  {
    id: "inv_2026T2_001", invoiceNumber: "INV-2026-0142",
    parentId: "u_par_01", parentName: "Aisha Bennett", parentEmail: "aisha.bennett@gmail.com",
    studentIds: ["s_01", "s_02"], weeks: 10,
    lineItems: [
      { studentName: "Liam Bennett", description: "Primary Yr 5/6 Maths/English — 10 weeks", quantity: 10, unitAmount: 65, lineTotal: 650 },
      { studentName: "Eva Bennett", description: "Primary English — 10 weeks", quantity: 10, unitAmount: 55, lineTotal: 550 },
    ],
    amountDue: 1200, amountDueComputed: 1200,
    status: "paid", dueDate: new Date(2026, 3, 28), createdAt: new Date(2026, 3, 15), paidAt: new Date(2026, 3, 22),
    xeroInvoiceId: "xero_inv_b88a72", xeroInvoicePdfPath: "invoices/2026T2/inv_001.pdf",
    stripePaymentIntentId: "pi_3RhDqp22LkPx_001",
  },
  {
    id: "inv_2026T2_002", invoiceNumber: "INV-2026-0143",
    parentId: "u_par_02", parentName: "Marcus Thorne", parentEmail: "marcus@thorne.co",
    studentIds: ["s_03"], weeks: 10,
    lineItems: [
      { studentName: "Sebastian Thorne", description: "Junior High Yr 7/8 — 10 weeks", quantity: 10, unitAmount: 65, lineTotal: 650 },
    ],
    amountDue: 650, amountDueComputed: 650,
    status: "overdue", dueDate: new Date(2026, 3, 28), createdAt: new Date(2026, 3, 15),
    xeroInvoiceId: "xero_inv_c91204", xeroInvoicePdfPath: "invoices/2026T2/inv_002.pdf",
  },
  {
    id: "inv_2026T2_003", invoiceNumber: "INV-2026-0144",
    parentId: "u_par_03", parentName: "Yuki Tanaka", parentEmail: "yuki.tanaka@outlook.com",
    studentIds: ["s_04", "s_05"], weeks: 10,
    lineItems: [
      { studentName: "Hiro Tanaka", description: "Senior Yr 9/10 — 10 weeks", quantity: 10, unitAmount: 75, lineTotal: 750 },
      { studentName: "Mei Tanaka", description: "Junior High Yr 7/8 — 10 weeks", quantity: 10, unitAmount: 65, lineTotal: 650 },
      { description: "Admin adjustment — loyalty credit", quantity: 1, unitAmount: -50, lineTotal: -50, isAdminAdjustment: true },
    ],
    amountDue: 1350, amountDueComputed: 1400, amountDueOverride: 1350,
    status: "paid", dueDate: new Date(2026, 3, 28), createdAt: new Date(2026, 3, 15), paidAt: new Date(2026, 4, 1),
    xeroInvoiceId: "xero_inv_d44128", xeroInvoicePdfPath: "invoices/2026T2/inv_003.pdf",
    stripePaymentIntentId: "pi_3AvLPo10MzCq_009",
    adminNotes: "Applied $50 loyalty credit for 4-term streak.",
  },
  {
    id: "inv_2026T2_004", invoiceNumber: "INV-2026-0145",
    parentId: "u_par_04", parentName: "Rohan Mehta", parentEmail: "r.mehta@protonmail.com",
    studentIds: ["s_06"], weeks: 10,
    lineItems: [
      { studentName: "Arjun Mehta", description: "VCE Maths Specialist — 10 weeks", quantity: 10, unitAmount: 95, lineTotal: 950 },
      { studentName: "Arjun Mehta", description: "VCE Physics — 10 weeks", quantity: 10, unitAmount: 95, lineTotal: 950 },
    ],
    amountDue: 1900, amountDueComputed: 1900,
    status: "unpaid", dueDate: new Date(2026, 3, 28), createdAt: new Date(2026, 3, 15),
    xeroInvoiceId: "xero_inv_e02871",
    stripePaymentIntentId: "pi_3pendingRohan_001",
  },
  {
    id: "inv_2026T2_005", invoiceNumber: "INV-2026-0146",
    parentId: "u_par_05", parentName: "Elena Rossi", parentEmail: "elena.rossi@gmail.com",
    studentIds: ["s_07"], weeks: 10,
    lineItems: [
      { studentName: "Sofia Rossi", description: "Senior Yr 9/10 — 10 weeks", quantity: 10, unitAmount: 75, lineTotal: 750 },
    ],
    amountDue: 750, amountDueComputed: 750,
    status: "unpaid", dueDate: new Date(2026, 4, 28), createdAt: new Date(2026, 4, 1),
    xeroInvoiceId: "xero_inv_f33099",
  },
  {
    id: "inv_2026T2_006", invoiceNumber: "INV-2026-0147",
    parentId: "u_par_06", parentName: "Tariq Hassan", parentEmail: "tariq.hassan@hotmail.com",
    studentIds: ["s_08", "s_09"], weeks: 10,
    lineItems: [
      { studentName: "Layla Hassan", description: "Primary Yr 5/6 — 10 weeks", quantity: 10, unitAmount: 65, lineTotal: 650 },
      { studentName: "Yusuf Hassan", description: "VCE Maths Methods — 10 weeks", quantity: 10, unitAmount: 95, lineTotal: 950 },
      { studentName: "Yusuf Hassan", description: "VCE Chemistry — 10 weeks", quantity: 10, unitAmount: 95, lineTotal: 950 },
    ],
    amountDue: 2550, amountDueComputed: 2550,
    status: "paid", dueDate: new Date(2026, 3, 28), createdAt: new Date(2026, 3, 15), paidAt: new Date(2026, 3, 19),
    xeroInvoiceId: "xero_inv_g91102", xeroInvoicePdfPath: "invoices/2026T2/inv_006.pdf",
    stripePaymentIntentId: "pi_3BtPpOlz09bM_011",
  },
];

const INVOICE_DRAFTS = [
  {
    id: "draft_001",
    parentId: "u_par_07", parentName: "Naomi Park", parentEmail: "naomi.park@gmail.com",
    studentIds: ["s_10"], weeks: 8,
    lineItems: [
      { studentName: "Jacob Park", description: "Primary English — 8 weeks (pro-rata)", quantity: 8, unitAmount: 55, lineTotal: 440 },
    ],
    amountDue: 440, amountDueComputed: 440,
    dueDate: new Date(2026, 4, 28), createdAt: daysAgo(2),
    adminNotes: "Mid-term start — pro-rata.",
  },
];

const WAITLIST = [
  { id: "wl_01", classId: "c_thu_vce_chem", parentId: "u_par_06", studentId: "s_09", status: "offered", reason: "Wants extra chemistry support before mocks.", createdAt: daysAgo(8), offeredAt: daysAgo(1) },
  { id: "wl_02", classId: "c_wed_yr9_10", parentId: "u_par_05", studentId: "s_07", status: "active", reason: "Class currently full.", createdAt: daysAgo(5) },
  { id: "wl_03", classId: "c_mon_yr5_6", parentId: "u_par_07", studentId: "s_10", status: "accepted", reason: "Moving up from a different time slot.", createdAt: daysAgo(20), acceptedAt: daysAgo(14) },
  { id: "wl_04", classId: "c_tue_yr7_8", parentId: "u_par_03", studentId: "s_05", status: "declined", reason: "Time slot no longer suits family.", createdAt: daysAgo(28), declinedAt: daysAgo(22) },
  { id: "wl_05", classId: "c_sat_phys", parentId: "u_par_04", studentId: "s_06", status: "active", reason: "Interested when tutor confirmed.", createdAt: daysAgo(3) },
  { id: "wl_06", classId: "c_thu_vce_meth", parentId: "u_par_06", studentId: "s_09", status: "expired", reason: "Did not respond within 48 hours.", createdAt: daysAgo(40), offeredAt: daysAgo(38), expiredAt: daysAgo(36) },
];

const ATTENDANCE = [
  // For c_mon_yr5_6, last few weeks of T2
  { id: "2026-T2_W1", classId: "c_mon_yr5_6", date: new Date(2026, 3, 21), termId: "2026-T2", weekNum: 1, cancelled: false, attendance: ["s_01", "s_08", "s_10"], tutors: ["u_tut_01"], updatedAt: new Date(2026, 3, 21) },
  { id: "2026-T2_W2", classId: "c_mon_yr5_6", date: new Date(2026, 3, 28), termId: "2026-T2", weekNum: 2, cancelled: false, attendance: ["s_01", "s_10"], tutors: ["u_tut_01"], updatedAt: new Date(2026, 3, 28) },
  { id: "2026-T2_W3", classId: "c_mon_yr5_6", date: new Date(2026, 4, 5), termId: "2026-T2", weekNum: 3, cancelled: false, attendance: ["s_01", "s_08", "s_10"], tutors: ["u_tut_01"], updatedAt: new Date(2026, 4, 5) },
  { id: "2026-T2_W4", classId: "c_mon_yr5_6", date: new Date(2026, 4, 12), termId: "2026-T2", weekNum: 4, cancelled: true, attendance: [], tutors: ["u_tut_01"], updatedAt: new Date(2026, 4, 12) },
];

const ADMIN_AUDIT_LOG = [
  { id: "log_001", action: "adminAcceptEnrolment", actor: "u_admin_01", target: "e_004", at: new Date(2026, 1, 18), summary: "Accepted enrolment for Jacob Park" },
  { id: "log_002", action: "adminAdjustLessonTokens", actor: "u_admin_01", target: "u_par_03", at: daysAgo(14), summary: "Tokens 6 → 8 (+2)", reason: "Refund for cancelled class W12 T1" },
  { id: "log_003", action: "adminUpdateInvoice", actor: "u_admin_02", target: "inv_2026T2_004", at: daysAgo(6), summary: "Updated due date" },
  { id: "log_004", action: "adminDeleteEnrolment", actor: "u_admin_01", target: "e_006", at: daysAgo(48), summary: "Soft deleted (duplicate test)" },
  { id: "log_005", action: "adminCreateClass", actor: "u_admin_02", target: "c_sat_phys", at: new Date(2026, 2, 1), summary: "Created VCE Physics" },
  { id: "log_006", action: "adminArchiveEnrolment", actor: "u_admin_02", target: "e_005", at: daysAgo(28), summary: "Archived withdrew-before-allocation" },
];

const SYSTEM_STATUS = {
  firebaseProject: "tenacity-tutoring-b8eb2",
  region: "us-central1",
  runtime: "Node.js 20",
  runtimeWarning: "Node.js 20 decommissions on 2026-10-30 — migration required.",
  xeroConnected: true,
  xeroOrg: "Tenacity Tutoring Pty Ltd",
  xeroLastSync: daysAgo(0.05),
  sendGridStatus: "ok",
  stripeStatus: "ok",
  legacyFunctions: ["generateXeroAuthUrl (UNKNOWN Node 18)", "xeroOAuthCallback (UNKNOWN Node 18)"],
  indexStatus: "All required composite indexes present.",
  rulesStatus: "Firestore rules not source-controlled yet.",
};

/* Convenience lookups */
const byId = (arr, id, key = "id") => arr.find((x) => x[key] === id);
const findUser = (uid) => USERS.find((u) => u.uid === uid);
const findStudent = (id) => STUDENTS.find((s) => s.id === id);
const findClass = (id) => CLASSES.find((c) => c.id === id);

const studentName = (s) => s ? `${s.firstName} ${s.lastName}` : "—";
const userName = (u) => u ? `${u.firstName} ${u.lastName}` : "—";
const classLabel = (c) => c ? `${c.type} · ${c.day} ${c.startTime}` : "—";

Object.assign(window, {
  TODAY: today, daysAgo, daysAhead,
  TERMS, USERS, STUDENTS, CLASSES, ENROLMENTS, INVOICES, INVOICE_DRAFTS, WAITLIST, ATTENDANCE, ADMIN_AUDIT_LOG, SYSTEM_STATUS,
  byId, findUser, findStudent, findClass, studentName, userName, classLabel,
});
