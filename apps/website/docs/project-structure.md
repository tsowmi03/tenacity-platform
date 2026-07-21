# Project Structure

How the Tenacity Tutoring codebase is organized.

## Main Folders

```
tenacitytutoring/
├── docs/                    # Documentation files
├── public/                  # Static files (images, animations, fonts)
├── src/                     # All source code
├── .env.local              # Your Firebase config (create this)
├── package.json            # Dependencies and scripts
└── next.config.ts          # Next.js settings
```

## Source Code (`src/`)

```
src/
├── lib/                    # Shared utilities
│   ├── firebaseConfig.ts   # Firebase connection
│   └── constants.ts        # App-wide constants
├── modules/                # Feature-based code
│   ├── register/           # Registration form (main feature)
│   ├── common/             # Shared components
│   ├── home/               # Homepage
│   └── layout/             # Site layout
├── pages/                  # Next.js pages (routes)
│   ├── register/           # /register page
│   ├── thank-you/          # /thank-you page
│   └── index.tsx           # Homepage (/)
└── styles/                 # Global CSS
```

## Registration Module

The main feature - the 6-step enrollment form:

```
modules/register/
├── form/
│   └── index.tsx           # Main form controller
├── Step1Year/              # Year selection
├── Step2Subject/           # Subject selection
├── Step3ClassSlots/        # Time slot selection
├── Step4Student/           # Student info
├── Step5Carer/             # Carer info
├── Step6AdditionalInfo/    # Final step
└── constants/
    └── index.tsx          # ⭐ IMPORTANT: Student years, subjects, days
```

## Static Assets (`public/`)

```
public/
├── animation/              # Lottie animations (.json files)
│   ├── step1.json         # Year selection animation
│   ├── step2.json         # Subject selection animation
│   ├── step3.json         # Class slot animation
│   ├── step4.json         # Student info animation
│   ├── step5.json         # Carer info animation
│   └── step6.json         # Final step animation
├── font/                  # Custom fonts (Massilia)
├── icons/                 # SVG icons
└── [logos, images, etc.]  # Other assets
```

## Key Files to Know

### Main Registration Form

- `src/modules/register/form/index.tsx` - Controls the entire 6-step process

### Firebase Connection

- `src/lib/firebaseConfig.ts` - Database connection setup

### ⭐ Form Configuration (Important!)

- `src/modules/register/constants/index.tsx` - **Edit here to change:**
  - **StudentYearsEnum** - Available school years (Year 5-12)
  - **Subject** - Available subjects (Maths, English, etc.)
  - **DaysOfWeekEnum** - Available class days (Mon-Fri)

### Pages

- `src/pages/register/index.tsx` - Registration page entry point
- `src/pages/thank-you/index.tsx` - Success page after enrollment

## How It All Works

1. **User visits `/register`** → `pages/register/index.tsx`
2. **Loads registration form** → `modules/register/form/index.tsx`
3. **Form manages 6 steps** → Individual step components
4. **Saves to Firebase** → `lib/firebaseConfig.ts` handles database
5. **Redirects to success** → `pages/thank-you/index.tsx`

## Development Patterns

### Component Structure

Each feature module contains:

- `index.tsx` - Main component
- Local constants and types
- Feature-specific logic

### Shared Code

- Common UI components in `modules/common/`
- Utilities in `lib/`
- Global styles in `styles/`

### File Naming

- **Folders**: PascalCase (`Step1Year`)
- **Components**: `index.tsx` in folder
- **Utilities**: camelCase (`firebaseConfig.ts`)

This structure keeps related code together and makes it easy to find and modify specific features.
