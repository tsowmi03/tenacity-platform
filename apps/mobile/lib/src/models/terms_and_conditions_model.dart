import 'dart:convert';
import 'package:flutter/material.dart';

class TermsAndConditions {
  final String version;
  final String title;
  final String content;
  final List<TermsChangeLog> changelog;

  TermsAndConditions({
    required this.version,
    required this.title,
    required this.content,
    required this.changelog,
  });

  factory TermsAndConditions.fromRemoteConfig(Map<String, dynamic> data) {
    List<TermsChangeLog> changelogList = [];

    try {
      final List<dynamic> rawChangelog =
          data['terms_changelog'] != null && data['terms_changelog'] != '[]'
              ? jsonDecode(data['terms_changelog'])
              : [];

      changelogList =
          rawChangelog.map((entry) => TermsChangeLog.fromJson(entry)).toList();
    } catch (e) {
      debugPrint('Error parsing changelog: $e');
    }

    return TermsAndConditions(
      version: data['terms_version'] ?? '1.0.0',
      title: data['terms_title'] ?? 'Terms & Conditions',
      content: data['terms_content'] ?? '',
      changelog: changelogList,
    );
  }
}

class TermsChangeLog {
  final String version;
  final String changes;
  final DateTime? date;

  TermsChangeLog({
    required this.version,
    required this.changes,
    this.date,
  });

  factory TermsChangeLog.fromJson(Map<String, dynamic> json) {
    return TermsChangeLog(
      version: json['version'] ?? '',
      changes: json['changes'] ?? '',
      date: json['date'] != null ? DateTime.tryParse(json['date']) : null,
    );
  }
}
