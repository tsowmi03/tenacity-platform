import 'dart:async';

import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:firebase_remote_config/firebase_remote_config.dart';
import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/auth_wrapper.dart';
import 'package:tenacity/src/controllers/announcement_controller.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/chat_controller.dart';
import 'package:tenacity/src/controllers/connectivity_controller.dart';
import 'package:tenacity/src/controllers/feedback_controller.dart';
import 'package:tenacity/src/controllers/invoice_controller.dart';
import 'package:tenacity/src/controllers/profile_controller.dart';
import 'package:tenacity/src/controllers/settings_controller.dart';
import 'package:tenacity/src/controllers/terms_controller.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
import 'package:tenacity/src/controllers/users_controller.dart';
import 'package:tenacity/src/services/active_chat.dart';
import 'package:tenacity/src/services/chat_outbox.dart';
import 'package:tenacity/src/services/chat_service.dart';
import 'package:tenacity/src/services/feedback_service.dart';
import 'package:tenacity/src/services/notification_service.dart';
import 'package:tenacity/src/services/terms_service.dart';
import 'package:tenacity/src/services/timetable_service.dart';
import 'package:tenacity/src/ui/home_screen.dart';
import 'package:tenacity/src/ui/login_screen.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';
import 'package:tenacity/src/config/app_environment.dart';
import 'package:tenacity/src/widgets/offline_mode_banner.dart';
import 'package:tenacity/src/widgets/staging_banner.dart';
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart'; // for kDebugMode

