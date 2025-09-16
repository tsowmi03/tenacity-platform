import { onMessagePublished } from "firebase-functions/v2/pubsub";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging, MulticastMessage } from "firebase-admin/messaging";

function to12Hour(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return time24;
  const hour = ((h + 11) % 12) + 1;
  const ampm = h >= 12 ? "pm" : "am";
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

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
  } else if (enrollmentType === 'oneoff') {
    await sendOneOffUnenrollmentNotification(classId, studentId, userId);
  }
}

// Helper function to get admin tokens
async function getAdminTokens(): Promise<string[]> {
  const db = getFirestore();
  const tokens: string[] = [];

  try {
    // Get all users with admin role
    const usersSnap = await db.collection("users").where("role", "==", "admin").get();
    
    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id;
      const tokensSnap = await db
        .collection("userTokens")
        .doc(userId)
        .collection("tokens")
        .get();
      
      tokensSnap.forEach(doc => {
        const token = doc.data().token as string;
        if (token) tokens.push(token);
      });
    }
  } catch (error) {
    console.error("Error fetching admin tokens:", error);
  }

  return tokens;
}

async function sendPermanentEnrollmentNotification(classId: string, studentId: string, userId: string) {
  console.log(`Sending permanent enrollment notification for student ${studentId} in class ${classId}`);
  
  const db = getFirestore();
  const messaging = getMessaging();

  try {
    // Get class info
    const classDoc = await db.collection("classes").doc(classId).get();
    if (!classDoc.exists) {
      console.error(`Class ${classId} not found`);
      return;
    }
    const classData = classDoc.data()!;
    const classDay = classData.day || "Unknown day";
    const classTime = classData.startTime ? to12Hour(classData.startTime) : "Unknown time";

    // Get student info
    const studentDoc = await db.collection("students").doc(studentId).get();
    if (!studentDoc.exists) {
      console.error(`Student ${studentId} not found`);
      return;
    }
    const studentData = studentDoc.data()!;
    const studentName = `${studentData.firstName || ""} ${studentData.lastName || ""}`.trim() || "Student";

    // Get admin tokens
    const tokens = await getAdminTokens();

    if (!tokens.length) {
      console.log(`No FCM tokens found for admins`);
      return;
    }

    // Send notification
    const message: MulticastMessage = {
      notification: {
        title: "Permanent Enrollment Confirmed",
        body: `${studentName} is now permanently enrolled for ${classDay} at ${classTime}.`,
      },
      data: {
        type: "permanent_enrollment",
        classId,
        studentId,
        enrollmentType: "permanent",
      },
      tokens,
    };

    const response = await messaging.sendEachForMulticast(message);
    console.log(
      `Permanent enrollment notification sent to admins: success=${response.successCount}, failure=${response.failureCount}`
    );

    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error("Failed token:", tokens[idx], resp.error);
        }
      });
    }
  } catch (error) {
    console.error(`Error sending permanent enrollment notification:`, error);
  }
}

async function sendOneOffBookingNotification(classId: string, studentId: string, userId: string, attendanceDocId: string) {
  console.log(`Sending one-off booking notification for student ${studentId} in class ${classId}`);
  
  const db = getFirestore();
  const messaging = getMessaging();

  try {
    // Get class info
    const classDoc = await db.collection("classes").doc(classId).get();
    if (!classDoc.exists) {
      console.error(`Class ${classId} not found`);
      return;
    }
    const classData = classDoc.data()!;
    const classDay = classData.day || "Unknown day";
    const classTime = classData.startTime ? to12Hour(classData.startTime) : "Unknown time";

    // Get attendance doc for the specific date
    const attendanceDoc = await db
      .collection("classes")
      .doc(classId)
      .collection("attendance")
      .doc(attendanceDocId)
      .get();
    
    let sessionDateStr = classDay;
    if (attendanceDoc.exists) {
      const attendanceData = attendanceDoc.data()!;
      const sessionDate = attendanceData.date?.toDate();
      if (sessionDate) {
        sessionDateStr = sessionDate.toLocaleDateString("en-AU", {
          weekday: "long",
          day: "numeric",
          month: "long",
          timeZone: "Australia/Sydney"
        });
      }
    }

    // Get student info
    const studentDoc = await db.collection("students").doc(studentId).get();
    if (!studentDoc.exists) {
      console.error(`Student ${studentId} not found`);
      return;
    }
    const studentData = studentDoc.data()!;
    const studentName = `${studentData.firstName || ""} ${studentData.lastName || ""}`.trim() || "Student";

    // Get admin tokens
    const tokens = await getAdminTokens();

    if (!tokens.length) {
      console.log(`No FCM tokens found for admins`);
      return;
    }

    // Send notification
    const message: MulticastMessage = {
      notification: {
        title: "Class Booking Confirmed",
        body: `${studentName} is booked for ${sessionDateStr} at ${classTime}.`,
      },
      data: {
        type: "oneoff_booking",
        classId,
        studentId,
        attendanceDocId,
        enrollmentType: "oneoff",
      },
      tokens,
    };

    const response = await messaging.sendEachForMulticast(message);
    console.log(
      `One-off booking notification sent to admins: success=${response.successCount}, failure=${response.failureCount}`
    );

    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error("Failed token:", tokens[idx], resp.error);
        }
      });
    }
  } catch (error) {
    console.error(`Error sending one-off booking notification:`, error);
  }
}

