# Deploy Tenacity Tutoring to Vercel

Simple guide to deploy the Tenacity Tutoring registration app to Vercel.

## Quick Setup

### 1. Prepare Your Code

```bash
# Make sure everything works locally
npm run build
git add .
git commit -m "Ready for deployment"
git push origin main
```

### 2. Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign up with GitHub
2. Click **"New Project"**
3. Import your `tenacitytutoring` repository
4. Vercel auto-detects Next.js settings ✅

### 3. Add Firebase Environment Variables

In Vercel project settings, add these 6 variables:

```
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_firebase_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

> Get these from your Firebase project settings → General → Your apps → Web app config

### 4. Deploy

Click **"Deploy"** and wait ~2 minutes for the build to complete.

## Test Your Live Site

### Registration Form Test

1. Visit your Vercel URL (e.g., `https://tenacitytutoring-abc123.vercel.app`)
2. Go to `/register`
3. Complete all 6 steps:
   - ✅ Year selection works
   - ✅ Subject selection works
   - ✅ Class slots load from Firebase
   - ✅ Student info form
   - ✅ Carer info form
   - ✅ Final submission saves to Firebase

### Verify Firebase Connection

1. Submit a test enrollment
2. Check your Firebase Console → Firestore → `enrolments` collection
3. Confirm the data was saved ✅

## Add Your Domain (Optional)

1. **Vercel Dashboard** → **Domains** → **Add Domain**
2. **Add DNS records** at your domain provider:
   ```
   Type: CNAME
   Name: @
   Value: cname.vercel-dns.com
   ```
3. **Wait 24 hours** for SSL certificate

## Automatic Updates

Every time you push to GitHub `main` branch:

- Vercel automatically rebuilds and deploys
- Your live site updates in ~2 minutes
- No manual deployment needed ✅

## Common Issues

### Build Fails

```bash
# Fix TypeScript errors locally first
npm run lint
npm run build
```

### Firebase Not Working

- Double-check all 6 environment variables are set correctly in Vercel
- Verify your Firebase project ID matches exactly
- Test the same variables work locally

### Registration Form Issues

- Check browser console for JavaScript errors
- Verify Lottie animations load (they're in `/public/animation/`)
- Test on mobile devices

## That's It! 🎉

Your Tenacity Tutoring site is now live with:

- ✅ 6-step registration form
- ✅ Firebase data saving
- ✅ Lottie animations
- ✅ Mobile responsive design
- ✅ Automatic HTTPS
- ✅ Global CDN for fast loading

**Next steps:** Test thoroughly, add your custom domain, and start enrolling students!
