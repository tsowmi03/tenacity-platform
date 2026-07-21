# Firebase Setup

These notes apply only to an explicitly approved, isolated non-production
project. Do not create, reconfigure, seed, or deploy to the production project
from this website workspace during the migration.

Creating a provider project is a separate operation and is not part of local
repository setup. Production Firebase ownership remains with the original
portal repository until the reviewed no-op cutover.

## Isolated setup outline

### 1. Create a disposable Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project"
3. Name it (e.g., "tenacity-tutoring")
4. Disable Google Analytics (optional)

### 2. Enable Firestore Database

1. Go to "Firestore Database"
2. Click "Create database"
3. Start in **test mode** (we'll set rules later)
4. Choose your location

### 3. Create Collections

You need 2 collections:

#### `classes` Collection

Add sample tutoring classes:

```json
// Document ID: math-year10-monday-4pm
{
  "id": "math-year10-monday-4pm",
  "type": "Maths",
  "day": "Monday",
  "startTime": "4:00 PM",
  "endTime": "5:30 PM",
  "capacity": 12,
  "enrolledStudents": []
}
```

Add more classes for different:

- Years (5-12)
- Subjects (Maths, English, etc.)
- Days (Monday-Friday)
- Times (after school hours)

**💡 Want to change available years, subjects, or days?**
Edit `src/modules/register/constants/index.tsx` to modify:

- `StudentYearsEnum` - School years (currently Year 5-12)
- `Subject` - Available subjects (Maths, English, etc.)
- `DaysOfWeekEnum` - Class days (Monday-Friday)

Make sure your Firebase class documents use the same values!

#### `enrolments` Collection

This will auto-populate when students register. You can create it empty.

### 4. Set Security Rules

The production Firestore rules are managed in the Tenacity web portal repo, not
this website repo. Do not deploy Firestore rules from here.

For the public website registration flow, browsers should only read class slots.
Registration submissions should go through the Next.js `/api/register` route,
which verifies Turnstile and writes `enrolments` using Firebase Admin.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow reading classes (for form to show options)
    match /classes/{document} {
      allow read: if true;
      allow write: if false; // Only admins can modify classes
    }

    // Public clients must not write enrolments directly.
    match /enrolments/{document} {
      allow read: if false; // No public reading of enrollments
      allow create: if false; // Use /api/register instead
      allow update, delete: if false; // No modifications after submission
    }
  }
}
```

### 5. Get Web App Config

1. Click the web icon (`</>`)
2. Register your app
3. Copy the config values
4. Add them to your `.env.local` file

See [Environment Variables Guide](./environment-variables.md) for details.

## Test an isolated setup

1. **Start your app**: `yarn dev`
2. **Go to `/register`**
3. **Step 1-2**: Should work without Firebase
4. **Step 3**: Should show your classes from Firebase
5. **Complete form**: Only against the approved disposable project

## Sample Classes Data

Here's a script to add multiple classes:

```javascript
// Run this in Firebase console
const sampleClasses = [
  {
    id: "math-year5-monday-4pm",
    type: "Maths",
    day: "Monday",
    startTime: "4:00 PM",
    endTime: "5:00 PM",
    capacity: 15,
    enrolledStudents: [],
  },
  {
    id: "english-year6-tuesday-4pm",
    type: "English",
    day: "Tuesday",
    startTime: "4:00 PM",
    endTime: "5:00 PM",
    capacity: 15,
    enrolledStudents: [],
  },
  // Add more classes as needed
];
```

## Common Issues

**Classes not loading?**

- Check Firestore is enabled
- Verify security rules allow reading `classes`
- Check Firebase project ID in `.env.local`

**Can't submit enrollment?**

- Verify `/api/register` is configured with Turnstile and Firebase Admin secrets
- Check all required form fields are filled
- Look at browser console for errors

**Permission denied?**

- Do not loosen production rules; validate the intended rules with the emulator
- Make sure Firebase project is active

## Production boundary

Do not deploy rules, add sample data, enable backups, or change billing from
this guide. Canonical rules and indexes live under `backend/firebase`, while
production deployment ownership remains in the original portal repository
until cutover.

For website deployment status, see the
[Vercel deployment controls](./deployment.md).
