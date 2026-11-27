# Search engines and AI assistants

What the website gives search engines and AI assistants to read (WEB-5), and
what to change when the facts change. The reasoning is in the Confluence page
"Software for growth: proposal (2027)".

## What is there

| Piece | Where | What it does |
| --- | --- | --- |
| Facts | [`src/lib/site.ts`](../src/lib/site.ts) | The site address, business details, hours, fees and the list of indexable pages. **Start here for any change.** |
| Head tags | [`src/modules/common/components/head`](../src/modules/common/components/head/index.tsx) | Every page gets a full canonical address, `og:url` and a full share-image address. `noindex` keeps a page out of search. |
| Structured data | [`src/lib/structuredData.ts`](../src/lib/structuredData.ts) | schema.org JSON-LD, built from the facts. Business data on every indexable page, FAQ data on the home page, service and price data on `/programs`. |
| `robots.txt` | [`public/robots.txt`](../public/robots.txt) | Allows every public page, blocks `/api/`, `/ingest/` and `/r/`, names the sitemap, and lists the AI crawlers as welcome. |
| `sitemap.xml` | [`public/sitemap.xml`](../public/sitemap.xml) | The indexable pages. |
| `llms.txt` | [`public/llms.txt`](../public/llms.txt) | A plain-text summary of Tenacity for AI tools. |

The home page FAQ data is read from the FAQ accordion in
`src/modules/design/static/home.html` at build time, so it always says what
the page says.

`test/seo.test.mjs` fails when any of these disagree: the sitemap against the
page list, the fees against `/programs`, the FAQ and `llms.txt`, and the
contact details against the contact page.

## Changing things

**A price changes.** Update the fees page and the home page FAQ, then `FEES`
in `site.ts` and the Fees section of `llms.txt`. The test names anything
missed.

**Hours, phone, email, address or a social link changes.** Update `BUSINESS`
in `site.ts`, and `llms.txt` if it mentions the detail.

**A new page.** Add its path to `INDEXABLE_PATHS` in `site.ts` and a `<url>`
line to `sitemap.xml`. If it should stay out of search, give its `<Head>` the
`noindex` prop instead. The test fails for a page that has neither.

**A new AI crawler.** Add a `User-agent` line to the named group in
`robots.txt`. A named group replaces the general `*` group, so it repeats the
same rules. Take the name from the vendor's own page:
[OpenAI](https://developers.openai.com/api/docs/bots),
[Anthropic](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler),
[Perplexity](https://docs.perplexity.ai/docs/resources/perplexity-crawlers).

## Decisions

- **No star ratings in the structured data.** Google does not show stars from
  a business's own review markup.
- **The home page's main heading is the small line above the tagline.** It
  names the subjects and the suburb. "Determination meets success." keeps its
  look as a styled paragraph.
- **The hero's background photos have empty alt text on purpose**, apart from
  the first. They are a decorative slideshow.
- **Preview deployments are not indexed.** Vercel adds a noindex header to
  them, so `robots.txt` does not need a staging version.
- **`llms.txt` is unproven.** No assistant has confirmed it reads the file. It
  costs nothing to keep.

## Search Console and Bing

Either verify by DNS, or set the token in Vercel (Production) and redeploy.
The tag is added to every page only when the variable is set.

| Variable | Tag |
| --- | --- |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | `google-site-verification` |
| `NEXT_PUBLIC_BING_SITE_VERIFICATION` | `msvalidate.01` |

Then submit `https://www.tenacitytutoring.com/sitemap.xml` in each tool.

## Checking a deployment

```bash
curl -s https://www.tenacitytutoring.com/robots.txt
curl -s https://www.tenacitytutoring.com/sitemap.xml
curl -s https://www.tenacitytutoring.com/ | grep -o '<link rel="canonical"[^>]*>'
```

Paste a page address into the [Schema Markup Validator](https://validator.schema.org/)
to check the structured data.