final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();
final GlobalKey<HomeScreenState> homeScreenKey = GlobalKey<HomeScreenState>();
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;
  LicenseRegistry.addLicense(() async* {
    final license = await rootBundle.loadString('lib/assets/fonts/OFL.txt');
    yield LicenseEntryWithLineBreaks(
      const [
        'Bricolage Grotesque',
        'Plus Jakarta Sans',
        'Newsreader',
      ],
      license,
    );
  });

  FlutterError.onError = (FlutterErrorDetails details) {
    debugPrint('FlutterError: ${details.exception}');
    debugPrintStack(stackTrace: details.stack);
  };

  // Crashes immediately if --flavor and --dart-define=TENACITY_ENV disagree,
  // rather than letting a staging binary talk to production.
  AppEnvironment.assertFlavorMatchesEnvironment();

  await Firebase.initializeApp(
    options: AppEnvironment.firebaseOptions,
  );

  await FirebaseAppCheck.instance.activate(
    // Staging Android builds are never distributed through Play, so Play
    // Integrity attestation cannot succeed for them.
    androidProvider: (kDebugMode || !AppEnvironment.isProduction)
        ? AndroidProvider.debug
        : AndroidProvider.playIntegrity,
    appleProvider: kDebugMode ? AppleProvider.debug : AppleProvider.appAttest,
  );

  final authController = AuthController();
  final termsController = TermsController(termsService: TermsService());
  final notificationService = NotificationService();

  await notificationService.initialize();
  notificationService.setTokenCallback((String token) {
    authController.updateFcmToken(token);
  });

  final remoteConfig = FirebaseRemoteConfig.instance;
  await remoteConfig.setConfigSettings(
    RemoteConfigSettings(
      fetchTimeout: const Duration(seconds: 10),
      minimumFetchInterval: kDebugMode
          ? Duration.zero // always fetch in debug
          : const Duration(hours: 1), // cache up to 1h in prod
    ),
  );
  await remoteConfig.setDefaults({
    'terms_version': '1.0.0',
    'terms_title': 'Tenacity Tutoring T&Cs',
    'terms_content': 'PLACEHOLDER',
    'terms_changelog': '[]',
    'one_off_class_price': 70.0,
    // Deliberately empty. A hardcoded live key here meant that ANY build whose
    // Remote Config fetch failed — including a staging build — fell back to
    // the production Stripe account. Payments are disabled rather than
    // misdirected when Remote Config is unavailable.
    'stripe_publishable_key': '',
  });

  try {
    await remoteConfig.fetchAndActivate();
  } catch (e) {
    debugPrint("RC fetch failed: $e");
  }

  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  // Guarded because the fetchAndActivate above swallows failures: on a cold
  // first launch with no network the key is empty, and assigning an empty
  // string to Stripe.publishableKey throws inside flutter_stripe.
  final stripePublishableKey = remoteConfig.getString('stripe_publishable_key');
  if (stripePublishableKey.isEmpty) {
    debugPrint(
      'Stripe publishable key unavailable; payment flows are disabled.',
    );
  } else {
    AppEnvironment.assertStripeKeyMatchesEnvironment(stripePublishableKey);
    Stripe.publishableKey = stripePublishableKey;
    final merchantIdentifier = AppEnvironment.appleMerchantIdentifier;
    if (merchantIdentifier != null) {
      Stripe.merchantIdentifier = merchantIdentifier;
    }
    await Stripe.instance.applySettings();
  }

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthController>.value(
          value: authController,
        ),
        ChangeNotifierProvider<ConnectivityController>(
          create: (_) => ConnectivityController()..initialize(),
        ),
        // Above ChatScreen on purpose, and never rebuilt: this queue holds the
        // only copy of messages the user has already sent but the server has
        // not confirmed. Replacing it on a connectivity notification would
        // throw those away, which is the class of bug it exists to stop.
        ChangeNotifierProxyProvider2<AuthController, ConnectivityController,
            ChatOutbox>(
          create: (_) => ChatOutbox()..load(),
          update: (_, auth, connectivity, previousOutbox) {
            final outbox = previousOutbox ?? (ChatOutbox()..load());
            // Who is signed in decides whose queued messages may be sent. The
            // store is shared by everyone who uses the device, and the server
            // takes the sender from the caller's own token.
            outbox.setUser(auth.currentUser?.uid);
            outbox.setOnline(connectivity.isOnline);
            return outbox;
          },
        ),
        ChangeNotifierProvider<ProfileController>(
          create: (_) => ProfileController(),
        ),
        ChangeNotifierProvider<AnnouncementsController>(
          create: (_) => AnnouncementsController(),
        ),
        ChangeNotifierProxyProvider<AuthController, ChatController>(
          create: (_) => ChatController(
            chatService: ChatService(),
            userId: '',
          ),
          // Kept, not rebuilt. Returning a new controller here dropped the
          // loaded chats and the Firestore subscription on every
          // `AuthController` notification — which is how an inbox that was
          // already on screen came back empty after switching tabs (MOB-20).
          update: (_, authController, previousChatController) =>
              ChatController.forUser(
            previousChatController,
            authController.currentUser?.uid ?? '',
          ),
        ),
        ChangeNotifierProvider<TimetableController>(
          create: (_) => TimetableController(service: TimetableService()),
        ),
        ChangeNotifierProvider<FeedbackController>(
            create: (_) => FeedbackController(service: FeedbackService())),
        ChangeNotifierProvider<InvoiceController>(
          create: (context) => InvoiceController(
            authController: context.read<AuthController>(),
          ),
        ),
        ChangeNotifierProvider<UsersController>(
            create: (_) => UsersController()),
        ChangeNotifierProvider<TermsController>.value(
          value: termsController,
        ),
        ChangeNotifierProvider<SettingsController>(
            create: (_) => SettingsController()),
      ],
      child: const Tenacity(),
    ),
  );

  // Boot cannot route until this has landed, so it starts here rather than off
  // a post-frame callback through `navigatorKey.currentContext` — a context
  // that is null on the frame this used to run, in which case the terms never
  // loaded at all and the gate had nothing to open on.
  unawaited(termsController.loadTerms());
}

class Tenacity extends StatelessWidget {
  const Tenacity({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      routes: {'/login': (context) => const LoginScreen()},
      navigatorKey: navigatorKey,
      // Lets an open chat thread tell when it has been covered by another
      // screen, and when it has been uncovered again.
      navigatorObservers: [chatRouteObserver],
      title: 'Tenacity Tutoring',
      theme: AppTheme.light,
      builder: (context, child) {
        return StagingBanner(
          child: OfflineModeBanner(
            child: child ?? const SizedBox.shrink(),
          ),
        );
      },
      home: const AuthWrapper(),
    );
  }
}
