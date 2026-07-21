"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishEvent = void 0;
const https_1 = require("firebase-functions/v2/https");
const pubsub_1 = require("@google-cloud/pubsub");
const pubsub = new pubsub_1.PubSub();
const TOPIC_NAME = 'user-actions';
exports.publishEvent = (0, https_1.onCall)({
    region: 'us-central1',
    cors: true
}, async (request) => {
    var _a;
    const { eventType, data, metadata } = request.data;
    const userId = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!userId) {
        throw new Error('User must be authenticated to publish events');
    }
    if (!eventType || typeof eventType !== 'string') {
        throw new Error('eventType is required and must be a string');
    }
    console.log(`Publishing event: ${eventType} from user: ${userId}`);
    const eventPayload = {
        eventType,
        data: Object.assign(Object.assign({}, data), { userId }),
        metadata: metadata || {},
        timestamp: new Date().toISOString(),
        publishedBy: userId,
    };
    try {
        const messageBuffer = Buffer.from(JSON.stringify(eventPayload));
        await pubsub.topic(TOPIC_NAME).publish(messageBuffer);
        console.log(`Event published successfully: ${eventType}`);
        return { success: true };
    }
    catch (error) {
        console.error(`Failed to publish event ${eventType}:`, error);
        throw new Error(`Failed to publish event: ${error}`);
    }
});
//# sourceMappingURL=event_publisher.js.map