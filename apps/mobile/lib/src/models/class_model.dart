import 'package:flutter/foundation.dart';

enum ClassEnrollmentState {
  pending,
  open,
  full,
}

extension ClassEnrollmentStateExtension on ClassEnrollmentState {
  String get value {
    switch (this) {
      case ClassEnrollmentState.pending:
        return 'pending';
      case ClassEnrollmentState.open:
        return 'open';
      case ClassEnrollmentState.full:
        return 'full';
    }
  }
}

@immutable
class ClassModel {
  static const int defaultMinimumStudentsToOpen = 2;

  final String id;
  final String type;
  final String dayOfWeek;
  final String startTime;
  final String endTime;
  final int capacity;
  final int minimumStudentsToOpen;
  final List<String> enrolledStudents;
  final List<String> tutors;

  const ClassModel({
    required this.id,
    required this.type,
    required this.dayOfWeek,
    required this.startTime,
    required this.endTime,
    required this.capacity,
    this.minimumStudentsToOpen = defaultMinimumStudentsToOpen,
    required this.enrolledStudents,
    required this.tutors,
  });

  factory ClassModel.fromMap(Map<String, dynamic> data, String documentId) {
    return ClassModel(
      id: documentId,
      type: data['type'] ?? '',
      dayOfWeek: data['day'] ?? '',
      startTime: data['startTime'] ?? '',
      endTime: data['endTime'] ?? '',
      capacity: data['capacity'] ?? 0,
      minimumStudentsToOpen:
          data['minStudentsToOpen'] ?? defaultMinimumStudentsToOpen,
      enrolledStudents: List<String>.from(data['enrolledStudents'] ?? []),
      tutors: List<String>.from(data['tutors'] ?? []),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'type': type,
      'day': dayOfWeek,
      'startTime': startTime,
      'endTime': endTime,
      'capacity': capacity,
      'minStudentsToOpen': minimumStudentsToOpen,
      'enrolledStudents': enrolledStudents,
      'tutors': tutors,
    };
  }

  int get permanentEnrollmentCount => enrolledStudents.length;

  int get permanentSpotsRemaining {
    final remaining = capacity - permanentEnrollmentCount;
    if (remaining < 0) return 0;
    return remaining;
  }

  ClassEnrollmentState get enrollmentState {
    if (permanentSpotsRemaining <= 0) {
      return ClassEnrollmentState.full;
    }
    if (permanentEnrollmentCount < minimumStudentsToOpen) {
      return ClassEnrollmentState.pending;
    }
    return ClassEnrollmentState.open;
  }

  bool get canAcceptParentPermanentEnrollment {
    return enrollmentState == ClassEnrollmentState.open;
  }

  ClassModel copyWith({
    String? id,
    String? type,
    String? dayOfWeek,
    String? startTime,
    String? endTime,
    int? capacity,
    int? minimumStudentsToOpen,
    List<String>? enrolledStudents,
    List<String>? tutors,
  }) {
    return ClassModel(
      id: id ?? this.id,
      type: type ?? this.type,
      dayOfWeek: dayOfWeek ?? this.dayOfWeek,
      startTime: startTime ?? this.startTime,
      endTime: endTime ?? this.endTime,
      capacity: capacity ?? this.capacity,
      minimumStudentsToOpen:
          minimumStudentsToOpen ?? this.minimumStudentsToOpen,
      enrolledStudents: enrolledStudents ?? this.enrolledStudents,
      tutors: tutors ?? this.tutors,
    );
  }
}
