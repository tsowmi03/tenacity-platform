"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { DateTime } = require("luxon");

const {
  MANAGED_MARKER,
  SYDNEY_ZONE,
  buildCalendarEvent,
  eventMatches,
  eventSource,
  loadExportConfig,
  reconcileCalendar,
  sessionTimes,
  syncGoogleCalendarImpl,
  weekRangeFor,
} = require("../../src/calendar/syncGoogleCalendar");
const {
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
} = require("../../src/calendar/googleCalendarClient");

function timestamp(iso) {
  return { toDate: () => new Date(iso) };
}

function desiredEvent(overrides = {}) {
  return buildCalendarEvent({
    classId: overrides.classId || "class-1",
    attendanceId: overrides.attendanceId || "2026_T3_W2",
    classData: {
      type: "Maths 5–6",
      startTime: "16:00",
      endTime: "17:30",
      ...overrides.classData,
    },
    attendanceData: {
      date: timestamp("2026-07-27T06:00:00.000Z"),
      attendance: ["student-1", "student-2"],
      tutors: ["tutor-1"],
      cancelled: false,
      ...overrides.attendanceData,
    },
    tutorNames: overrides.tutorNames || ["Alex Tutor"],
  });
}

function existingEvent(id, desired, overrides = {}) {
  return {
    id,
    ...structuredClone(desired),
    ...overrides,
  };
}

function fakeCalendar(events = []) {
  const calls = {
    list: [],
    insert: [],
    update: [],
    delete: [],
  };
  return {
    calls,
    async listManagedEvents(calendarId, marker) {
      calls.list.push({ calendarId, marker });
      return structuredClone(events);
    },
    async insertEvent(calendarId, event) {
      calls.insert.push({ calendarId, event });
      return { id: `created-${calls.insert.length}`, ...event };
    },
    async updateEvent(calendarId, eventId, event) {
      calls.update.push({ calendarId, eventId, event });
      return { id: eventId, ...event };
    },
    async deleteEvent(calendarId, eventId) {
      calls.delete.push({ calendarId, eventId });
    },
  };
}

function fakeFirestore({ enabled = true, missingClass = false } = {}) {
  const reads = [];
  const classRef = {
    id: "class-1",
    path: "classes/class-1",
  };
  const attendanceParent = { parent: classRef };
  const attendanceDoc = {
    id: "2026_T3_W2",
    ref: { path: "classes/class-1/attendance/2026_T3_W2", parent: attendanceParent },
    data: () => ({
      date: timestamp("2026-07-27T06:00:00.000Z"),
      attendance: ["student-1", "student-2"],
      tutors: ["tutor-1"],
      cancelled: false,
    }),
  };
  const docsByPath = new Map([
    [
      "classes/class-1",
      {
        id: "class-1",
        exists: !missingClass,
        data: () => ({
          type: "Maths 5–6",
          startTime: "16:00",
          endTime: "17:30",
        }),
      },
    ],
    [
      "users/tutor-1",
      {
        id: "tutor-1",
        exists: true,
        data: () => ({ firstName: "Alex", lastName: "Tutor" }),
      },
    ],
  ]);

  const db = {
    reads,
    collection(name) {
      return {
        doc(id) {
          const path = `${name}/${id}`;
          return {
            id,
            path,
            async get() {
              reads.push(path);
              if (path === "integrations/googleCalendarExport") {
                return {
                  exists: true,
                  data: () => ({
                    enabled,
                    calendarId: "calendar-id",
                  }),
                };
              }
              return docsByPath.get(path);
            },
          };
        },
      };
    },
    collectionGroup(name) {
      assert.equal(name, "attendance");
      const filters = [];
      return {
        where(field, operator, value) {
          filters.push({ field, operator, value });
          return this;
        },
        async get() {
          reads.push(`collectionGroup:${name}`);
          assert.deepEqual(
            filters.map(({ field, operator }) => [field, operator]),
            [
              ["date", ">="],
              ["date", "<"],
            ]
          );
          return { docs: [attendanceDoc] };
        },
      };
    },
    async getAll(...refs) {
      reads.push(...refs.map((ref) => ref.path));
      return refs.map((ref) => docsByPath.get(ref.path));
    },
  };
  return db;
}

const quietLog = {
  info() {},
  warn() {},
  error() {},
};

