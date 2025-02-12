import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

@immutable
class Term {
  final String id;              
  final int year;         
  final int termNumber;  
  final DateTime startDate;
  final DateTime endDate;
  final int totalWeeks;
  final bool isActive; 

  const Term({
    required this.id,
    required this.year,
    required this.termNumber,
    required this.startDate,
    required this.endDate,
    required this.totalWeeks,
    required this.isActive,
  });

  /// Construct from Firestore [data], using [documentId] as the term's doc ID.
  factory Term.fromMap(Map<String, dynamic> data, String documentId) {
    return Term(
      id: documentId,
      year: data['year'] ?? 0,
      termNumber: data['termNumber'] ?? 0,
      startDate: (data['startDate'] as Timestamp).toDate(),
      endDate: (data['endDate'] as Timestamp).toDate(),
      totalWeeks: data['totalWeeks'] ?? 0,
      isActive: data['isActive'] == true, 
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
    };
  }

  Term copyWith({
    String? id,
    int? year,
    int? termNumber,
    DateTime? startDate,
    DateTime? endDate,
    int? totalWeeks,
    bool? isActive,
  }) {
    return Term(
      id: id ?? this.id,
      year: year ?? this.year,
      termNumber: termNumber ?? this.termNumber,
      startDate: startDate ?? this.startDate,
      endDate: endDate ?? this.endDate,
      totalWeeks: totalWeeks ?? this.totalWeeks,
      isActive: isActive ?? this.isActive,
    );
  }
}
