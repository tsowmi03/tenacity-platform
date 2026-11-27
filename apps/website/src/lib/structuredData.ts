import { BUSINESS, FEES, SITE_URL, absoluteUrl } from "@lib/site";

/**
 * schema.org data for search engines and AI assistants (WEB-5). Everything is
 * built from src/lib/site.ts so it cannot drift from the published facts.
 *
 * No star ratings: Google does not show stars from a business's own review
 * markup.
 */

export type StructuredData = Record<string, unknown>;

export type Faq = { question: string; answer: string };

const ORGANISATION_ID = `${SITE_URL}/#organisation`;

/** The business itself. Sent on every indexable page. */
export const organisationSchema = (): StructuredData => ({
  "@context": "https://schema.org",
  "@type": ["EducationalOrganization", "LocalBusiness"],
  "@id": ORGANISATION_ID,
  name: BUSINESS.name,
  slogan: BUSINESS.slogan,
  description: BUSINESS.description,
  url: absoluteUrl("/"),
  logo: absoluteUrl(BUSINESS.logoPath),
  image: absoluteUrl(BUSINESS.imagePath),
  telephone: BUSINESS.phone,
  email: BUSINESS.email,
  address: {
    "@type": "PostalAddress",
    streetAddress: BUSINESS.address.street,
    addressLocality: BUSINESS.address.suburb,
    addressRegion: BUSINESS.address.state,
    postalCode: BUSINESS.address.postcode,
    addressCountry: BUSINESS.address.country,
  },
  areaServed: BUSINESS.areaServed.map((suburb) => ({
    "@type": "Place",
    name: `${suburb}, NSW`,
  })),
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: [...BUSINESS.openingHours.days],
      opens: BUSINESS.openingHours.opens,
      closes: BUSINESS.openingHours.closes,
    },
  ],
  priceRange: `$${Math.min(...FEES.map((fee) => fee.price / fee.hours))}-$${Math.max(
    ...FEES.map((fee) => fee.price / fee.hours)
  )} per hour`,
  founder: BUSINESS.founders.map((name) => ({ "@type": "Person", name })),
  hasMap: BUSINESS.googleListingUrl,
  sameAs: [
    BUSINESS.instagramUrl,
    BUSINESS.facebookUrl,
    BUSINESS.googleListingUrl,
  ],
});

/** The home page questions and answers, read from the page itself. */
export const faqSchema = (faqs: Faq[]): StructuredData => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: { "@type": "Answer", text: faq.answer },
  })),
});

const sessionLength = (hours: number) =>
  hours === 1 ? "1-hour" : `${hours}-hour`;

/** What Tenacity teaches and what it costs, one entry per fee. */
export const servicesSchema = (): StructuredData[] =>
  FEES.map((fee) => ({
    "@context": "https://schema.org",
    "@type": "Service",
    name: `${fee.name} (${fee.years})`,
    serviceType: "Tutoring",
    description: [
      `Small-group ${sessionLength(fee.hours)} sessions at the Narwee centre.`,
      fee.note,
    ]
      .filter(Boolean)
      .join(" "),
    provider: { "@id": ORGANISATION_ID },
    areaServed: BUSINESS.areaServed.map((suburb) => `${suburb}, NSW`),
    audience: {
      "@type": "EducationalAudience",
      educationalRole: "student",
      audienceType: fee.years,
    },
    offers: {
      "@type": "Offer",
      price: fee.price,
      priceCurrency: "AUD",
      description: `$${fee.price} per ${sessionLength(fee.hours)} session`,
      url: absoluteUrl("/programs"),
    },
  }));
