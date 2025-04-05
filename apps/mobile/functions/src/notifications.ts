import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { getFirestore } from "firebase-admin/firestore";

export const onAnnouncementCreated = onDocumentCreated(
    "announcements/{announcementId}",
    async (event) => {
      const announcement = event.data?.data();
      const db = getFirestore();
      const messaging = getMessaging();
  
      try {
        // Get all user tokens
        const usersSnapshot = await db.collection("userTokens").get();
        const tokens: string[] = [];
        
        for (const userDoc of usersSnapshot.docs) {
          const tokensSnapshot = await userDoc.ref.collection("tokens").get();
          tokensSnapshot.forEach((tokenDoc) => {
            tokens.push(tokenDoc.data().token);
          });
        }
  
        if (tokens.length === 0) {
          console.log("No tokens to send to");
          return;
        }
  
        const message = {
          notification: {
            title: "New Announcement",
            body: announcement?.title || "A new announcement has been posted",
          },
          data: {
            type: "announcement",
            announcementId: event.params.announcementId,
          },
          tokens: tokens,
        };
  
        const response = await messaging.sendEachForMulticast(message);
        console.log(tokens);
        console.log(`Successfully sent messages: ${response.successCount}`);
        console.log(`Failed messages: ${response.failureCount}`);
        
        // Log the failures
        if (response.failureCount > 0) {
          const failedTokens: string[] = [];
          response.responses.forEach((resp, idx) => {
            if (!resp.success) {
              failedTokens.push(tokens[idx]);
              console.log('Failed to send to token:', tokens[idx]);
              console.log('Error:', resp.error);
            }
          });
        } // Added missing closing brace here
        
      } catch (error) {
        console.error("Error sending notifications:", error);
      }
    }
  );  // Added missing semicolon