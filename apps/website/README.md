# Tenacity Tutoring

A Next.js tutoring website with a 6-step student enrollment form and Firebase backend.

> Monorepo migration boundary: production Vercel ownership has not moved from
> the original website repository. The tracked `vercel.json` disables automatic
> production aliasing for the future cutover, but does not rebind or deploy the
> canonical `tenacity-tutoring-tqi9` project.

## 📖 Documentation

### 🚀 Getting Started

- **[Setup Guide](./docs/setup.md)** - Install and run the project
- **[Environment Variables](./docs/environment-variables.md)** - Firebase configuration

### 🔧 Development

- **[Registration Flow](./docs/registration-flow.md)** - How the 6-step form works
- **[Firebase Setup](./docs/firebase-setup.md)** - Database configuration
- **[Project Structure](./docs/project-structure.md)** - Code organization

### 🚦 Deployment

- **[Vercel Deployment Controls](./docs/deployment.md)** - Current migration
  hold and cutover gates

## Quick Start

1. **Open the website workspace from the monorepo root**

   ```bash
   cd apps/website
   ```

2. **Install dependencies**

   ```bash
   corepack enable
   corepack prepare yarn@1.22.19 --activate
   yarn install --frozen-lockfile
   ```

3. **Set up Firebase**

   Create an untracked `.env.local` using the
   [environment variable guide](./docs/environment-variables.md). Do not use
   production credentials for local write testing.

4. **Start developing**

   ```bash
   yarn dev
   ```

   Open [http://localhost:3003](http://localhost:3003)

## 📝 What's Included

- **6-step registration form** with animations
- **Firebase database** for storing enrollments
- **Responsive design** for mobile and desktop
- **Form validation** and error handling

## ⚙️ Quick Customization

**Need to change school years, subjects, or class days?**
Edit `src/modules/register/constants/index.tsx` - this controls all the
options in your registration form.

## 🚀 Ready to Deploy?

Read the [Vercel deployment controls](./docs/deployment.md) before any future
cutover work.
