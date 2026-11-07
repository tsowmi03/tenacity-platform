"use strict";

// RES-60. A diagram taken from the question bank is a "source-image": the
// original crop, kept in Storage. Its PNG bytes are needed only to build the
// DOCX. Everything else — the stored generatedJson, the JSON clones the build
// takes, a revision reading the resource back — carries just its storage path,
// so a resource with several crops never bloats a job document.

const SOURCE_IMAGE = "source-image";

function walkSourceImages(node, visit) {
  if (Array.isArray(node)) {
    node.forEach((child) => walkSourceImages(child, visit));
    return;
  }
  if (!node || typeof node !== "object" || Buffer.isBuffer(node)) return;
  if (node.type === SOURCE_IMAGE && typeof node.storagePath === "string") {
    visit(node);
    return;
  }
  for (const value of Object.values(node)) walkSourceImages(value, visit);
}

/**
 * JSON.stringify replacer that leaves image bytes out: a bank diagram's
 * `image` and, since RES-94, any other Buffer (an English stimulus photo keeps
 * its bytes in `image.buffer`). JSON.stringify hands the replacer a Buffer's
 * toJSON() form, { type: "Buffer", data: [...] }; left in, one photo made the
 * stored resource 5 MB, over Firestore's 1 MiB field limit.
 */
function isSerialisedBuffer(value) {
  return Boolean(value) && (Buffer.isBuffer(value) || (value.type === "Buffer" && Array.isArray(value.data)));
}
function withoutSourceImageBytes(key, value) {
  if (key === "image" && value && (Buffer.isBuffer(value) || value.type === "Buffer")) return undefined;
  if (isSerialisedBuffer(value)) return undefined;
  return value;
}

/** Deep copy of plain JSON-like data that keeps every Buffer as a Buffer. */
function cloneKeepingBuffers(node) {
  if (Buffer.isBuffer(node)) return node;
  if (Array.isArray(node)) return node.map(cloneKeepingBuffers);
  if (!node || typeof node !== "object") return node;
  if (typeof node.toJSON === "function") return JSON.parse(JSON.stringify(node));
  const copy = {};
  for (const [key, value] of Object.entries(node)) if (value !== undefined) copy[key] = cloneKeepingBuffers(value);
  return copy;
}

function sourceImagesIn(resource) {
  const images = new Map();
  walkSourceImages(resource, (diagram) => {
    if (Buffer.isBuffer(diagram.image)) images.set(diagram.storagePath, diagram.image);
  });
  return images;
}

function attachSourceImages(resource, images) {
  walkSourceImages(resource, (diagram) => {
    const image = images.get(diagram.storagePath);
    if (image) diagram.image = image;
  });
  return resource;
}

/**
 * A deep copy that keeps image bytes as Buffers: bank diagrams' and, since
 * RES-94, a sourced stimulus photo's (`image.buffer`), which a JSON copy turned
 * into an array of numbers so every English resource with a photo failed its
 * build.
 */
function cloneWithSourceImages(resource) {
  return cloneKeepingBuffers(resource);
}

/** Downloads the bytes of every source image that does not have them yet. */
async function loadSourceImages(resource, bucket) {
  const missing = new Map();
  walkSourceImages(resource, (diagram) => {
    if (!Buffer.isBuffer(diagram.image)) {
      if (!missing.has(diagram.storagePath)) missing.set(diagram.storagePath, []);
      missing.get(diagram.storagePath).push(diagram);
    }
  });
  for (const [storagePath, diagrams] of missing) {
    const [bytes] = await bucket.file(storagePath).download();
    for (const diagram of diagrams) diagram.image = bytes;
  }
  return missing.size;
}

/** Width and height from a PNG's header, without decoding it. */
function pngSize(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") {
    throw new Error("Not a PNG");
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

module.exports = {
  SOURCE_IMAGE,
  attachSourceImages,
  cloneKeepingBuffers,
  cloneWithSourceImages,
  loadSourceImages,
  pngSize,
  sourceImagesIn,
  walkSourceImages,
  withoutSourceImageBytes,
};
