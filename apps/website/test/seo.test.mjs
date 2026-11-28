import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

// WEB-5: the files search engines and AI assistants read must agree with the
// facts in src/lib/site.ts and with what the pages themselves say.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

// Run the real TypeScript modules.
const loadModule = (relativePath) => {
  const filename = path.join(root, relativePath);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  const require = (id) => {
    if (id === "fs") return { default: fs, ...fs };
    if (id === "path") return { default: path, ...path };
    if (id.startsWith("@lib/")) return loadModule(`src/lib/${id.slice(5)}.ts`);
    throw new Error(`Unexpected dependency: ${id}`);
  };
  vm.runInNewContext(
    source,
    { module, exports: module.exports, require, process, Math, JSON },
    { filename }
  );
  return module.exports;
};

// Values built inside the module sandbox have their own Array and Object, so
// compare plain copies.
const plain = (value) => JSON.parse(JSON.stringify(value));

const site = loadModule("src/lib/site.ts");
const structuredData = loadModule("src/lib/structuredData.ts");
const { extractFaqs } = loadModule("src/modules/design/staticHtml.ts");

const robots = read("public/robots.txt");
const sitemap = read("public/sitemap.xml");
const llms = read("public/llms.txt");
const homeHtml = read("src/modules/design/static/home.html");
const programsHtml = read("src/modules/design/static/programs.html");
const contactHtml = read("src/modules/design/static/contact.html");

const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
  (match) => match[1]
);
const indexableUrls = site.INDEXABLE_PATHS.map(site.absoluteUrl);

// Every page file under src/pages, as the path it is served at.
const pagePaths = () => {
  const pagesDir = path.join(root, "src/pages");
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === "api" ? [] : walk(full);
      return /\.tsx$/.test(entry.name) && !entry.name.startsWith("_")
        ? [full]
        : [];
    });
  return walk(pagesDir).map((file) => {
    const route = `/${path.relative(pagesDir, file)}`
      .replace(/\.tsx$/, "")
      .replace(/\/index$/, "");
    return { file, route: route || "/" };
  });
};

test("absoluteUrl builds full www addresses", () => {
  assert.equal(site.absoluteUrl("/"), "https://www.tenacitytutoring.com/");
  assert.equal(
    site.absoluteUrl("/about"),
    "https://www.tenacitytutoring.com/about"
  );
});

test("the sitemap lists exactly the indexable pages", () => {
  assert.deepEqual([...sitemapUrls].sort(), plain(indexableUrls).sort());
});

test("every indexable path is a real page", () => {
  const routes = pagePaths().map((page) => page.route);
  for (const indexable of site.INDEXABLE_PATHS) {
    assert.ok(routes.includes(indexable), `${indexable} has no page file`);
  }
});

test("a page left out of the sitemap is noindex or a redirect", () => {
  for (const { file, route } of pagePaths()) {
    if (site.INDEXABLE_PATHS.includes(route)) continue;
    const source = fs.readFileSync(file, "utf8");
    const hidden = /\bnoindex\b/.test(source) || /\bredirect:/.test(source);
    assert.ok(hidden, `${route} is not in the sitemap and not marked noindex`);
  }
});

test("robots.txt names the sitemap and blocks no indexable page", () => {
  assert.match(
    robots,
    new RegExp(`^Sitemap: ${site.absoluteUrl("/sitemap.xml")}$`, "m")
  );
  const disallowed = [...robots.matchAll(/^Disallow:\s*(\S+)$/gm)].map(
    (match) => match[1]
  );
  assert.ok(disallowed.includes("/api/"));
  for (const indexable of site.INDEXABLE_PATHS) {
    for (const rule of disallowed) {
      assert.ok(
        !indexable.startsWith(rule),
        `robots.txt rule ${rule} blocks ${indexable}`
      );
    }
  }
});

test("robots.txt gives every crawler group the same rules", () => {
  // A named group replaces the general one, so each must repeat the rules.
  const groups = robots
    .split(/\n\s*\n/)
    .filter((block) => /^User-agent:/m.test(block));
  assert.ok(groups.length >= 2);
  const rules = (block) =>
    block
      .split("\n")
      .filter((line) => /^(Allow|Disallow):/.test(line))
      .sort()
      .join("\n");
  for (const group of groups) assert.equal(rules(group), rules(groups[0]));
  for (const crawler of ["OAI-SearchBot", "GPTBot", "ClaudeBot", "PerplexityBot"]) {
    assert.match(robots, new RegExp(`^User-agent: ${crawler}$`, "m"));
  }
});

