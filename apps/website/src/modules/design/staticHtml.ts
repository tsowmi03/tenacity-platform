import fs from "fs";
import path from "path";

export type DesignPageName =
  | "home.html"
  | "programs.html"
  | "about.html"
  | "contact.html"
  | "register.html";

export type DesignFaq = { question: string; answer: string };

export type DesignStaticProps = {
  html: string;
  title: string;
  description: string;
  /** The page's FAQ accordion as plain text, for structured data. */
  faqs: DesignFaq[];
};

const decodeHtml = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&ndash;/g, "-")
    .replace(/&mdash;/g, "-");

const plainText = (value: string) =>
  decodeHtml(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

/**
 * Reads the questions and answers out of a page's FAQ accordion, so the
 * structured data always says what the page says.
 */
export const extractFaqs = (html: string): DesignFaq[] => {
  const items =
    html.match(/<div class="faq-item">[\s\S]*?<\/div><\/div>/g) ?? [];
  return items.flatMap((item) => {
    const question = item.match(/<button class="faq-q">([\s\S]*?)<span/)?.[1];
    const answer = item.match(
      /<div class="faq-a-inner">([\s\S]*?)<\/div><\/div>/
    )?.[1];
    return question && answer
      ? [{ question: plainText(question), answer: plainText(answer) }]
      : [];
  });
};

const transformDesignHtml = (html: string) => {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) {
    throw new Error("Design HTML is missing a body element.");
  }

  return bodyMatch[1]
    .replace(/<script\b[^>]*><\/script>/gi, "")
    .replace(/href="Tenacity Homepage\.html(#.*?)?"/g, (_match, hash = "") => {
      return `href="/${hash}"`;
    })
    .replace(/href="Programs\.html(#.*?)?"/g, (_match, hash = "") => {
      return `href="/programs${hash}"`;
    })
    .replace(/href="About\.html(#.*?)?"/g, (_match, hash = "") => {
      return `href="/about${hash}"`;
    })
    .replace(/href="Contact\.html(#.*?)?"/g, (_match, hash = "") => {
      return `href="/contact${hash}"`;
    })
    .replace(/href="Register\.html(#.*?)?"/g, (_match, hash = "") => {
      return `href="/register${hash}"`;
    })
    .replace(/(src|href)="assets\//g, '$1="/claude-design/')
    .replace(
      /<a href="#">Terms &amp; Conditions<\/a>/g,
      '<span class="footer-legal"><a href="/terms">Terms &amp; Conditions</a><a href="/privacy">Privacy Policy</a></span>'
    )
    .trim();
};

export const getDesignStaticProps = (
  pageName: DesignPageName
): DesignStaticProps => {
  const filePath = path.join(
    process.cwd(),
    "src",
    "modules",
    "design",
    "static",
    pageName
  );
  const source = fs.readFileSync(filePath, "utf8");
  const title =
    source.match(/<title>(.*?)<\/title>/i)?.[1] ??
    "Tenacity Tutoring | Determination Meets Success";
  const description =
    source.match(/<meta name="description" content="([^"]*)"/i)?.[1] ?? "";

  return {
    html: transformDesignHtml(source),
    title: decodeHtml(title),
    description: decodeHtml(description),
    faqs: extractFaqs(source),
  };
};