describe("Google Calendar export dates and event mapping", () => {
  it("uses the Sydney Monday-to-Monday week across daylight saving", () => {
    const range = weekRangeFor(new Date("2026-10-01T01:00:00.000Z"));
    assert.equal(range.startSydney.toISO(), "2026-09-28T00:00:00.000+10:00");
    assert.equal(range.endSydney.toISO(), "2026-10-05T00:00:00.000+11:00");
    assert.equal(range.start.toISOString(), "2026-09-27T14:00:00.000Z");
    assert.equal(range.end.toISOString(), "2026-10-04T13:00:00.000Z");
  });

  it("builds session times from the attendance date and class times", () => {
    const times = sessionTimes(new Date("2026-07-27T06:00:00.000Z"), {
      startTime: "16:00",
      endTime: "17:30",
    });
    assert.equal(times.start.toISO(), "2026-07-27T16:00:00.000+10:00");
    assert.equal(times.end.toISO(), "2026-07-27T17:30:00.000+10:00");
  });

  it("keeps cancelled sessions visible and marks them as free", () => {
    const event = desiredEvent({
      attendanceData: { cancelled: true },
    });
    assert.equal(event.summary, "Cancelled: Maths 5–6");
    assert.equal(event.transparency, "transparent");
    assert.match(event.description, /Tutor: Alex Tutor/);
    assert.match(event.description, /Students scheduled: 2/);
    assert.equal(
      event.extendedProperties.private.tenacityManaged,
      MANAGED_MARKER.value
    );
    assert.equal(
      eventSource(event),
      "classes/class-1/attendance/2026_T3_W2"
    );
  });

  it("supports an overnight class end time defensively", () => {
    const times = sessionTimes(new Date("2026-07-27T06:00:00.000Z"), {
      startTime: "23:30",
      endTime: "00:30",
    });
    assert.equal(times.end.diff(times.start, "minutes").minutes, 60);
  });

  it("compares instants rather than Calendar's offset formatting", () => {
    const desired = desiredEvent();
    const existing = existingEvent("event-1", desired, {
      start: {
        dateTime: "2026-07-27T06:00:00Z",
        timeZone: SYDNEY_ZONE,
      },
      end: {
        dateTime: "2026-07-27T07:30:00Z",
        timeZone: SYDNEY_ZONE,
      },
    });
    assert.equal(eventMatches(existing, desired), true);
    existing.summary = "Edited in Calendar";
    assert.equal(eventMatches(existing, desired), false);
  });

  it("uses the event-only scope and safely encodes Calendar API paths", () => {
    assert.equal(
      CALENDAR_EVENTS_SCOPE,
      "https://www.googleapis.com/auth/calendar.events"
    );
    assert.equal(CALENDAR_DELEGATED_USER, "admin@tenacitytutoring.com");
    assert.equal(
      CLOUD_PLATFORM_SCOPE,
      "https://www.googleapis.com/auth/cloud-platform"
    );
    assert.equal(
      calendarEventsUrl("team calendar@example.com", "event/1"),
      "https://www.googleapis.com/calendar/v3/calendars/" +
        "team%20calendar%40example.com/events/event%2F1"
    );
  });
});

