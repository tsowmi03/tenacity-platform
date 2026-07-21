import { sign } from "node:crypto";

const allowedTokenUris = new Set([
  "https://oauth2.googleapis.com/token",
  "https://accounts.google.com/o/oauth2/token",
]);
const allowedApiOrigins = new Set([
  "https://firebaserules.googleapis.com",
  "https://firestore.googleapis.com",
]);
const allowedApiMethods = new Set(["GET", "PATCH"]);
const defaultRequestTimeoutMs = 30_000;
const maximumRequestTimeoutMs = 120_000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function normalizedScopes(scopes) {
  const values = typeof scopes === "string" ? [scopes] : scopes;
  assert(Array.isArray(values) && values.length > 0, "At least one OAuth scope is required.");
  assert(
    values.every(
      (scope) =>
        typeof scope === "string" &&
        /^https:\/\/www\.googleapis\.com\/auth\/[A-Za-z0-9._-]+$/.test(scope)
    ),
    "OAuth scopes must be Google API scope URLs."
  );
  return [...new Set(values)].sort();
}

function responseErrorMessage(payload, secrets = []) {
  const message = payload?.error?.message ?? payload?.error_description;
  if (typeof message !== "string" || message.length === 0) return null;
  let sanitized = message.replace(/[\r\n]+/g, " ");
  for (const secret of secrets) {
    if (typeof secret === "string" && secret.length > 0) {
      sanitized = sanitized.split(secret).join("[REDACTED]");
    }
  }
  return sanitized.slice(0, 500);
}

