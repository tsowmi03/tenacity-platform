"use strict";

const { GoogleAuth, OAuth2Client } = require("google-auth-library");

const CALENDAR_API_ROOT = "https://www.googleapis.com/calendar/v3";
const CALENDAR_EVENTS_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";
const CALENDAR_DELEGATED_USER = "admin@tenacitytutoring.com";
const CALENDAR_WRITE_ROLES = new Set(["writer", "owner"]);
const CLOUD_PLATFORM_SCOPE =
  "https://www.googleapis.com/auth/cloud-platform";
const IAM_CREDENTIALS_ROOT =
  "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts";
const METADATA_SERVICE_ACCOUNT_EMAIL_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/" +
  "service-accounts/default/email";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWT_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:jwt-bearer";
const TOKEN_REFRESH_SKEW_MS = 60_000;

function delegatedUserClaim(value = CALENDAR_DELEGATED_USER) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (email !== CALENDAR_DELEGATED_USER) {
    throw new Error(
      `Calendar delegated user must be ${CALENDAR_DELEGATED_USER}`
    );
  }
  return email;
}

function assertCalendarWriteAccess(accessRole) {
  if (!CALENDAR_WRITE_ROLES.has(accessRole)) {
    throw new Error(
      "Google Calendar export requires writer access; " +
        `effective role is ${accessRole || "unknown"}`
    );
  }
}

function calendarEventsUrl(calendarId, eventId) {
  const calendar = encodeURIComponent(calendarId);
  const event = eventId ? `/${encodeURIComponent(eventId)}` : "";
  return `${CALENDAR_API_ROOT}/calendars/${calendar}/events${event}`;
}

async function responseJson(response, label) {
  const data = await response.json();
  if (!response.ok) {
    const message =
      data?.error_description ||
      data?.error?.message ||
      `${response.status} ${response.statusText}`;
    throw new Error(`${label}: ${message}`);
  }
  return data;
}

function createCalendarAccessTokenProvider({
  cloudAuth,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  serviceAccountEmailProvider,
  delegatedUser = CALENDAR_DELEGATED_USER,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("Calendar authentication requires fetch");
  }

  const googleCloudAuth =
    cloudAuth ||
    new GoogleAuth({
      scopes: [CLOUD_PLATFORM_SCOPE],
    });
  let cachedToken;
  let serviceAccountEmailPromise;

  async function getServiceAccountEmail() {
    if (!serviceAccountEmailPromise) {
      serviceAccountEmailPromise = serviceAccountEmailProvider
        ? Promise.resolve().then(serviceAccountEmailProvider)
        : fetchImpl(METADATA_SERVICE_ACCOUNT_EMAIL_URL, {
            headers: { "Metadata-Flavor": "Google" },
            redirect: "error",
          }).then((response) => {
            if (!response.ok) {
              throw new Error(
                `Calendar runtime identity lookup failed: ${response.status}`
              );
            }
            return response.text();
          });
    }
    const email = (await serviceAccountEmailPromise).trim();
    if (!email.endsWith(".gserviceaccount.com")) {
      throw new Error("Calendar runtime identity is not a service account");
    }
    return email;
  }

  async function getAccessToken() {
    const currentTime = now();
    if (
      cachedToken &&
      cachedToken.expiresAt - TOKEN_REFRESH_SKEW_MS > currentTime
    ) {
      return cachedToken.value;
    }

    const serviceAccountEmail = await getServiceAccountEmail();
    const subject = delegatedUserClaim(delegatedUser);
    const issuedAt = Math.floor(currentTime / 1000);
    const payload = JSON.stringify({
      iss: serviceAccountEmail,
      sub: subject,
      scope: CALENDAR_EVENTS_SCOPE,
      aud: OAUTH_TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + 3600,
    });
    const signer = await googleCloudAuth.getClient();
    const signed = await signer.request({
      method: "POST",
      url:
        `${IAM_CREDENTIALS_ROOT}/${encodeURIComponent(serviceAccountEmail)}` +
        ":signJwt",
      data: { payload },
    });
    if (!signed.data?.signedJwt) {
      throw new Error("IAM Credentials did not return a signed JWT");
    }

    const tokenResponse = await fetchImpl(OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: JWT_GRANT_TYPE,
        assertion: signed.data.signedJwt,
      }),
      redirect: "error",
    });
    const token = await responseJson(
      tokenResponse,
      "Calendar OAuth token exchange failed"
    );
    if (!token.access_token || !Number.isFinite(Number(token.expires_in))) {
      throw new Error("Calendar OAuth token response is incomplete");
    }
    cachedToken = {
      value: token.access_token,
      expiresAt: currentTime + Number(token.expires_in) * 1000,
    };
    return cachedToken.value;
  }

  return { getAccessToken };
}

function createKeylessCalendarAuth(options) {
  const tokenProvider = createCalendarAccessTokenProvider(options);
  const client = new OAuth2Client();
  return {
    async getClient() {
      return {
        async request(requestOptions) {
          client.setCredentials({
            access_token: await tokenProvider.getAccessToken(),
          });
          return client.request(requestOptions);
        },
      };
    },
  };
}

/**
 * Small Calendar API adapter. Keeping the API behind this interface makes the
 * reconciliation logic testable without credentials or network access.
 *
 * The attached runtime identity signs a short-lived, Calendar-scoped OAuth JWT
 * through IAM Credentials and delegates it to the pinned Tenacity Workspace
 * user. No service-account key is required.
 */
function createGoogleCalendarClient({ auth } = {}) {
  const googleAuth = auth || createKeylessCalendarAuth();
  let clientPromise;

  function getClient() {
    clientPromise ||= googleAuth.getClient();
    return clientPromise;
  }

  async function request(options) {
    const client = await getClient();
    return client.request(options);
  }

  return {
    async listManagedEvents(calendarId, marker) {
      const events = [];
      let pageToken;
      do {
        const response = await request({
          method: "GET",
          url: calendarEventsUrl(calendarId),
          params: {
            maxResults: 2500,
            pageToken,
            privateExtendedProperty: `${marker.key}=${marker.value}`,
            showDeleted: false,
            singleEvents: true,
          },
        });
        if (!pageToken) {
          assertCalendarWriteAccess(response.data?.accessRole);
        }
        events.push(...(response.data?.items || []));
        pageToken = response.data?.nextPageToken;
      } while (pageToken);
      return events;
    },

    async insertEvent(calendarId, event) {
      const response = await request({
        method: "POST",
        url: calendarEventsUrl(calendarId),
        params: { sendUpdates: "none" },
        data: event,
      });
      return response.data;
    },

    async updateEvent(calendarId, eventId, event) {
      const response = await request({
        method: "PUT",
        url: calendarEventsUrl(calendarId, eventId),
        params: { sendUpdates: "none" },
        data: event,
      });
      return response.data;
    },

    async deleteEvent(calendarId, eventId) {
      await request({
        method: "DELETE",
        url: calendarEventsUrl(calendarId, eventId),
        params: { sendUpdates: "none" },
      });
    },
  };
}

module.exports = {
  CALENDAR_DELEGATED_USER,
  CALENDAR_EVENTS_SCOPE,
  CLOUD_PLATFORM_SCOPE,
  IAM_CREDENTIALS_ROOT,
  JWT_GRANT_TYPE,
  METADATA_SERVICE_ACCOUNT_EMAIL_URL,
  OAUTH_TOKEN_URL,
  assertCalendarWriteAccess,
  calendarEventsUrl,
  createCalendarAccessTokenProvider,
  createGoogleCalendarClient,
  createKeylessCalendarAuth,
};
