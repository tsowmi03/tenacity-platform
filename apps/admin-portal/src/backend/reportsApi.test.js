import { describe, expect, it } from "vitest";
import { base64ToBlob, exportResultToBlob } from "./reportsApi";

async function blobText(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}

async function blobBytes(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.readAsArrayBuffer(blob);
  });
}

describe("base64ToBlob", () => {
  it("decodes a base64 string into a Blob with the requested type", async () => {
    const base64 = btoa("hello");
    const blob = base64ToBlob(base64, "text/plain");
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("text/plain");
    expect(await blobText(blob)).toBe("hello");
  });
});

describe("exportResultToBlob", () => {
  it("wraps a CSV string into a Blob using the response contentType", async () => {
    const blob = exportResultToBlob({
      csv: "a,b\n1,2",
      contentType: "text/csv; charset=utf-8",
    });
    expect(blob.type).toBe("text/csv; charset=utf-8");
    expect(await blobText(blob)).toBe("a,b\n1,2");
  });

  it("decodes a base64 data string into a Blob", async () => {
    const blob = exportResultToBlob({
      data: btoa("pdf-bytes"),
      contentType: "application/pdf",
    });
    expect(blob.type).toBe("application/pdf");
    expect(await blobText(blob)).toBe("pdf-bytes");
  });

  it("handles Node Buffer.toJSON() shape {type: 'Buffer', data: [...]}", async () => {
    const bytes = [104, 101, 108, 108, 111]; // "hello"
    const blob = exportResultToBlob({
      data: { type: "Buffer", data: bytes },
      contentType: "application/octet-stream",
    });
    expect(blob.type).toBe("application/octet-stream");
    const out = await blobBytes(blob);
    expect(Array.from(out)).toEqual(bytes);
  });

  it("falls back to application/octet-stream when no contentType is provided", () => {
    const blob = exportResultToBlob({ csv: "x" });
    expect(blob.type).toBe("application/octet-stream");
  });

  it("throws when no recognised payload is present", () => {
    expect(() => exportResultToBlob({})).toThrow(/no recognisable payload/i);
  });
});
