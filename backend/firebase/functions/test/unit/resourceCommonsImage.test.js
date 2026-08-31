"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  MIN_LONG_EDGE,
  clusterKey,
  licenceFor,
  queryVariants,
  rejectionReason,
  scoreCandidate,
  sourceCommonsImage,
} = require("../../src/resources/commonsImage");

// Commons returns extmetadata as { Field: { value } }; build that shape tersely.
function meta(fields) {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v }]));
}

function candidate(overrides = {}) {
  return {
    title: "File:A poster.jpg",
    width: 1200,
    height: 1600,
    mime: "image/jpeg",
    licence: { safe: true, name: "Public domain", url: null, restrictions: null },
    creator: "A. Artist",
    cluster: "a poster",
    ...overrides,
  };
}

describe("Commons licence verdicts", () => {
  // The bug that produced a bad measurement during the spike: License and
  // LicenseShortName use different vocabularies and must be read separately.
  it("accepts public domain, whose code is 'pd' and label is 'Public domain'", () => {
    const licence = licenceFor(meta({ License: "pd", LicenseShortName: "Public domain" }));
    assert.equal(licence.safe, true);
    assert.equal(licence.name, "Public domain");
  });

  it("accepts CC BY and CC BY-SA at any version", () => {
    for (const [code, short] of [
      ["cc-by-2.0", "CC BY 2.0"],
      ["cc-by-sa-4.0", "CC BY-SA 4.0"],
      ["cc0", "CC0"],
    ]) {
      assert.equal(licenceFor(meta({ License: code, LicenseShortName: short })).safe, true, code);
    }
  });

  it("rejects NonCommercial and NoDerivatives — Tenacity charges for tutoring", () => {
    for (const [code, short] of [
      ["cc-by-nc-2.0", "CC BY-NC 2.0"],
      ["cc-by-nc-sa-3.0", "CC BY-NC-SA 3.0"],
      ["cc-by-nd-4.0", "CC BY-ND 4.0"],
    ]) {
      assert.equal(licenceFor(meta({ License: code, LicenseShortName: short })).safe, false, code);
    }
  });

  it("rejects a file with no licence metadata at all", () => {
    assert.equal(licenceFor({}).safe, false);
    assert.equal(licenceFor(undefined).safe, false);
  });

  it("surfaces a Restrictions flag without conflating it with the licence", () => {
    const licence = licenceFor(
      meta({ License: "pd", LicenseShortName: "Public domain", Restrictions: "trademarked" })
    );
    assert.equal(licence.safe, true);
    assert.equal(licence.restrictions, "trademarked");
  });

  it("strips the markup Commons wraps around licence and artist values", () => {
    const licence = licenceFor(
      meta({ License: "cc-by-sa-4.0", LicenseShortName: "<a href='#'>CC BY-SA 4.0</a>" })
    );
    assert.equal(licence.name, "CC BY-SA 4.0");
  });
});

describe("Commons candidate filtering", () => {
  const noExclusions = { excludeClusters: new Set() };

  it("accepts a large, freely-licensed, unencumbered image", () => {
    assert.equal(rejectionReason(candidate(), noExclusions), null);
  });

  it("rejects an image below the minimum native long edge", () => {
    const small = candidate({ width: 149, height: 108 });
    assert.equal(rejectionReason(small, noExclusions), "too-small");
  });

  it("applies the resolution gate to the native size, not the thumbnail", () => {
    // Commons will serve a 1200px thumbnail of a 149x108 original; embedding it
    // gives a blurred postage stamp. Only the native size may be trusted.
    const upscaled = candidate({ width: 149, height: 108, thumbWidth: 1200 });
    assert.equal(rejectionReason(upscaled, noExclusions), "too-small");
  });

  it("accepts an image exactly at the threshold", () => {
    assert.equal(rejectionReason(candidate({ width: 400, height: MIN_LONG_EDGE }), noExclusions), null);
  });

  it("rejects a restricted image even when the licence is free", () => {
    const trademarked = candidate({
      licence: { safe: true, name: "Public domain", url: null, restrictions: "trademarked" },
    });
    assert.equal(rejectionReason(trademarked, noExclusions), "restricted");
  });

  it("rejects a format sharp cannot decode", () => {
    assert.equal(rejectionReason(candidate({ mime: "application/pdf" }), noExclusions), "format");
  });

  it("accepts webp and tiff, which are converted before embedding", () => {
    assert.equal(rejectionReason(candidate({ mime: "image/webp" }), noExclusions), null);
    assert.equal(rejectionReason(candidate({ mime: "image/tiff" }), noExclusions), null);
  });

  it("rejects a near-duplicate of an image already in the set", () => {
    const excludeClusters = new Set(["a poster"]);
    assert.equal(rejectionReason(candidate(), { excludeClusters }), "duplicate");
  });

  it("reports the licence problem first, as the one that can never be fixed", () => {
    const hopeless = candidate({
      width: 100,
      height: 100,
      licence: { safe: false, name: "CC BY-NC 2.0", url: null, restrictions: null },
    });
    assert.equal(rejectionReason(hopeless, noExclusions), "licence");
  });
});