describe("Google Calendar API adapter", () => {
  it("mints and caches a keyless Calendar-scoped OAuth token", async () => {
    const signedRequests = [];
    const fetchRequests = [];
    let currentTime = Date.UTC(2026, 6, 28, 6, 0, 0);
    const cloudAuth = {
      async getClient() {
        return {
          async request(options) {
            signedRequests.push(options);
            return { data: { signedJwt: "signed-jwt" } };
          },
        };
      },
    };
    const fetchImpl = async (url, options = {}) => {
      fetchRequests.push({ url, options });
      return {
        ok: true,
        async json() {
          return { access_token: "calendar-token", expires_in: 3600 };
        },
      };
    };
    const provider = createCalendarAccessTokenProvider({
      cloudAuth,
      fetchImpl,
      now: () => currentTime,
      serviceAccountEmailProvider: async () =>
        "runtime@project.iam.gserviceaccount.com",
    });

    assert.equal(await provider.getAccessToken(), "calendar-token");
    currentTime += 30 * 60 * 1000;
    assert.equal(await provider.getAccessToken(), "calendar-token");

    assert.equal(signedRequests.length, 1);
    assert.equal(
      signedRequests[0].url,
      `${IAM_CREDENTIALS_ROOT}/` +
        "runtime%40project.iam.gserviceaccount.com:signJwt"
    );
    assert.equal(signedRequests[0].method, "POST");
    assert.deepEqual(JSON.parse(signedRequests[0].data.payload), {
      iss: "runtime@project.iam.gserviceaccount.com",
      sub: CALENDAR_DELEGATED_USER,
      scope: CALENDAR_EVENTS_SCOPE,
      aud: OAUTH_TOKEN_URL,
      iat: 1785218400,
      exp: 1785222000,
    });
    assert.equal(fetchRequests.length, 1);
    assert.equal(fetchRequests[0].url, OAUTH_TOKEN_URL);
    assert.equal(
      fetchRequests[0].options.body.get("grant_type"),
      JWT_GRANT_TYPE
    );
    assert.equal(
      fetchRequests[0].options.body.get("assertion"),
      "signed-jwt"
    );
    assert.equal(fetchRequests[0].options.redirect, "error");
  });

  it("refreshes a Calendar OAuth token before it expires", async () => {
    let currentTime = Date.UTC(2026, 6, 28, 6, 0, 0);
    let signCount = 0;
    const provider = createCalendarAccessTokenProvider({
      cloudAuth: {
        async getClient() {
          return {
            async request() {
              signCount += 1;
              return { data: { signedJwt: `signed-${signCount}` } };
            },
          };
        },
      },
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return { access_token: `token-${signCount}`, expires_in: 120 };
        },
      }),
      now: () => currentTime,
      serviceAccountEmailProvider: async () =>
        "runtime@project.iam.gserviceaccount.com",
    });

    assert.equal(await provider.getAccessToken(), "token-1");
    currentTime += 61_000;
    assert.equal(await provider.getAccessToken(), "token-2");
    assert.equal(signCount, 2);
  });

  it("loads the attached runtime identity from metadata by default", async () => {
    const fetchRequests = [];
    const provider = createCalendarAccessTokenProvider({
      cloudAuth: {
        async getClient() {
          return {
            async request() {
              return { data: { signedJwt: "signed-jwt" } };
            },
          };
        },
      },
      fetchImpl: async (url, options = {}) => {
        fetchRequests.push({ url, options });
        if (url === METADATA_SERVICE_ACCOUNT_EMAIL_URL) {
          return {
            ok: true,
            async text() {
              return "runtime@project.iam.gserviceaccount.com\n";
            },
          };
        }
        return {
          ok: true,
          async json() {
            return { access_token: "calendar-token", expires_in: 3600 };
          },
        };
      },
    });

    assert.equal(await provider.getAccessToken(), "calendar-token");
    assert.equal(fetchRequests[0].url, METADATA_SERVICE_ACCOUNT_EMAIL_URL);
    assert.deepEqual(fetchRequests[0].options.headers, {
      "Metadata-Flavor": "Google",
    });
    assert.equal(fetchRequests[0].options.redirect, "error");
  });

  it("surfaces OAuth exchange failures without returning a token", async () => {
    const provider = createCalendarAccessTokenProvider({
      cloudAuth: {
        async getClient() {
          return {
            async request() {
              return { data: { signedJwt: "signed-jwt" } };
            },
          };
        },
      },
      fetchImpl: async () => ({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        async json() {
          return { error_description: "invalid grant" };
        },
      }),
      serviceAccountEmailProvider: async () =>
        "runtime@project.iam.gserviceaccount.com",
    });

    await assert.rejects(
      provider.getAccessToken(),
      /Calendar OAuth token exchange failed: invalid grant/
    );
  });

  it("pins delegation to the Tenacity Calendar authority", async () => {
    const provider = createCalendarAccessTokenProvider({
      delegatedUser: "another-user@tenacitytutoring.com",
      serviceAccountEmailProvider: async () =>
        "runtime@project.iam.gserviceaccount.com",
    });

    await assert.rejects(
      provider.getAccessToken(),
      /Calendar delegated user must be admin@tenacitytutoring.com/
    );
  });

  it(
    "fails closed when Calendar does not report effective writer access",
    () => {
      assert.doesNotThrow(() => assertCalendarWriteAccess("writer"));
      assert.doesNotThrow(() => assertCalendarWriteAccess("owner"));
      assert.throws(
        () => assertCalendarWriteAccess("reader"),
        /effective role is reader/
      );
      assert.throws(
        () => assertCalendarWriteAccess(),
        /effective role is unknown/
      );
    }
  );

  it("paginates owned events and sends mutation requests without guest updates", async () => {
    const requests = [];
    const auth = {
      async getClient() {
        return {
          async request(options) {
            requests.push(options);
            if (options.method === "GET" && !options.params.pageToken) {
              return {
                data: {
                  accessRole: "owner",
                  items: [{ id: "event-1" }],
                  nextPageToken: "next-page",
                },
              };
            }
            if (options.method === "GET") {
              return {
                data: {
                  accessRole: "owner",
                  items: [{ id: "event-2" }],
                },
              };
            }
            return { data: { id: "event-result" } };
          },
        };
      },
    };
    const client = createGoogleCalendarClient({ auth });

    const listed = await client.listManagedEvents("calendar-id", MANAGED_MARKER);
    await client.insertEvent("calendar-id", { summary: "Created" });
    await client.updateEvent("calendar-id", "event-1", {
      summary: "Updated",
    });
    await client.deleteEvent("calendar-id", "event-2");

    assert.deepEqual(
      listed.map((event) => event.id),
      ["event-1", "event-2"]
    );
    assert.equal(
      requests[0].params.privateExtendedProperty,
      "tenacityManaged=firestore-week-v1"
    );
    assert.equal(requests[1].params.pageToken, "next-page");
    assert.deepEqual(
      requests.slice(2).map((request) => [
        request.method,
        request.params.sendUpdates,
      ]),
      [
        ["POST", "none"],
        ["PUT", "none"],
        ["DELETE", "none"],
      ]
    );
  });

  it("does not mutate when the target calendar is read-only", async () => {
    const requests = [];
    const client = createGoogleCalendarClient({
      auth: {
        async getClient() {
          return {
            async request(options) {
              requests.push(options);
              return {
                data: {
                  accessRole: "reader",
                  items: [],
                },
              };
            },
          };
        },
      },
    });

    await assert.rejects(
      client.listManagedEvents("calendar-id", MANAGED_MARKER),
      /effective role is reader/
    );
    assert.deepEqual(
      requests.map((request) => request.method),
      ["GET"]
    );
  });
});

