import { onMessagePublished } from "firebase-functions/v2/pubsub";

export const handleUserActions = onMessagePublished(
  { topic: 'user-actions' },
  async (event) => {
    const messageData = event.data.message.data;
    const eventPayload = JSON.parse(Buffer.from(messageData, 'base64').toString());
    
    const { eventType, data, publishedBy } = eventPayload;
    
    console.log(`Processing event: ${eventType} from user: ${publishedBy}`);
    console.log(`Event data:`, data);

    try {
      switch (eventType) {
        case 'student.enrolled':
          await handleStudentEnrolled(data);
          break;
        case 'student.unenrolled':
          await handleStudentUnenrolled(data);
          break;
        default:
          console.log(`Unhandled event type: ${eventType}`);
      }
    } catch (error) {
      console.error(`Error handling event ${eventType}:`, error);
    }
  }
);

async function handleStudentEnrolled(data: any) {
  const { enrollmentType, classId, studentId, userId, attendanceDocId } = data;
  
  console.log(`Student ${studentId} enrolled ${enrollmentType} in class ${classId}`);
  
  if (enrollmentType === 'permanent') {
    await sendPermanentEnrollmentNotification(classId, studentId, userId);
  } else if (enrollmentType === 'oneoff') {
    await sendOneOffBookingNotification(classId, studentId, userId, attendanceDocId);
  }
}

async function handleStudentUnenrolled(data: any) {
  const { enrollmentType, classId, studentId, userId } = data;
  
  console.log(`Student ${studentId} unenrolled ${enrollmentType} from class ${classId}`);
  
  if (enrollmentType === 'permanent') {
    await sendPermanentUnenrollmentNotification(classId, studentId, userId);
  }
}

async function sendPermanentEnrollmentNotification(classId: string, studentId: string, userId: string) {
  // Implementation coming in Step 2
  console.log(`Sending permanent enrollment notification for student ${studentId} in class ${classId}`);
}

async function sendOneOffBookingNotification(classId: string, studentId: string, userId: string, attendanceDocId: string) {
  // Implementation coming in Step 2
  console.log(`Sending one-off booking notification for student ${studentId} in class ${classId}`);
}

async function sendPermanentUnenrollmentNotification(classId: string, studentId: string, userId: string) {
  // Implementation coming in Step 2
  console.log(`Sending permanent unenrollment notification for student ${studentId} from class ${classId}`);
}