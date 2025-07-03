import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

@immutable
class Term {
  final String id;
  final String year;
  final int termNumber;
  final DateTime startDate;
  final DateTime endDate;
  final int totalWeeks;
  final bool isActive;
  final DateTime? invoicesGeneratedAt;

  const Term({
    required this.id,
    required this.year,
    required this.termNumber,
    required this.startDate,
    required this.endDate,
    required this.totalWeeks,
    required this.isActive,
    this.invoicesGeneratedAt,
  });

  /// Construct from Firestore [data], using [documentId] as the term's doc ID.
  factory Term.fromMap(Map<String, dynamic> data, String documentId) {
    return Term(
      id: documentId,
      year: data['year'] ?? 0,
      termNumber: data['termNum'] ?? 0,
      startDate: (data['startDate'] as Timestamp).toDate(),
      endDate: (data['endDate'] as Timestamp).toDate(),
      totalWeeks: data['weeksNum'] ?? 0,
      isActive: data['status'] == true,
      invoicesGeneratedAt: data['invoicesGeneratedAt'] != null
          ? (data['invoicesGeneratedAt'] as Timestamp).toDate()
          : null,
    );
  }

  /// Convert this model to a Map<String, dynamic> for saving to Firestore.
  Map<String, dynamic> toMap() {
    return {
      'year': year,
      'termNumber': termNumber,
      'startDate': Timestamp.fromDate(startDate),
      'endDate': Timestamp.fromDate(endDate),
      'totalWeeks': totalWeeks,
      'isActive': isActive,
      'invoicesGeneratedAt': invoicesGeneratedAt != null
          ? Timestamp.fromDate(invoicesGeneratedAt!)
          : null,
    };
  }

  Term copyWith({
    String? id,
    String? year,
    int? termNumber,
    DateTime? startDate,
    DateTime? endDate,
    int? totalWeeks,
    bool? isActive,
    DateTime? invoicesGeneratedAt,
  }) {
    return Term(
      id: id ?? this.id,
      year: year ?? this.year,
      termNumber: termNumber ?? this.termNumber,
      startDate: startDate ?? this.startDate,
      endDate: endDate ?? this.endDate,
      totalWeeks: totalWeeks ?? this.totalWeeks,
      isActive: isActive ?? this.isActive,
      invoicesGeneratedAt: invoicesGeneratedAt,
    );
  }
}