async function sendPermanentUnenrollmentNotification(classId: string, studentId: string, userId: string) {
  console.log(`Sending permanent unenrollment notification for student ${studentId} from class ${classId}`);
  
  const db = getFirestore();
  const messaging = getMessaging();

  try {
    // Get class info
    const classDoc = await db.collection("classes").doc(classId).get();
    if (!classDoc.exists) {
      console.error(`Class ${classId} not found`);
      return;
    }
    const classData = classDoc.data()!;
    const classDay = classData.day || "Unknown day";
    const classTime = classData.startTime ? to12Hour(classData.startTime) : "Unknown time";

    // Get student info
    const studentDoc = await db.collection("students").doc(studentId).get();
    if (!studentDoc.exists) {
      console.error(`Student ${studentId} not found`);
      return;
    }
    const studentData = studentDoc.data()!;
    const studentName = `${studentData.firstName || ""} ${studentData.lastName || ""}`.trim() || "Student";

    // Get admin tokens
    const tokens = await getAdminTokens();

    if (!tokens.length) {
      console.log(`No FCM tokens found for admins`);
      return;
    }

    // Send notification
    const message: MulticastMessage = {
      notification: {
        title: "Permanent Enrollment Cancelled",
        body: `${studentName} has been unenrolled from ${classDay} at ${classTime}.`,
      },
      data: {
        type: "permanent_unenrollment",
        classId,
        studentId,
        enrollmentType: "permanent",
      },
      tokens,
    };

    const response = await messaging.sendEachForMulticast(message);
    console.log(
      `Permanent unenrollment notification sent to admins: success=${response.successCount}, failure=${response.failureCount}`
    );

    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error("Failed token:", tokens[idx], resp.error);
        }
      });
    }
  } catch (error) {
    console.error(`Error sending permanent unenrollment notification:`, error);
  }
}

async function sendOneOffUnenrollmentNotification(classId: string, studentId: string, userId: string) {
  console.log(`Sending one-off unenrollment notification for student ${studentId} from class ${classId}`);
  
  const db = getFirestore();
  const messaging = getMessaging();

  try {
    // Get class info
    const classDoc = await db.collection("classes").doc(classId).get();
    if (!classDoc.exists) {
      console.error(`Class ${classId} not found`);
      return;
    }
    const classData = classDoc.data()!;
    const classDay = classData.day || "Unknown day";
    const classTime = classData.startTime ? to12Hour(classData.startTime) : "Unknown time";

    // Get student info
    const studentDoc = await db.collection("students").doc(studentId).get();
    if (!studentDoc.exists) {
      console.error(`Student ${studentId} not found`);
      return;
    }
    const studentData = studentDoc.data()!;
    const studentName = `${studentData.firstName || ""} ${studentData.lastName || ""}`.trim() || "Student";

    // Get admin tokens
    const tokens = await getAdminTokens();

    if (!tokens.length) {
      console.log(`No FCM tokens found for admins`);
      return;
    }

    // Send notification
    const message: MulticastMessage = {
      notification: {
        title: "Class Booking Cancelled",
        body: `${studentName}'s booking for ${classDay} at ${classTime} has been cancelled.`,
      },
      data: {
        type: "oneoff_cancellation",
        classId,
        studentId,
        enrollmentType: "oneoff",
      },
      tokens,
    };

    const response = await messaging.sendEachForMulticast(message);
    console.log(
      `One-off cancellation notification sent to admins: success=${response.successCount}, failure=${response.failureCount}`
    );

    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error("Failed token:", tokens[idx], resp.error);
        }
      });
    }
  } catch (error) {
    console.error(`Error sending one-off cancellation notification:`, error);
  }
}