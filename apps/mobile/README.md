# Tenacity Tutoring

Tenacity Tutoring is a cross-platform Flutter application backed by Firebase. It provides features for students, tutors and parents such as chat, announcements, timetable management and invoice payments. The project also contains Firebase Cloud Functions written in TypeScript for backend tasks like sending emails and scheduled updates.

## Features

- **Authentication** – Sign in using Firebase Authentication.
- **Announcements** – View the latest news and updates.
- **Chat & Messaging** – Real‑time chat with unread message tracking.
- **Class Timetable** – View upcoming classes and session information.
- **Invoices & Payments** – Pay outstanding invoices via Stripe.
- **Feedback** – Submit feedback forms that go to administrators.
- **Push Notifications** – Receive device notifications (FCM).
- **Admin Tools** – Create invoices and manage users from the dashboard.

## Getting Started

### Prerequisites

- [Flutter](https://flutter.dev/docs/get-started/install) 3.x
- A configured Firebase project with Firestore, Authentication and Cloud Functions enabled
- Node.js 18+ (for Firebase Functions)

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
4. Install Firebase Functions dependencies:
   ```bash
   cd functions
   npm install
   cd ..
   ```

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

### Deploying Firebase Functions

Compile and deploy the Cloud Functions:
```bash
cd functions
npm run build
firebase deploy --only functions
```

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

