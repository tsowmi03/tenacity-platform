import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

@immutable
class Attendance {
  final String id;
  final DateTime date;
  final String termId;
  final bool cancelled;
  final DateTime updatedAt;
  final String updatedBy;
  final int weekNumber;
  final List<String> attendance;
  final List<String> tutors;

  const Attendance({
    required this.id,
    required this.date,
    required this.termId,
    required this.cancelled,
    required this.updatedAt,
    required this.updatedBy,
    required this.weekNumber,
    required this.attendance,
    required this.tutors,
  });

  factory Attendance.fromMap(Map<String, dynamic> data, String documentId) {
    return Attendance(
      id: documentId,
      date: (data['date'] as Timestamp).toDate(),
      termId: data['termId'],
      cancelled: (data['cancelled'] as bool?) ?? false,
      updatedAt: (data['updatedAt'] as Timestamp).toDate(),
      updatedBy: data['updatedBy'],
      weekNumber: data['weekNum'] ?? 0,
      attendance: List<String>.from(data['attendance'] ?? []),
      tutors: List<String>.from(data['tutors'] ?? []),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'date': Timestamp.fromDate(date),
      'termId': termId,
      'cancelled': cancelled,
      'updatedAt': Timestamp.fromDate(updatedAt),
      'updatedBy': updatedBy,
      'weekNum': weekNumber,
      'attendance': attendance,
      'tutors': tutors,
    };
  }

  Attendance copyWith({
    String? id,
    DateTime? date,
    String? termId,
    bool? cancelled,
    DateTime? updatedAt,
    String? updatedBy,
    int? weekNumber,
    List<String>? attendance,
    List<String>? tutors,
  }) {
    return Attendance(
      id: id ?? this.id,
      date: date ?? this.date,
      termId: termId ?? this.termId,
      cancelled: cancelled ?? this.cancelled,
      updatedAt: updatedAt ?? this.updatedAt,
      updatedBy: updatedBy ?? this.updatedBy,
      weekNumber: weekNumber ?? this.weekNumber,
      attendance: attendance ?? this.attendance,
      tutors: tutors ?? this.tutors,
    );
  }
}
