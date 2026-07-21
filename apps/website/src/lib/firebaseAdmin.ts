import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

type ServiceAccountJson = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

const serviceAccountFromEnv = () => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  const parsed = JSON.parse(raw) as ServiceAccountJson;
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is missing required fields.");
  }

  return {
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key.replace(/\\n/g, "\n"),
  };
};

export const getAdminDb = () => {
  if (!getApps().length) {
    const serviceAccount = serviceAccountFromEnv();

    initializeApp({
      credential: serviceAccount ? cert(serviceAccount) : applicationDefault(),
      projectId:
        serviceAccount?.projectId ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  }

  return getFirestore();
};
