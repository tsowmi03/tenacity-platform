# Setup & Installation Guide

This guide will help you set up the Tenacity Tutoring project on your local machine.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (version 18.0 or higher)
  - Download from [nodejs.org](https://nodejs.org/)
  - Verify installation: `node --version`
- **npm** (comes with Node.js)
  - Verify installation: `npm --version`
- **Git** (for cloning the repository)
  - Download from [git-scm.com](https://git-scm.com/)

## Installation Steps

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd tenacitytutoring
npm install
```

### 2. Set Up Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable Firestore Database
4. Get your config from Project Settings → General → Your apps
5. Copy `.env.example` to `.env.local` and add your Firebase config

See [Environment Variables Guide](./environment-variables.md) for detailed Firebase setup.

### 3. Add Sample Data

In Firebase Console → Firestore Database, create:

- `classes` collection with some tutoring classes
- `enrolments` collection (will populate automatically)

Example class document:

```json
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

### 4. Start the App

```bash
npm run dev
```

Open [http://localhost:3003](http://localhost:3003)

## Test Everything Works

1. **Homepage loads** ✅
2. **Go to `/register`** ✅
3. **Complete the 6-step form** ✅
4. **Check Firebase** - new enrollment should appear ✅

## Common Issues

**Build errors?**

```bash
npm run lint
```

**Firebase not connecting?**

- Check your `.env.local` file has all 6 Firebase variables
- Verify Firebase project is active

**Port 3003 in use?**

```bash
npm run dev -- -p 3004
```

## Next Steps

- [Understanding the Registration Flow](./registration-flow.md)
- [Deploy to Vercel](./vercel-deployment.md)
- [Firebase Database Setup](./firebase-setup.md)
