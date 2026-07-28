"use strict";

const { GoogleAuth } = require("google-auth-library");

const CALENDAR_API_ROOT = "https://www.googleapis.com/calendar/v3";
const CALENDAR_EVENTS_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";

function calendarEventsUrl(calendarId, eventId) {
  const calendar = encodeURIComponent(calendarId);
  const event = eventId ? `/${encodeURIComponent(eventId)}` : "";
  return `${CALENDAR_API_ROOT}/calendars/${calendar}/events${event}`;
}

/**
 * Small Calendar API adapter. Keeping the API behind this interface makes the
 * reconciliation logic testable without credentials or network access.
 *
 * Authentication uses Application Default Credentials. In production, the
 * target calendar must be shared with the Function's runtime service account.
 */
function createGoogleCalendarClient({ auth } = {}) {
  const googleAuth =
    auth ||
    new GoogleAuth({
      scopes: [CALENDAR_EVENTS_SCOPE],
    });
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
  CALENDAR_EVENTS_SCOPE,
  calendarEventsUrl,
  createGoogleCalendarClient,
};
