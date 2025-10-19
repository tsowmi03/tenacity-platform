# Tenacity Tutoring

A Next.js tutoring website with a 6-step student enrollment form and Firebase backend.

## 📖 Documentation

### 🚀 Getting Started

- **[Setup Guide](./docs/setup.md)** - Install and run the project
- **[Environment Variables](./docs/environment-variables.md)** - Firebase configuration

### 🔧 Development

- **[Registration Flow](./docs/registration-flow.md)** - How the 6-step form works
- **[Firebase Setup](./docs/firebase-setup.md)** - Database configuration
- **[Project Structure](./docs/project-structure.md)** - Code organization

### 🚦 Deployment

- **[Vercel Deployment](./docs/vercel-deployment.md)** - Deploy to Vercel (recommended)

## Quick Start

1. **Clone and install**

   ```bash
   git clone <your-repo-url>
   cd tenacitytutoring
   ```

2. **Install dependencies**

   npm install

   ```
    npm install
   ```

3. **Set up Firebase**

   ```bash
   cp .env.example .env.local
   # Add your Firebase config to .env.local
   ```

4. **Start developing**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3003](http://localhost:3003)

## 📝 What's Included

- **6-step registration form** with animations
- **Firebase database** for storing enrollments
- **Responsive design** for mobile and desktop
- **Form validation** and error handling

## ⚙️ Quick Customization

**Need to change school years, subjects, or class days?**
Edit `src/modules/register/constants/index.tsx` - this controls all the options in your registration form.

## 🚀 Ready to Deploy?

See the [Vercel Deployment Guide](./docs/deployment.md) for the easiest way to go live.
