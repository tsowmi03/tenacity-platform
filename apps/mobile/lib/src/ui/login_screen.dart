import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/ui/home_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();

  void _login() async {
    print('logging in');
    final authController = context.read<AuthController>();
    await authController.login(
      _emailController.text.trim(),
      _passwordController.text.trim(),
    );
    // If no errorMessage and currentUser is not null => success
    if (authController.errorMessage == null && authController.currentUser != null) {
      // Navigate to home screen
      print('SUCCESS!');
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const HomeScreen()),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final authController = context.watch<AuthController>();
    final isLoading = authController.isLoading;
    final errorMessage = authController.errorMessage;

    double screenHeight = MediaQuery.of(context).size.height;
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisAlignment: MainAxisAlignment.start,
            children: [
              Container(
                height: screenHeight / 3,
                decoration: const BoxDecoration(
                  image: DecorationImage(
                    image: AssetImage('lib/assets/img/Tenacity_Main_Logo.png'),
                  ),
                ),
              ),
              const SizedBox(height: 50.0),
              TextFormField(
                controller: _emailController,
                decoration: const InputDecoration(
                  labelText: 'Email',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.email),
                ),
                keyboardType: TextInputType.emailAddress,
              ),
              const SizedBox(height: 16.0),
              TextFormField(
                controller: _passwordController,
                decoration: const InputDecoration(
                  labelText: 'Password',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.lock),
                ),
                obscureText: true,
              ),
              const SizedBox(height: 25.0),
              SizedBox(
                height: 60.0,
                width: double.infinity,
                child: isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : ElevatedButton(
                      onPressed: _login,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF1C71AF),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(30.0),
                        ),
                        textStyle: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      child: const Text(
                        'Log In',
                        style: TextStyle(color: Colors.white),
                      ),
                    ),
              ),

              // TODO: IMPLEMENT SNACKBAR HERE
              if (errorMessage != null) ...[
                const SizedBox(height: 12),
                Text(
                  errorMessage,
                  style: const TextStyle(color: Colors.red),
                ),
              ],
              const SizedBox(height: 20),
              // TODO: FORGOT PASSWORD BUTTON
              TextButton(
                onPressed: () {
                  // e.g. 
                  // final email = _emailController.text.trim();
                  // authController.resetPassword(email);
                },
                child: const Text('Forgot Password?'),
              ),

              // TODO: ENROL NOW -> WEBSITE
              TextButton(
                onPressed: () {
                  // e.g. open enrollment page
                  // final url = Uri.parse('https://mysite.com/enrollment');
                  // launchUrl(url);
                },
                child: const Text('Enrol Now!'),
              ),
            ],
          )
        )
      )
    );
  }
}