test("business data carries the details shown on the site", () => {
  const organisation = structuredData.organisationSchema();
  // Survives the JSON round trip the page puts it through.
  const parsed = JSON.parse(JSON.stringify(organisation));
  assert.equal(parsed["@context"], "https://schema.org");
  assert.ok(parsed["@type"].includes("LocalBusiness"));
  assert.equal(parsed.url, "https://www.tenacitytutoring.com/");
  assert.equal(parsed.address.addressLocality, "Narwee");
  assert.equal(parsed.priceRange, "$60-$70 per hour");
  assert.deepEqual(parsed.openingHoursSpecification[0].dayOfWeek, [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
  ]);
  for (const url of [parsed.logo, parsed.image, ...parsed.sameAs]) {
    assert.match(url, /^https:\/\//);
  }
  for (const file of [site.BUSINESS.logoPath, site.BUSINESS.imagePath]) {
    assert.ok(fs.existsSync(path.join(root, "public", file)), `${file} missing`);
  }

  // The same phone, email and address a visitor sees on the contact page.
  assert.ok(contactHtml.includes(site.BUSINESS.phoneDisplay));
  assert.equal(
    site.BUSINESS.phone,
    `+61${site.BUSINESS.phoneDisplay.replace(/\s/g, "").slice(1)}`
  );
  assert.ok(contactHtml.includes(site.BUSINESS.email));
  assert.ok(contactHtml.includes(site.BUSINESS.address.street));
});

test("fees match the fees page, the FAQ and llms.txt", () => {
  const faqText = extractFaqs(homeHtml)
    .map((faq) => faq.answer)
    .join(" ");
  for (const fee of site.FEES) {
    const price = `$${fee.price}`;
    assert.ok(programsHtml.includes(price), `${price} not on /programs`);
    assert.ok(faqText.includes(price), `${price} not in the home page FAQ`);
    assert.ok(llms.includes(price), `${price} not in llms.txt`);
  }
  const services = structuredData.servicesSchema();
  assert.equal(services.length, site.FEES.length);
  assert.deepEqual(
    plain(services.map((service) => service.offers.price)),
    plain(site.FEES.map((fee) => fee.price))
  );
  for (const service of services) {
    assert.equal(service.offers.priceCurrency, "AUD");
  }
});

test("the home page FAQ is read into structured data as plain text", () => {
  const faqs = extractFaqs(homeHtml);
  assert.equal(faqs.length, (homeHtml.match(/class="faq-item"/g) ?? []).length);
  assert.ok(faqs.length >= 4);
  for (const faq of faqs) {
    assert.ok(faq.question.endsWith("?"), faq.question);
    assert.ok(faq.answer.length > 20);
    assert.doesNotMatch(faq.question + faq.answer, /[<>]|&amp;/);
  }
  const schema = structuredData.faqSchema(faqs);
  assert.equal(schema["@type"], "FAQPage");
  assert.equal(schema.mainEntity.length, faqs.length);
  assert.deepEqual(plain(extractFaqs(programsHtml)), []);
});

test("llms.txt links only to indexable pages and states the contact details", () => {
  const links = [...llms.matchAll(/https:\/\/www\.tenacitytutoring\.com[^\s)]*/g)]
    .map((match) => match[0].replace(/[.,:]+$/, ""));
  assert.ok(links.length >= site.INDEXABLE_PATHS.length);
  for (const link of links) {
    assert.ok(indexableUrls.includes(link), `${link} is not an indexable page`);
  }
  assert.ok(llms.includes(site.BUSINESS.phoneDisplay));
  assert.ok(llms.includes(site.BUSINESS.email));
  assert.ok(llms.includes(site.BUSINESS.address.street));
});

test("the home page has one main heading naming the subjects and the suburb", () => {
  const headings = [...homeHtml.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map(
    (match) => match[1]
  );
  assert.equal(headings.length, 1);
  assert.match(headings[0], /Maths/);
  assert.match(headings[0], /English/);
  assert.match(headings[0], /Narwee/);
});

test("the home page links its Google rating to the listing, without a review count", () => {
  const links = homeHtml.split(site.BUSINESS.googleListingUrl).length - 1;
  assert.equal(links, 2, "hero rating and the reviews link");
  assert.match(homeHtml, /5\.0 on Google/);
  assert.match(homeHtml, /Read our Google reviews/);
  assert.doesNotMatch(homeHtml, /\d+\s+(Google\s+)?reviews/i);
});

test("the footer icons link to the Facebook and Instagram pages", () => {
  for (const page of ["home", "programs", "about", "contact", "register"]) {
    const html = read(`src/modules/design/static/${page}.html`);
    const footer = html.match(/<div class="footer-socials">[\s\S]*?<\/div>/)?.[0] ?? "";
    assert.ok(footer.includes(`href="${site.BUSINESS.facebookUrl}"`), `${page}: Facebook`);
    assert.ok(footer.includes(`href="${site.BUSINESS.instagramUrl}"`), `${page}: Instagram`);
    assert.doesNotMatch(footer, /href="#"/);
  }
});
