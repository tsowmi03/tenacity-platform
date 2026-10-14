import { randomUUID } from "crypto";
import { PostHog } from "posthog-node";
import {
  POSTHOG_KEY,
  POSTHOG_SERVER_HOST,
  type AnalyticsEvent,
  type AnalyticsEvents,
} from "@lib/analytics";

/**
 * Server-side capture for events the browser can't be trusted to send (a
 * completed registration is the conversion of record, and ad blockers or a
 * closed tab must not lose it) or can't see (the `/r/<code>` redirect).
 *
 * Never throws: analytics must not fail a registration.
 */

const cookieDistinctId = (cookies: Partial<Record<string, string>>) => {
  if (!POSTHOG_KEY) return undefined;
  const raw = cookies[`ph_${POSTHOG_KEY}_posthog`];
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as { distinct_id?: unknown };
    return typeof parsed.distinct_id === "string" ? parsed.distinct_id : undefined;
  } catch {
    return undefined;
  }
};

const cleanDistinctId = (value: unknown) =>
  typeof value === "string" && value.length > 0 && value.length <= 200
    ? value
    : undefined;

export const captureServerEvent = async <E extends AnalyticsEvent>(
  event: E,
  properties: AnalyticsEvents[E],
  identity: {
    distinctId?: unknown;
    cookies?: Partial<Record<string, string>>;
  } = {}
) => {
  if (!POSTHOG_KEY) return;

  const distinctId =
    cleanDistinctId(identity.distinctId) ??
    cookieDistinctId(identity.cookies ?? {}) ??
    randomUUID();

  if (process.env.NEXT_PUBLIC_POSTHOG_DRY_RUN === "1") {
    console.info("[analytics:server]", event, { distinctId, ...properties });
    return;
  }

  let client: PostHog | null = null;
  try {
    client = new PostHog(POSTHOG_KEY, {
      host: POSTHOG_SERVER_HOST,
      flushAt: 1,
      flushInterval: 0,
      // This runs inside the registration API and the referral redirect: a
      // slow PostHog must not hold up a family.
      requestTimeout: 2000,
      fetchRetryCount: 0,
    });
    await client.captureImmediate({
      distinctId,
      event,
      properties: {
        ...properties,
        // Matches the browser: anonymous events, no person profiles.
        $process_person_profile: false,
        source: "server",
      },
    });
  } catch (error) {
    console.error(`PostHog capture failed for ${event}:`, error);
  } finally {
    await client?.shutdown().catch(() => undefined);
  }
};
