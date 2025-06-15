import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:firebase_remote_config/firebase_remote_config.dart';
import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/auth_wrapper.dart';
import 'package:tenacity/src/controllers/announcement_controller.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/chat_controller.dart';
import 'package:tenacity/src/controllers/feedback_controller.dart';
import 'package:tenacity/src/controllers/invoice_controller.dart';
import 'package:tenacity/src/controllers/payslip_controller.dart';
import 'package:tenacity/src/controllers/profile_controller.dart';
import 'package:tenacity/src/controllers/terms_controller.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
import 'package:tenacity/src/controllers/users_controller.dart';
import 'package:tenacity/src/services/chat_service.dart';
import 'package:tenacity/src/services/feedback_service.dart';
import 'package:tenacity/src/services/notification_service.dart';
import 'package:tenacity/src/services/terms_service.dart';
import 'package:tenacity/src/services/timetable_service.dart';
import 'package:tenacity/src/ui/home_screen.dart';
import 'firebase_options.dart';
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart'; // for kDebugMode

final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();
final GlobalKey<HomeScreenState> homeScreenKey = GlobalKey<HomeScreenState>();
void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );

  await FirebaseAppCheck.instance.activate(
    androidProvider: AndroidProvider.playIntegrity,
    appleProvider: AppleProvider.appAttest,
  );

  final authController = AuthController();
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

  Stripe.publishableKey =
      "pk_live_51NGMmNGpgjvnJDO9zhbXT7favNqfHvtjgFnDJPEg17jCK0jw58hstNV0LPsC0dK2WRz3HcVA782744HQlPdCnTGA00pVht7EnC";
  Stripe.merchantIdentifier = "merchant.com.tenacitytutoring.tenacity";
  await Stripe.instance.applySettings();

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthController>.value(
          value: authController,
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
          update: (_, authController, previousChatController) {
            return ChatController(
              chatService: ChatService(),
              userId: authController.currentUser?.uid ?? '',
            );
          },
        ),
        ChangeNotifierProvider<TimetableController>(
          create: (_) => TimetableController(service: TimetableService()),
        ),
        ChangeNotifierProvider<FeedbackController>(
            create: (_) => FeedbackController(service: FeedbackService())),
        ChangeNotifierProvider<InvoiceController>(
            create: (_) => InvoiceController()),
        ChangeNotifierProvider<UsersController>(
            create: (_) => UsersController()),
        ChangeNotifierProvider<PayslipController>(
            create: (_) => PayslipController()),
        ChangeNotifierProvider<TermsController>(
          create: (_) => TermsController(
            termsService: TermsService(),
          ),
        ),
      ],
      child: const Tenacity(),
    ),
  );

  WidgetsBinding.instance.addPostFrameCallback((_) {
    final context = navigatorKey.currentContext;
    if (context != null) {
      final termsController =
          Provider.of<TermsController>(context, listen: false);
      termsController.loadTerms();
    }
  });
}

class Tenacity extends StatelessWidget {
  const Tenacity({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: navigatorKey,
      title: 'Tenacity Tutoring',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1C71AF)),
        useMaterial3: true,
      ),
      home: const AuthWrapper(),
    );
  }
}
