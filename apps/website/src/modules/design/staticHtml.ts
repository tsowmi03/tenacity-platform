import fs from "fs";
import path from "path";

export type DesignPageName =
  | "home.html"
  | "programs.html"
  | "about.html"
  | "contact.html"
  | "register.html";

export type DesignStaticProps = {
  html: string;
  title: string;
  description: string;
};

const decodeHtml = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&ndash;/g, "-")
    .replace(/&mdash;/g, "-");

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
      '<a href="/T&Cs.pdf">Terms &amp; Conditions</a>'
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
  };
};