describe("Commons near-duplicate clustering", () => {
  it("collapses a scanned series to one key", () => {
    // Real Commons filenames: without this a stimulus set is three Coca-Cola ads.
    const keys = [
      "File:Coca-Cola ad 1923-09.png",
      "File:Coca-Cola ad 1923-10.png",
      "File:Coca-Cola ad 1924-12.png",
    ].map(clusterKey);
    assert.equal(new Set(keys).size, 1);
  });

  it("keeps genuinely different images apart", () => {
    const a = clusterKey("File:Britain Needs You at Once - WWI recruitment poster.jpg");
    const b = clusterKey("File:Coca-Cola ad 1923-09.png");
    assert.notEqual(a, b);
  });
});

describe("Commons candidate ranking", () => {
  it("prefers an attributable creator over an unknown one", () => {
    const known = candidate({ creator: "James Montgomery Flagg", width: 900, height: 900 });
    const unknown = candidate({ creator: "Unknown", width: 4000, height: 4000 });
    assert.ok(scoreCandidate(known) > scoreCandidate(unknown));
  });

  it("prefers the larger image when both are attributable", () => {
    const big = candidate({ width: 4000, height: 4000 });
    const small = candidate({ width: 900, height: 900 });
    assert.ok(scoreCandidate(big) > scoreCandidate(small));
  });
});

describe("Commons query variants", () => {
  it("leads with the region, then falls back to an unqualified search", () => {
    const variants = queryVariants("war poster", "Australian");
    assert.deepEqual(variants, [
      { query: "Australian war poster", isRegional: true },
      { query: "war poster", isRegional: false },
    ]);
  });

  it("progressively drops qualifiers, since Commons ANDs every term", () => {
    // "abandoned house fog atmospheric" matches nothing; "abandoned house" matches 180,000.
    const queries = queryVariants("abandoned house fog atmospheric", "").map((v) => v.query);
    assert.deepEqual(queries, [
      "abandoned house fog atmospheric",
      "abandoned house fog",
      "abandoned house",
    ]);
  });

  it("never shortens below two words", () => {
    for (const v of queryVariants("a b c d e", "")) {
      assert.ok(v.query.split(" ").length >= 2, v.query);
    }
  });

  it("does not repeat a query when the region search equals the plain one", () => {
    const queries = queryVariants("poster", "").map((v) => v.query);
    assert.deepEqual(queries, ["poster"]);
  });
});

