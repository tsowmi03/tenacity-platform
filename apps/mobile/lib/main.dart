import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/auth_wrapper.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/ui/login_screen.dart';
import 'firebase_options.dart';
import 'package:flutter/services.dart';

void main () async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthController>(
          create: (_) => AuthController(),
        ),
      ],
      child: const Tenacity(),
    )
  );
}

class Tenacity extends StatelessWidget {
  const Tenacity({super.key});

  // This widget is the root of your application.
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Tenacity Tutoring',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1C71AF)),
        useMaterial3: true,
      ), 
      home: const AuthWrapper(),
    );
  }
}
