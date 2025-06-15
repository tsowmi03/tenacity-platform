import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/terms_controller.dart';

class TermsScreen extends StatelessWidget {
  final bool requireAcceptance;
  final String? previousVersion;

  const TermsScreen({
    super.key,
    this.requireAcceptance = true,
    this.previousVersion,
  });

  @override
  Widget build(BuildContext context) {
    final termsController = Provider.of<TermsController>(context);
    final authController = Provider.of<AuthController>(context);
    final terms = termsController.currentTerms;

    if (terms == null) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(terms.title),
        automaticallyImplyLeading: !requireAcceptance,
      ),
      body: Column(
        children: [
          // Show update message if this is an update
          if (previousVersion != null)
            Card(
              margin: const EdgeInsets.all(16),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Terms Updated',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 18,
                        color: Theme.of(context).primaryColor,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                        'We\'ve updated our Terms & Conditions since version $previousVersion.'),
                  ],
                ),
              ),
            ),

          // Terms content
          Expanded(
            child: Markdown(
              data: terms.content,
              styleSheet: MarkdownStyleSheet(
                h1: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
                h2: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
                p: const TextStyle(fontSize: 16, height: 1.4),
              ),
            ),
          ),

          // Accept/Decline buttons if acceptance required
          if (requireAcceptance)
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () {
                          // Handle decline - typically quit app or log out
                          authController.logout();
                        },
                        child: const Text('Decline'),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: ElevatedButton(
                        onPressed: () async {
                          if (authController.currentUser != null) {
                            await termsController.acceptTerms(
                              authController.currentUser!.uid,
                            );
                            if (context.mounted) {
                              Navigator.of(context).pop();
                            }
                          }
                        },
                        child: const Text('Accept'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
