import { onCall } from "firebase-functions/v2/https";
import { PubSub } from "@google-cloud/pubsub";

const pubsub = new PubSub();
const TOPIC_NAME = 'user-actions';

export const publishEvent = onCall(async (request) => {
  const { eventType, data, metadata } = request.data;
  const userId = request.auth?.uid;

  if (!userId) {
    throw new Error('User must be authenticated to publish events');
  }

  console.log(`Publishing event: ${eventType} from user: ${userId}`);

  const eventPayload = {
    eventType,
    data: {
      ...data,
      userId, // Always include the authenticated user
    },
    metadata: metadata || {},
    timestamp: new Date().toISOString(),
    publishedBy: userId,
  };

  try {
    // Publish to Pub/Sub topic
    const messageBuffer = Buffer.from(JSON.stringify(eventPayload));
    await pubsub.topic(TOPIC_NAME).publish(messageBuffer);
    
    console.log(`Event published successfully: ${eventType}`);
    return { success: true };
  } catch (error) {
    console.error(`Failed to publish event ${eventType}:`, error);
    throw new Error(`Failed to publish event: ${error}`);
  }
});