describe("sourceCommonsImage", () => {
  const image = { buffer: Buffer.from("bytes"), type: "jpg", width: 1200, height: 1600 };

  function harness({ byQuery, download }) {
    const searched = [];
    return {
      searched,
      deps: {
        search: async (query) => {
          searched.push(query);
          return byQuery[query] ? byQuery[query].map((c) => c.title) : [];
        },
        info: async (titles) =>
          Object.values(byQuery)
            .flat()
            .filter((c) => titles.includes(c.title)),
        download: download || (async () => image),
      },
    };
  }

  it("sources an image and carries its attribution", async () => {
    const { deps } = harness({
      byQuery: {
        "recruitment poster": [
          candidate({
            title: "File:Britain Needs You.jpg",
            pageUrl: "https://commons.wikimedia.org/wiki/File:Britain_Needs_You.jpg",
            creator: "Edgar James Kealey",
            date: "1915",
            licence: { safe: true, name: "Public domain", url: null, restrictions: null },
            cluster: "britain needs you",
          }),
        ],
      },
    });
    const result = await sourceCommonsImage({
      selection: { searchTerms: "recruitment poster" },
      ...deps,
    });

    assert.equal(result.ok, true);
    assert.equal(result.sourceName, "Wikimedia Commons");
    assert.equal(result.creator, "Edgar James Kealey");
    assert.equal(result.date, "1915");
    assert.equal(result.licence, "Public domain");
    assert.equal(result.sourceUrl, "https://commons.wikimedia.org/wiki/File:Britain_Needs_You.jpg");
    assert.equal(result.image.type, "jpg");
    assert.equal(result.regionFallbackUsed, false);
  });

  it("falls back to international material when the region finds nothing usable", async () => {
    const { searched, deps } = harness({
      byQuery: {
        // The region-qualified search returns nothing at all.
        "Australian immigration poster": [],
        "immigration poster": [candidate({ title: "File:Ellis Island.jpg", cluster: "ellis island" })],
      },
    });
    const result = await sourceCommonsImage({
      selection: { searchTerms: "immigration poster", region: "Australian" },
      ...deps,
    });

    assert.equal(result.ok, true);
    assert.equal(result.regionFallbackUsed, true);
    assert.deepEqual(searched, ["Australian immigration poster", "immigration poster"]);
  });

  it("does not report a region fallback when no region was asked for", async () => {
    const { deps } = harness({
      byQuery: {
        "abandoned house fog": [],
        "abandoned house": [candidate({ title: "File:Old house.jpg", cluster: "old house" })],
      },
    });
    const result = await sourceCommonsImage({
      selection: { searchTerms: "abandoned house fog" },
      ...deps,
    });
    assert.equal(result.ok, true);
    assert.equal(result.regionFallbackUsed, false);
  });

  it("skips an already-used image so a set cannot repeat one series", async () => {
    const { deps } = harness({
      byQuery: {
        "coca cola advertisement": [
          candidate({ title: "File:Coca-Cola ad 1923-09.png", cluster: "coca cola ad" }),
          candidate({ title: "File:Coca-Cola ad 1924-12.png", cluster: "coca cola ad" }),
        ],
      },
    });
    const result = await sourceCommonsImage({
      selection: { searchTerms: "coca cola advertisement" },
      excludeClusters: new Set(["coca cola ad"]),
      ...deps,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "no-usable-candidate");
    assert.equal(result.checks.rejected.duplicate, 2);
  });

  it("fails closed when nothing usable is found, rather than inventing a placeholder", async () => {
    const { deps } = harness({ byQuery: {} });
    const result = await sourceCommonsImage({ selection: { searchTerms: "nothing at all" }, ...deps });
    assert.equal(result.ok, false);
    assert.equal(result.image, undefined);
  });

  it("fails closed without searching when the planner gave no search terms", async () => {
    const { searched, deps } = harness({ byQuery: {} });
    const result = await sourceCommonsImage({ selection: {}, ...deps });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "no-search-terms");
    assert.deepEqual(searched, []);
  });

  it("survives a search error and tries the next query variant", async () => {
    const searched = [];
    const result = await sourceCommonsImage({
      selection: { searchTerms: "poster of protest" },
      search: async (query) => {
        searched.push(query);
        if (query === "poster of protest") throw new Error("HTTP 429");
        return ["File:Protest.jpg"];
      },
      info: async () => [candidate({ title: "File:Protest.jpg", cluster: "protest" })],
      download: async () => image,
    });
    assert.equal(result.ok, true);
    assert.equal(searched.length, 2);
  });

  it("reports rather than throws when the download fails", async () => {
    const { deps } = harness({
      byQuery: { "a poster": [candidate()] },
      download: async () => {
        throw new Error("socket hang up");
      },
    });
    const result = await sourceCommonsImage({ selection: { searchTerms: "a poster" }, ...deps });
    assert.equal(result.ok, false);
    assert.equal(result.checks.downloadError, "socket hang up");
  });
});
