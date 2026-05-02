import {
  countsTowardOpenOffers,
  countsTowardWaitlist,
} from "./waitlist_action";

export type WaitlistPromotionOutcome =
  | "promoted"
  | "already_enrolled"
  | "class_full"
  | "not_promotable";

export function canPromoteWaitlistStatus(status: unknown): boolean {
  return countsTowardWaitlist(status);
}

export function waitlistPromotionCounterDeltas(status: unknown): {
  waitlistCount: number;
  openOfferCount: number;
} {
  return {
    waitlistCount: countsTowardWaitlist(status) ? -1 : 0,
    openOfferCount: countsTowardOpenOffers(status) ? -1 : 0,
  };
}
