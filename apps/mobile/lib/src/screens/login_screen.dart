import 'package:flutter/material.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();

  @override
  Widget build(BuildContext context) {
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
                child: ElevatedButton(
                  onPressed: () {
                    // TODO: Replace with login logic. CALL CONTROLLER.
                    // e.g.:
                    // await FirebaseAuth.instance.signInWithEmailAndPassword(
                    //   email: _emailController.text.trim(),
                    //   password: _passwordController.text.trim(),
                    // );
                    // Then navigate to another screen upon success, or show error message.
                  },
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
              const SizedBox(height: 20),
              TextButton(
                onPressed: () {
                  //IMPLEMENT FORGOT PASSWORD BUTTON HERE. CALL CONTROLLER
                },
                child: const Text('Forgot Password?'),
              ),
              TextButton(
                onPressed: () {
                  //IMPLEMENT NAVIGATION TO SITE HERE. CALL CONTROLLER
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