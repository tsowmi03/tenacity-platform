"use strict";

// Best-effort DOCX→PDF conversion for in-portal previews, via an external
// Gotenberg-compatible service (headless LibreOffice behind a simple HTTP
// API). The DOCX stays the deliverable — the PDF only powers the "preview
// before download" pane — so callers must treat conversion failure as
// non-fatal and complete the job without a preview.
//
// The converter URL comes from the RESOURCE_PDF_PREVIEW_URL function param;
// an empty value disables previews entirely (createPdfPreviewConverter
// returns null). When the service is a private Cloud Run instance, requests
// are authenticated with an ID token minted for the converter's URL.

const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DEFAULT_TIMEOUT_MS = 60000;

// Mint an Authorization header for a private Cloud Run converter. Only
// attempted when running on GCP (K_SERVICE is set); local converters (e.g.
// `docker run gotenberg/gotenberg`) are called unauthenticated.
async function defaultAuthHeader(audience) {
  if (!process.env.K_SERVICE) return null;
  try {
    const { GoogleAuth } = require("google-auth-library");
    const client = await new GoogleAuth().getIdTokenClient(audience);
    const headers = await client.getRequestHeaders();
    // google-auth-library v9 returns a plain object, v10 a Headers instance.
    return typeof headers.get === "function"
      ? headers.get("Authorization")
      : headers.Authorization || null;
  } catch {
    return null;
  }
}

function createPdfPreviewConverter({
  url,
  fetchImpl = fetch,
  getAuthHeader = defaultAuthHeader,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const baseUrl = String(url || "").trim().replace(/\/+$/, "");
  if (!baseUrl) return null;

  return {
    async convert({ docxBuffer, fileName }) {
      if (!Buffer.isBuffer(docxBuffer) || !docxBuffer.length) {
        throw new TypeError("convert requires a non-empty docxBuffer");
      }

      const form = new FormData();
      form.append(
        "files",
        new Blob([docxBuffer], { type: DOCX_CONTENT_TYPE }),
        fileName && /\.docx$/i.test(fileName) ? fileName : "resource.docx"
      );

      const headers = {};
      const authHeader = await getAuthHeader(baseUrl);
      if (authHeader) headers.Authorization = authHeader;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetchImpl(`${baseUrl}/forms/libreoffice/convert`, {
          method: "POST",
          body: form,
          headers,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `PDF converter responded ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`
        );
      }
      const pdf = Buffer.from(await response.arrayBuffer());
      if (!pdf.length) throw new Error("PDF converter returned an empty document");
      return pdf;
    },
  };
}

module.exports = { createPdfPreviewConverter };
