import { onCall } from "firebase-functions/v2/https";
import { PubSub } from "@google-cloud/pubsub";

const pubsub = new PubSub();
const TOPIC_NAME = 'user-actions';

interface EventRequest {
  eventType: string;
  data?: Record<string, any>;
  metadata?: Record<string, any>;
}

export const publishEvent = onCall(
  {
    region: 'us-central1',
    cors: true
  },
  async (request) => {
  const { eventType, data, metadata }: EventRequest = request.data;
  const userId = request.auth?.uid;

  if (!userId) {
    throw new Error('User must be authenticated to publish events');
  }

  if (!eventType || typeof eventType !== 'string') {
    throw new Error('eventType is required and must be a string');
  }

  console.log(`Publishing event: ${eventType} from user: ${userId}`);

  const eventPayload = {
    eventType,
    data: {
      ...data,
      userId,
    },
    metadata: metadata || {},
    timestamp: new Date().toISOString(),
    publishedBy: userId,
  };

  try {
    const messageBuffer = Buffer.from(JSON.stringify(eventPayload));
    await pubsub.topic(TOPIC_NAME).publish(messageBuffer);
    
    console.log(`Event published successfully: ${eventType}`);
    return { success: true };
  } catch (error) {
    console.error(`Failed to publish event ${eventType}:`, error);
    throw new Error(`Failed to publish event: ${error}`);
  }
});