# Environment Variables

Firebase configuration for the Tenacity Tutoring app.

## Quick Setup

Create `.env.local` in your project root with these 6 variables:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
SENDGRID_API_KEY=your_sendgrid_api_key_here
SENDER_EMAIL=your_sender_email_here
RECIEVER_EMAIL=your_recipient_email_here
```

## Get Your Firebase Config

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create or select your project
3. Click the web icon (`</>`) to add a web app
4. Copy the config values and paste them into `.env.local`

## Why NEXT*PUBLIC*?

These variables need the `NEXT_PUBLIC_` prefix because Firebase runs in the browser. This tells Next.js to make them available to client-side code.

## Common Issues

**App won't start?**

- Check all 6 variables are in `.env.local`
- Make sure there are no typos
- Verify your Firebase project is active

**Firebase errors?**

- Confirm `NEXT_PUBLIC_FIREBASE_PROJECT_ID` matches your Firebase project exactly
- Enable Firestore in your Firebase console

## For Deployment

When deploying to Vercel:

1. Go to Project Settings → Environment Variables
2. Add the same 6 variables with your values
3. Deploy

See [Vercel Deployment Guide](./vercel-deployment.md) for details.
