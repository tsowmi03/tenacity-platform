# Tenacity Tutoring

Tenacity Tutoring is a cross-platform Flutter application backed by Firebase.
It provides features for students, tutors and parents such as chat,
announcements, timetable management and invoice payments. The app calls
deployed Firebase services. Backend source lives under
`../../backend/firebase`, and store releases ship from this monorepo.

## Features

- **Authentication** – Sign in using Firebase Authentication.
- **Announcements** – View the latest news and updates.
- **Chat & Messaging** – Real‑time chat with unread message tracking.
- **Class Timetable** – View upcoming classes and session information.
- **Invoices & Payments** – Pay outstanding invoices via Stripe.
- **Feedback** – Submit feedback forms that go to administrators.
- **Push Notifications** – Receive device notifications (FCM).
- **Admin Tools** – Create invoices and manage users from the dashboard.
- **Backend services** – Callable Functions and rules source live under
  `../../backend/firebase`; see [BACKEND.md](BACKEND.md).

## Getting Started

### Prerequisites

- [Flutter](https://flutter.dev/docs/get-started/install) 3.x
- A configured Firebase project with Firestore, Authentication and Cloud Functions enabled

### Installation

1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd Tenacity
   ```
2. Install Flutter dependencies:
   ```bash
   flutter pub get
   ```
3. Configure Firebase using [FlutterFire CLI](https://firebase.flutter.dev/docs/cli/):
   ```bash
   flutterfire configure
   ```
   This generates `lib/firebase_options.dart` and platform specific configuration files.
### Running the App

Launch the app on your preferred device:
```bash
flutter run
```

### Running Tests

Execute Flutter tests with:
```bash
flutter test
```

### Analytics (PostHog)

Production builds send product analytics to PostHog US Cloud through
`lib/src/services/analytics_service.dart` (MOB-59). This covers:

- app opened, backgrounded, installed and updated;
- a screen view for each bottom-navigation tab;
- Flutter and native errors;
- the signed-in user's UID, with their email and role as person properties.

Session replay, surveys, feature flags and PostHog's push handling are off.

Staging builds send nothing. To test locally, point a staging build at a
receiver of your own:

```bash
scripts/run.sh staging --dart-define=POSTHOG_PROJECT_TOKEN=phc_test \
  --dart-define=POSTHOG_HOST=http://127.0.0.1:8787
```

The production project token lives in `lib/src/config/app_environment.dart`.
It is public by design, the same token the website uses.

### Backend deployments

Do not deploy Firebase Functions, rules, indexes, or Hosting from this
application directory. See [BACKEND.md](BACKEND.md) for the monorepo ownership
boundary.

### Building Release APK/iOS/AppBundle

Use Flutter to create release builds:
```bash
flutter build apk      # Android
flutter build ios      # iOS
flutter build web      # Web
```
Other desktop targets (macOS, Windows, Linux) are also configured.

## Contributing

1. Fork the repository and create your branch from `main`.
2. Ensure `flutter analyze` shows no issues and `flutter test` passes.
3. Submit a pull request describing your changes.

## License

This project does not currently include an explicit license file. All rights are reserved by the authors of Tenacity Tutoring.