async function readResponseJson(response, label) {
  const text = await response.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} returned invalid JSON.`);
  }
}

export class GoogleApiError extends Error {
  constructor(message, { status = null } = {}) {
    super(message);
    this.name = "GoogleApiError";
    this.status = status;
  }
}

function validateRequestTimeout(timeoutMs) {
  assert(
    Number.isSafeInteger(timeoutMs) &&
      timeoutMs > 0 &&
      timeoutMs <= maximumRequestTimeoutMs,
    `Request timeout must be an integer from 1 to ${maximumRequestTimeoutMs} milliseconds.`
  );
  return timeoutMs;
}

async function boundedJsonRequest({
  fetchImpl,
  url,
  init,
  label,
  timeoutMs,
}) {
  validateRequestTimeout(timeoutMs);
  const controller = new AbortController();
  let timer;
  const timeoutError = new GoogleApiError(
    `${label} timed out after ${timeoutMs} milliseconds.`
  );
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(timeoutError);
    }, timeoutMs);
  });
  const request = (async () => {
    let response;
    try {
      response = await fetchImpl(url, {
        ...init,
        redirect: "error",
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) throw timeoutError;
      throw new GoogleApiError(`${label} request failed.`);
    }
    assert(
      response &&
        typeof response === "object" &&
        typeof response.ok === "boolean" &&
        Number.isInteger(response.status) &&
        typeof response.text === "function",
      `${label} returned an invalid response.`
    );
    if (response.redirected === true) {
      throw new GoogleApiError(`${label} returned a redirect.`);
    }
    let payload;
    try {
      payload = await readResponseJson(response, label);
    } catch {
      if (controller.signal.aborted) throw timeoutError;
      throw new GoogleApiError(`${label} returned invalid JSON.`);
    }
    return { response, payload };
  })();
  try {
    return await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function getAccessToken({
  serviceAccount,
  scopes,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  timeoutMs = defaultRequestTimeoutMs,
} = {}) {
  assert(serviceAccount && typeof serviceAccount === "object", "Service-account JSON is required.");
  assert(
    typeof serviceAccount.client_email === "string" &&
      /^[^@\s]+@[^@\s]+\.gserviceaccount\.com$/.test(serviceAccount.client_email),
    "Service-account client_email is invalid."
  );
  assert(
    typeof serviceAccount.private_key === "string" &&
      serviceAccount.private_key.includes("-----BEGIN PRIVATE KEY-----") &&
      serviceAccount.private_key.includes("-----END PRIVATE KEY-----"),
    "Service-account private_key is invalid."
  );
  assert(typeof fetchImpl === "function", "fetchImpl must be a function.");
  assert(typeof now === "function", "now must be a function.");

  const tokenUri = serviceAccount.token_uri ?? "https://oauth2.googleapis.com/token";
  assert(allowedTokenUris.has(tokenUri), "Service-account token_uri is not an approved Google endpoint.");
  const scope = normalizedScopes(scopes).join(" ");
  const issuedAt = Math.floor(now() / 1000);
  assert(Number.isSafeInteger(issuedAt) && issuedAt > 0, "Current time is invalid.");

  const header = {
    alg: "RS256",
    typ: "JWT",
    ...(serviceAccount.private_key_id ? { kid: serviceAccount.private_key_id } : {}),
  };
  const claims = {
    iss: serviceAccount.client_email,
    scope,
    aud: tokenUri,
    iat: issuedAt,
    exp: issuedAt + 3600,
  };
  const unsignedAssertion = `${base64UrlJson(header)}.${base64UrlJson(claims)}`;
  const signature = sign("RSA-SHA256", Buffer.from(unsignedAssertion), serviceAccount.private_key);
  const assertion = `${unsignedAssertion}.${signature.toString("base64url")}`;
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const { response, payload } = await boundedJsonRequest({
    fetchImpl,
    url: tokenUri,
    label: "Google OAuth token endpoint",
    timeoutMs,
    init: {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    },
  });
  if (!response.ok) {
    const detail = responseErrorMessage(payload, [assertion]);
    throw new GoogleApiError(
      `Google OAuth token request failed with HTTP ${response.status}${detail ? `: ${detail}` : "."}`,
      { status: response.status }
    );
  }
  assert(
    typeof payload?.access_token === "string" && payload.access_token.length > 0,
    "Google OAuth token response did not contain an access token."
  );
  assert(
    payload.token_type === undefined || payload.token_type === "Bearer",
    "Google OAuth token response used an unsupported token type."
  );
  return payload.access_token;
}

export async function authorizedJsonRequest(
  url,
  {
    accessToken,
    fetchImpl = globalThis.fetch,
    method = "GET",
    headers = {},
    body,
    timeoutMs = defaultRequestTimeoutMs,
  } = {}
) {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("Google API URL is invalid.");
  }
  assert(
    parsedUrl.protocol === "https:" &&
      parsedUrl.username === "" &&
      parsedUrl.password === "" &&
      parsedUrl.port === "" &&
      allowedApiOrigins.has(parsedUrl.origin),
    "Google API URL origin is not approved."
  );
  assert(typeof accessToken === "string" && accessToken.length > 0, "Google API access token is required.");
  assert(typeof fetchImpl === "function", "fetchImpl must be a function.");
  assert(
    allowedApiMethods.has(method),
    "Google API method must be GET or PATCH."
  );
  assert(
    method !== "PATCH" ||
      parsedUrl.origin === "https://firebaserules.googleapis.com",
    "Google API PATCH requests are allowed only for Firebase Rules."
  );
  assert(
    method !== "GET" || body === undefined,
    "Google API GET requests cannot contain a body."
  );

  assert(headers && typeof headers === "object" && !Array.isArray(headers), "HTTP headers must be an object.");
  const requestHeaders = {};
  for (const [name, value] of Object.entries(headers)) {
    const normalizedName = name.toLowerCase();
    assert(normalizedName !== "authorization", "Authorization header is managed by the Google API client.");
    assert(typeof value === "string", `HTTP header ${name} must be a string.`);
    requestHeaders[normalizedName] = value;
  }
  requestHeaders.accept ??= "application/json";
  requestHeaders.authorization = `Bearer ${accessToken}`;
  let requestBody = body;
  if (body !== undefined && typeof body !== "string" && !(body instanceof Uint8Array)) {
    requestHeaders["content-type"] ??= "application/json";
    requestBody = JSON.stringify(body);
  }

  const { response, payload } = await boundedJsonRequest({
    fetchImpl,
    url,
    label: "Google API",
    timeoutMs,
    init: {
      method,
      headers: requestHeaders,
      ...(body === undefined ? {} : { body: requestBody }),
    },
  });
  if (!response.ok) {
    const detail = responseErrorMessage(payload, [accessToken]);
    throw new GoogleApiError(
      `Google API request failed with HTTP ${response.status}${detail ? `: ${detail}` : "."}`,
      { status: response.status }
    );
  }
  return payload;
}