describe("Google Calendar reconciliation", () => {
  it("creates a missing event", async () => {
    const wanted = desiredEvent();
    const desired = new Map([[eventSource(wanted), wanted]]);
    const calendar = fakeCalendar();
    const result = await reconcileCalendar({
      calendar,
      calendarId: "calendar-id",
      desired,
      log: quietLog,
    });
    assert.deepEqual(result, {
      desired: 1,
      created: 1,
      updated: 0,
      unchanged: 0,
      deleted: 0,
      errors: 0,
    });
    assert.equal(calendar.calls.insert.length, 1);
  });

  it("leaves an exact event unchanged", async () => {
    const wanted = desiredEvent();
    const desired = new Map([[eventSource(wanted), wanted]]);
    const calendar = fakeCalendar([existingEvent("event-1", wanted)]);
    const result = await reconcileCalendar({
      calendar,
      calendarId: "calendar-id",
      desired,
      log: quietLog,
    });
    assert.equal(result.unchanged, 1);
    assert.equal(calendar.calls.update.length, 0);
  });

  it("repairs a Calendar edit from the Firestore projection", async () => {
    const wanted = desiredEvent();
    const edited = existingEvent("event-1", wanted, {
      summary: "Manually edited",
    });
    const desired = new Map([[eventSource(wanted), wanted]]);
    const calendar = fakeCalendar([edited]);
    const result = await reconcileCalendar({
      calendar,
      calendarId: "calendar-id",
      desired,
      log: quietLog,
    });
    assert.equal(result.updated, 1);
    assert.equal(calendar.calls.update[0].event.summary, "Maths 5–6");
  });

  it("removes stale, duplicate, and malformed managed events only", async () => {
    const wanted = desiredEvent();
    const stale = desiredEvent({ classId: "class-old" });
    const malformed = existingEvent("malformed", wanted);
    delete malformed.extendedProperties.private.tenacitySource;
    const calendar = fakeCalendar([
      existingEvent("event-1", wanted),
      existingEvent("event-duplicate", wanted),
      existingEvent("event-stale", stale),
      malformed,
    ]);
    const desired = new Map([[eventSource(wanted), wanted]]);
    const result = await reconcileCalendar({
      calendar,
      calendarId: "calendar-id",
      desired,
      log: quietLog,
    });
    assert.equal(result.unchanged, 1);
    assert.equal(result.deleted, 3);
    assert.deepEqual(
      calendar.calls.delete.map((call) => call.eventId).sort(),
      ["event-duplicate", "event-stale", "malformed"]
    );
  });

  it("keeps an exact duplicate instead of rewriting an edited copy", async () => {
    const wanted = desiredEvent();
    const calendar = fakeCalendar([
      existingEvent("event-edited", wanted, { summary: "Edited" }),
      existingEvent("event-exact", wanted),
    ]);
    const result = await reconcileCalendar({
      calendar,
      calendarId: "calendar-id",
      desired: new Map([[eventSource(wanted), wanted]]),
      log: quietLog,
    });
    assert.equal(result.unchanged, 1);
    assert.equal(result.updated, 0);
    assert.deepEqual(calendar.calls.delete, [
      { calendarId: "calendar-id", eventId: "event-edited" },
    ]);
  });

  it("recreates an event deleted between list and update", async () => {
    const wanted = desiredEvent();
    const edited = existingEvent("event-1", wanted, {
      summary: "Edited",
    });
    const calendar = fakeCalendar([edited]);
    calendar.updateEvent = async () => {
      const error = new Error("Gone");
      error.response = { status: 410 };
      throw error;
    };
    const result = await reconcileCalendar({
      calendar,
      calendarId: "calendar-id",
      desired: new Map([[eventSource(wanted), wanted]]),
      log: quietLog,
    });
    assert.equal(result.created, 1);
    assert.equal(result.errors, 0);
  });

  it("never touches events that lack the Tenacity managed marker", async () => {
    const calendar = fakeCalendar([]);
    const result = await reconcileCalendar({
      calendar,
      calendarId: "calendar-id",
      desired: new Map(),
      log: quietLog,
    });
    assert.equal(result.deleted, 0);
    assert.deepEqual(calendar.calls.list[0].marker, MANAGED_MARKER);
  });
});

