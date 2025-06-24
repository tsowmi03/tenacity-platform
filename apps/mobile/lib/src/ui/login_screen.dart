import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/ui/home_screen.dart';
import 'package:url_launcher/url_launcher.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  bool _isButtonEnabled = false;
  bool _obscurePassword = true;

  @override
  void initState() {
    super.initState();
    _emailController.addListener(_updateButtonState);
    _passwordController.addListener(_updateButtonState);
  }

  void _updateButtonState() {
    final email = _emailController.text.trim();
    final password = _passwordController.text.trim();
    bool isEmailValid =
        email.isNotEmpty && RegExp(r'^[^@]+@[^@]+\.[^@]+').hasMatch(email);
    bool isPasswordValid = password.isNotEmpty && password.length >= 6;
    setState(() {
      _isButtonEnabled = isEmailValid && isPasswordValid;
    });
  }

  void _login() async {
    // Show a snack bar if the form is invalid.
    if (!_formKey.currentState!.validate()) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("Please correct the errors before proceeding."),
        ),
      );
      return;
    }
    final authController = context.read<AuthController>();
    await authController.login(
      _emailController.text.trim(),
      _passwordController.text.trim(),
    );
    // If there's an error, show it.
    if (authController.errorMessage != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(authController.errorMessage!)),
      );
    } else if (authController.currentUser != null) {
      // Navigate to home screen on successful login.
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const HomeScreen()),
      );
    }
  }

  @override
  void dispose() {
    _emailController.removeListener(_updateButtonState);
    _passwordController.removeListener(_updateButtonState);
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final authController = context.watch<AuthController>();
    final isLoading = authController.isLoading;
    double screenHeight = MediaQuery.of(context).size.height;
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: SingleChildScrollView(
          child: Form(
            key: _formKey,
            // Enable real-time validation.
            autovalidateMode: AutovalidateMode.onUserInteraction,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  height: screenHeight / 3,
                  decoration: const BoxDecoration(
                    image: DecorationImage(
                      image:
                          AssetImage('lib/assets/img/Tenacity_Main_Logo.png'),
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
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return 'Please enter your email.';
                    }
                    if (!RegExp(r'^[^@]+@[^@]+\.[^@]+')
                        .hasMatch(value.trim())) {
                      return 'Invalid email format.';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16.0),
                TextFormField(
                  controller: _passwordController,
                  decoration: InputDecoration(
                    labelText: 'Password',
                    border: const OutlineInputBorder(),
                    prefixIcon: const Icon(Icons.lock),
                    suffixIcon: IconButton(
                      icon: Icon(
                        _obscurePassword
                            ? Icons.visibility_off
                            : Icons.visibility,
                      ),
                      onPressed: () {
                        setState(() {
                          _obscurePassword = !_obscurePassword;
                        });
                      },
                    ),
                  ),
                  obscureText: _obscurePassword,
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return 'Please enter your password.';
                    }
                    if (value.trim().length < 6) {
                      return 'Password must be at least 6 characters.';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 25.0),
                SizedBox(
                  height: 60.0,
                  width: double.infinity,
                  child: isLoading
                      ? const Center(child: CircularProgressIndicator())
                      : ElevatedButton(
                          // Only enable the button when _isButtonEnabled is true.
                          onPressed: _isButtonEnabled ? _login : null,
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
                const SizedBox(height: 10),
                if (authController.errorMessage != null)
                  Text(
                    authController.errorMessage!,
                    style: const TextStyle(color: Colors.red),
                    textAlign: TextAlign.center,
                  ),
                const SizedBox(height: 20),
                TextButton(
                  onPressed: () async {
                    final email = _emailController.text.trim();
                    await authController.resetPassword(email);
                    if (authController.errorMessage != null) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(authController.errorMessage!),
                        ),
                      );
                    }
                  },
                  child: const Text('Forgot Password?'),
                ),
                TextButton(
                  onPressed: () async {
                    final url =
                        Uri.parse('https://www.tenacitytutoring.com/register');
                    if (await canLaunchUrl(url)) {
                      await launchUrl(url);
                    } else {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content:
                              Text('Could not launch the registration page.'),
                        ),
                      );
                    }
                  },
                  child: const Text('Enrol Now!'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
