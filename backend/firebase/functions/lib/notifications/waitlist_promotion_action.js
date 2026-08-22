"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.waitlistPromotionCounterDeltas = exports.canPromoteWaitlistStatus = void 0;
const waitlist_action_1 = require("./waitlist_action");
function canPromoteWaitlistStatus(status) {
    return (0, waitlist_action_1.countsTowardWaitlist)(status);
}
exports.canPromoteWaitlistStatus = canPromoteWaitlistStatus;
function waitlistPromotionCounterDeltas(status) {
    return {
        waitlistCount: (0, waitlist_action_1.countsTowardWaitlist)(status) ? -1 : 0,
        openOfferCount: (0, waitlist_action_1.countsTowardOpenOffers)(status) ? -1 : 0,
    };
}
exports.waitlistPromotionCounterDeltas = waitlistPromotionCounterDeltas;
