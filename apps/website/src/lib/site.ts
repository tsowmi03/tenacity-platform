/**
 * The public facts about Tenacity that search engines and AI assistants read
 * (WEB-5): the site address, the business details, the fees and the list of
 * pages that may be indexed.
 *
 * Structured data is built from this file. `public/robots.txt`,
 * `public/sitemap.xml` and `public/llms.txt` are static, and
 * `test/seo.test.mjs` fails when they disagree with it. See docs/seo.md.
 */

export const SITE_URL = "https://www.tenacitytutoring.com";

/** A full address for a site path, e.g. "/about" or "/cropped-meta.jpg". */
export const absoluteUrl = (path: string) =>
  path === "/" || path === "" ? `${SITE_URL}/` : `${SITE_URL}${path}`;

export const BUSINESS = {
  name: "Tenacity Tutoring",
  slogan: "Determination Meets Success",
  description:
    "Small-group Maths and English tutoring in Narwee, Sydney, for students from Year 5 to the HSC. Classes are capped at four students with a 2:1 student-to-tutor ratio.",
  phone: "+61401455112",
  phoneDisplay: "0401 455 112",
  email: "enquiries@tenacitytutoring.com",
  address: {
    street: "16 Broadarrow Road",
    suburb: "Narwee",
    state: "NSW",
    postcode: "2209",
    country: "AU",
  },
  /**
   * Class hours. Schema.org day names and 24-hour times. Closing moves to
   * 21:00 when Year 11 classes start; change public/llms.txt with it.
   */
  openingHours: {
    days: ["Monday", "Tuesday", "Wednesday", "Thursday"],
    opens: "16:00",
    closes: "20:00",
  },
  /** Narwee and the suburbs next to it. */
  areaServed: ["Narwee", "Beverly Hills", "Riverwood", "Peakhurst", "Kingsgrove"],
  founders: ["Thomas Sowmi", "Josh Sowmi"],
  googleListingUrl: "https://share.google/wNC97I7Dd8AQpBY2u",
  instagramUrl: "https://www.instagram.com/tenacity.tutoring/",
  facebookUrl: "https://www.facebook.com/tenacity.tutoring",
  logoPath: "/logo.png",
  imagePath: "/cropped-meta.jpg",
} as const;

export type Fee = {
  name: string;
  years: string;
  /** Dollars for one session. */
  price: number;
  /** Session length in hours. */
  hours: number;
  note?: string;
};

/**
 * Fees as published on /programs and in the home page FAQ. Change them there
 * and in public/llms.txt at the same time; the test checks all three agree.
 */
export const FEES: Fee[] = [
  {
    name: "Primary Maths and English tutoring",
    years: "Years 5-6",
    price: 60,
    hours: 1,
  },
  {
    name: "High school Maths and English tutoring",
    years: "Years 7-10",
    price: 70,
    hours: 1,
  },
  {
    name: "Year 11 Maths and English, Standard or Advanced",
    years: "Year 11",
    price: 130,
    hours: 2,
    note: "Classes start in 2027.",
  },
  {
    name: "Year 11 Maths and English, Extension 1",
    years: "Year 11",
    price: 100,
    hours: 1.5,
    note: "Classes start in 2027.",
  },
];

/**
 * Every page a search engine may list. A page left out of this list must be
 * marked noindex or be a redirect. public/sitemap.xml lists exactly these.
 */
export const INDEXABLE_PATHS = [
  "/",
  "/programs",
  "/about",
  "/contact",
  "/register",
  "/year-11-interest",
  "/terms",
  "/privacy",
] as const;
