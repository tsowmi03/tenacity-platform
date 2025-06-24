import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/terms_controller.dart';

class TermsScreen extends StatefulWidget {
  final bool requireAcceptance;
  final String? previousVersion;

  const TermsScreen({
    super.key,
    this.requireAcceptance = true,
    this.previousVersion,
  });

  @override
  State<TermsScreen> createState() => _TermsScreenState();
}

class _TermsScreenState extends State<TermsScreen> {
  final ScrollController _scrollController = ScrollController();
  bool _hasScrolledToEnd = false;
  double _scrollProgress = 0.0;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  void _onScroll() {
    final max = _scrollController.position.maxScrollExtent;
    final offset = _scrollController.offset;
    setState(() {
      _scrollProgress = (max == 0) ? 0 : (offset / max).clamp(0.0, 1.0);
      _hasScrolledToEnd = offset >= (max - 10);
    });
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  bool _isVersionGreater(String version1, String version2) {
    final v1Parts = version1.split('.').map(int.parse).toList();
    final v2Parts = version2.split('.').map(int.parse).toList();

    for (int i = 0; i < v1Parts.length; i++) {
      if (i >= v2Parts.length || v1Parts[i] > v2Parts[i]) {
        return true;
      } else if (v1Parts[i] < v2Parts[i]) {
        return false;
      }
    }
    return false;
  }

  String _formatDate(DateTime date) {
    return '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
  }

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
        automaticallyImplyLeading: !widget.requireAcceptance,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(4),
          child: TweenAnimationBuilder<double>(
            tween: Tween<double>(begin: 0, end: _scrollProgress),
            duration: const Duration(milliseconds: 200),
            builder: (context, value, child) => LinearProgressIndicator(
              value: value,
              minHeight: 4,
              backgroundColor: Colors.grey[300],
              color: Theme.of(context).primaryColor,
            ),
          ),
        ),
      ),
      body: Column(
        children: [
          if (widget.previousVersion != null &&
              widget.previousVersion != terms.version)
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
                      'We\'ve updated our Terms & Conditions since version ${widget.previousVersion}',
                    ),
                    const SizedBox(height: 12),
                    ...terms.changelog
                        .where((entry) =>
                            widget.previousVersion == null ||
                            _isVersionGreater(
                                entry.version, widget.previousVersion!))
                        .map((entry) => Padding(
                              padding: const EdgeInsets.only(bottom: 8.0),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'v${entry.version} - ${entry.date != null ? _formatDate(entry.date!) : ""}',
                                    style: const TextStyle(
                                        fontWeight: FontWeight.bold,
                                        fontSize: 14),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(entry.changes),
                                ],
                              ),
                            ))
                        .toList(),
                  ],
                ),
              ),
            ),
          Expanded(
            child: Markdown(
              controller: _scrollController,
              data: terms.content,
              styleSheet: MarkdownStyleSheet(
                h1: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
                h2: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
                p: const TextStyle(fontSize: 16, height: 1.4),
              ),
            ),
          ),
          if (widget.requireAcceptance)
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () {
                          authController.logout();
                        },
                        child: const Text('Decline'),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: ElevatedButton(
                        onPressed: _hasScrolledToEnd
                            ? () async {
                                if (authController.currentUser != null) {
                                  await termsController.acceptTerms(
                                    authController.currentUser!.uid,
                                  );
                                  await termsController.checkUserTermsStatus(
                                      authController.currentUser!.uid);
                                  if (context.mounted) {
                                    Navigator.of(context).pop();
                                  }
                                }
                              }
                            : null,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: _hasScrolledToEnd
                              ? Theme.of(context).primaryColor
                              : Colors.grey,
                        ),
                        child: const Text('Accept',
                            style: TextStyle(color: Colors.white)),
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
