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

  /// When a tutor or admin confirmed this session's roll, and who.
  ///
  /// Part of the tutor-session contract. Before this existed, "has the roll
  /// been marked?" was inferred from `updatedBy == 'system'` — true only until
  /// anything else touched the document, and false for a roll a tutor
  /// deliberately saved unchanged (every student present, nothing to edit).
  /// Both fields are null on documents written before the contract, which
  /// [isRollComplete] treats as "unknown", not "complete".
  final DateTime? rollCompletedAt;
  final String? rollCompletedBy;

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
    this.rollCompletedAt,
    this.rollCompletedBy,
  });

  factory Attendance.fromMap(Map<String, dynamic> data, String documentId) {
    final rollCompletedAt = data['rollCompletedAt'];

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
      rollCompletedAt:
          rollCompletedAt is Timestamp ? rollCompletedAt.toDate() : null,
      rollCompletedBy: data['rollCompletedBy'] as String?,
    );
  }

  /// Whether a person has confirmed this roll.
  ///
  /// Deliberately false for a document with no completion stamp: a roll that
  /// predates the contract is unproven, and claiming otherwise would clear
  /// "rolls to mark" counts that a tutor still needs to see.
  bool get isRollComplete => rollCompletedAt != null;

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
      // Written even when null, so reopening a roll clears the stamp rather
      // than leaving a stale one behind.
      'rollCompletedAt':
          rollCompletedAt == null ? null : Timestamp.fromDate(rollCompletedAt!),
      'rollCompletedBy': rollCompletedBy,
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
    DateTime? rollCompletedAt,
    String? rollCompletedBy,
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
      rollCompletedAt: rollCompletedAt ?? this.rollCompletedAt,
      rollCompletedBy: rollCompletedBy ?? this.rollCompletedBy,
    );
  }

  /// Clears the completion stamp. [copyWith] cannot express this, since a null
  /// argument there means "leave unchanged".
  Attendance withRollReopened() {
    return Attendance(
      id: id,
      date: date,
      termId: termId,
      cancelled: cancelled,
      updatedAt: updatedAt,
      updatedBy: updatedBy,
      weekNumber: weekNumber,
      attendance: attendance,
      tutors: tutors,
    );
  }
}