describe("one-way sync boundary", () => {
  it("does not call Calendar while the Firestore config is disabled", async () => {
    const db = fakeFirestore({ enabled: false });
    const calendar = fakeCalendar();
    const config = await loadExportConfig(db);
    assert.deepEqual(config, { enabled: false, reason: "disabled" });

    const result = await syncGoogleCalendarImpl({
      db,
      calendar,
      clock: () => new Date("2026-07-28T00:00:00.000Z"),
      log: quietLog,
    });
    assert.deepEqual(result, { skipped: true, reason: "disabled" });
    assert.equal(calendar.calls.list.length, 0);
  });

  it("reads Firestore and writes only to Calendar", async () => {
    const db = fakeFirestore();
    const calendar = fakeCalendar();
    const result = await syncGoogleCalendarImpl({
      db,
      calendar,
      clock: () => new Date("2026-07-28T00:00:00.000Z"),
      log: quietLog,
    });

    assert.equal(result.created, 1);
    assert.equal(calendar.calls.insert.length, 1);
    assert.deepEqual(db.reads, [
      "integrations/googleCalendarExport",
      "collectionGroup:attendance",
      "classes/class-1",
      "users/tutor-1",
    ]);
    assert.equal(typeof db.set, "undefined");
    assert.equal(typeof db.batch, "undefined");
  });

  it("stops before Calendar mutation when a Firestore session is invalid", async () => {
    const db = fakeFirestore({ missingClass: true });
    const calendar = fakeCalendar();
    await assert.rejects(
      () =>
        syncGoogleCalendarImpl({
          db,
          calendar,
          clock: () => new Date("2026-07-28T00:00:00.000Z"),
          log: quietLog,
        }),
      /stopped before mutation/
    );
    assert.equal(calendar.calls.list.length, 0);
    assert.equal(calendar.calls.insert.length, 0);
    assert.equal(calendar.calls.update.length, 0);
    assert.equal(calendar.calls.delete.length, 0);
  });
});

describe("test fixture sanity", () => {
  it("uses a date that is in Sydney winter", () => {
    const date = DateTime.fromISO("2026-07-27T16:00:00", {
      zone: SYDNEY_ZONE,
    });
    assert.equal(date.offset, 600);
  });
});
