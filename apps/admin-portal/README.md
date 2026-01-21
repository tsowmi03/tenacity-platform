# Tenacity Web Admin Portal

Internal web-based administration portal for Tenacity Tutoring. This portal provides staff-only functionality for managing enrolments and other operational workflows. It is built with **React + Vite** and deployed to **Firebase Hosting**.

---

## Tech Stack

- React
- Vite
- Firebase Authentication
- Firebase Hosting
- Cloud Functions (via REST calls with ID token)
- Node (for local tooling)

---

## Project Structure

```
tenacity-web-portal/
  ├── src/
  │   ├── components/
  │   ├── pages/
  │   ├── services/
  │   ├── hooks/
  │   ├── utils/
  │   └── main.jsx
  ├── public/
  │   └── favicon.svg
  ├── .env
  ├── .gitignore
  ├── firebase.json
  ├── .firebaserc
  ├── index.html
  ├── package.json
  ├── vite.config.js
  └── README.md
```

---

## Environment Variables

Firebase configuration and environment-specific values are injected via Vite's environment system.

Create a `.env` file in the project root:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Do not commit `.env` files.

To use them in code:

```js
import.meta.env.VITE_FIREBASE_API_KEY
```

---

## Authentication & Access Control

- Authentication is performed using Firebase Auth.
- Access is restricted to **staff only**.
- Authorization is enforced using Firebase custom claims and server-side checks in Cloud Functions.
- Users must have the `role: "staff"` claim to access the portal.

Front-end access control is enforced through:

1. Auth state listener
2. Role interrogation
3. Protected routes

Cloud Functions validate the ID token using:

- Firebase Admin SDK
- `auth.verifyIdToken`
- claim inspection

---

## Cloud Function Calls

The portal communicates with Cloud Functions using authenticated HTTP requests:

```
GET / POST / PUT / DELETE → Authorization: Bearer <Firebase ID Token>
```

Example fetch pattern:

```js
const token = await auth.currentUser.getIdToken();
await fetch(FUNCTION_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  },
  body: JSON.stringify(payload)
});
```

---

## Local Development

Requires Node 18+.

Install dependencies:

```
npm install
```

Start dev server:

```
npm run dev
```

This launches the Vite React development environment with HMR.

---

## Firebase Hosting Deployment

This project uses Firebase Hosting for deployment.

Initial setup (only once):

```
firebase login
firebase use <project-id>
```

Deploy:

```
npm run build
firebase deploy --only hosting:tenacity-portal
```

---

## Production Build

```
npm run build
```

Output artifacts are written to `dist/` and served by Firebase Hosting.

---

## Git Practices

This repository excludes:

- `node_modules/`
- `dist/`
- `.env`
- Firebase debug artifacts

Please refer to `.gitignore` for full specification.

---

## Future Enhancements

Planned additions include:

- Staff role management (claims-based)
- Tutor & parent dashboards (optional future)
- Attendance and class data
- Invoicing & reporting interfaces
- Communication workflows (SMS/email)
- Analytics and usage insights

---

## License

Private, proprietary software. All rights reserved.
