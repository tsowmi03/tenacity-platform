import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { getFirestore } from "firebase-admin/firestore";

export const onAnnouncementCreated = onDocumentCreated(
    "announcements/{announcementId}",
    async (event) => {
        const announcement = event.data?.data();
        if (!announcement) {
            console.error("Announcement data is undefined");
            return;
        }
        const db = getFirestore();
        const messaging = getMessaging();

        try {
            const tokens: string[] = [];
            console.log("Announcement audience:", announcement.audience);

            if (announcement.audience === "all") {
                const usersSnapshot = await db.collection("userTokens").get();
                console.log(`Found ${usersSnapshot.docs.length} users in "userTokens" collection.`);
                for (const userDoc of usersSnapshot.docs) {
                    console.log(`Checking tokens for user document: ${userDoc.id}`);
                    const tokensSnapshot = await userDoc.ref.collection("tokens").get();
                    console.log(`User ${userDoc.id} has ${tokensSnapshot.size} token(s).`);
                    tokensSnapshot.forEach((tokenDoc) => {
                        const token = tokenDoc.data().token;
                        console.log(`Found token: ${token} for user ${userDoc.id}`);
                        tokens.push(token);
                    });
                }
            } else {
                const usersQuerySnapshot = await db
                    .collection("users")
                    .where("role", "==", announcement.audience)
                    .get();
                console.log(`Found ${usersQuerySnapshot.docs.length} user(s) in "users" collection for role ${announcement.audience}.`);

                if (usersQuerySnapshot.empty) {
                    console.log("No users found for audience:", announcement.audience);
                    return;
                }

                for (const userDoc of usersQuerySnapshot.docs) {
                    const uid = userDoc.id;
                    const userTokensDocRef = db.collection("userTokens").doc(uid);
                    const userTokensSnap = await userTokensDocRef.get();
                    
                    if (!userTokensSnap.exists) {
                        console.log(`No token document found for user ${uid} in "userTokens".`);
                        continue;
                    }
                    
                    const tokensSnapshot = await userTokensDocRef.collection("tokens").get();
                    console.log(`User ${uid} has ${tokensSnapshot.size} token(s) in "tokens" collection.`);
                    tokensSnapshot.forEach((tokenDoc) => {
                        const token = tokenDoc.data().token;
                        console.log(`Found token: ${token} for user ${uid}`);
                        tokens.push(token);
                    });
                }
            }

            console.log(`Total tokens collected: ${tokens.length}`);
            if (tokens.length === 0) {
                console.log("No tokens to send to");
                return;
            }

            const message = {
                notification: {
                    title: "New Announcement",
                    body: announcement.title || "A new announcement has been posted",
                },
                data: {
                    type: "announcement",
                    announcementId: event.params.announcementId,
                },
                tokens: tokens,
            };

            const response = await messaging.sendEachForMulticast(message);
            console.log(`Successfully sent messages: ${response.successCount}`);
            console.log(`Failed messages: ${response.failureCount}`);

            if (response.failureCount > 0) {
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        console.log("Failed to send to token:", tokens[idx]);
                        console.log("Error:", resp.error);
                    }
                });
            }
        } catch (error) {
            console.error("Error sending notifications:", error);
        }
    }
);