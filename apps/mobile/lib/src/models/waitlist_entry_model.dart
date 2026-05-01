import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

enum WaitlistStatus {
  active,
  offered,
  accepted,
  declined,
  expired,
  cancelled,
  promoted,
}

extension WaitlistStatusExtension on WaitlistStatus {
  String get value {
    switch (this) {
      case WaitlistStatus.active:
        return 'active';
      case WaitlistStatus.offered:
        return 'offered';
      case WaitlistStatus.accepted:
        return 'accepted';
      case WaitlistStatus.declined:
        return 'declined';
      case WaitlistStatus.expired:
        return 'expired';
      case WaitlistStatus.cancelled:
        return 'cancelled';
      case WaitlistStatus.promoted:
        return 'promoted';
    }
  }

  static WaitlistStatus fromString(String status) {
    switch (status) {
      case 'active':
        return WaitlistStatus.active;
      case 'offered':
        return WaitlistStatus.offered;
      case 'accepted':
        return WaitlistStatus.accepted;
      case 'declined':
        return WaitlistStatus.declined;
      case 'expired':
        return WaitlistStatus.expired;
      case 'cancelled':
        return WaitlistStatus.cancelled;
      case 'promoted':
        return WaitlistStatus.promoted;
      default:
        throw Exception('Unknown waitlist status: $status');
    }
  }
}

enum WaitlistReason {
  classNotOpen,
  classFull,
}

extension WaitlistReasonExtension on WaitlistReason {
  String get value {
    switch (this) {
      case WaitlistReason.classNotOpen:
        return 'class_not_open';
      case WaitlistReason.classFull:
        return 'class_full';
    }
  }

  static WaitlistReason fromString(String reason) {
    switch (reason) {
      case 'class_not_open':
        return WaitlistReason.classNotOpen;
      case 'class_full':
        return WaitlistReason.classFull;
      default:
        throw Exception('Unknown waitlist reason: $reason');
    }
  }
}

@immutable
class WaitlistEntry {
  final String id;
  final String classId;
  final String studentId;
  final String parentId;
  final String classType;
  final String dayOfWeek;
  final String startTime;
  final String endTime;
  final WaitlistStatus status;
  final WaitlistReason reason;
  final int position;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? offeredAt;
  final DateTime? offerExpiresAt;
  final DateTime? promotedAt;

  const WaitlistEntry({
    required this.id,
    required this.classId,
    required this.studentId,
    required this.parentId,
    required this.classType,
    required this.dayOfWeek,
    required this.startTime,
    required this.endTime,
    required this.status,
    required this.reason,
    required this.position,
    required this.createdAt,
    required this.updatedAt,
    this.offeredAt,
    this.offerExpiresAt,
    this.promotedAt,
  });

  factory WaitlistEntry.fromMap(
    Map<String, dynamic> data,
    String documentId,
  ) {
    return WaitlistEntry(
      id: documentId,
      classId: data['classId'] ?? '',
      studentId: data['studentId'] ?? '',
      parentId: data['parentId'] ?? '',
      classType: data['classType'] ?? '',
      dayOfWeek: data['day'] ?? data['dayOfWeek'] ?? '',
      startTime: data['startTime'] ?? '',
      endTime: data['endTime'] ?? '',
      status: data['status'] != null
          ? WaitlistStatusExtension.fromString(data['status'] as String)
          : WaitlistStatus.active,
      reason: data['reason'] != null
          ? WaitlistReasonExtension.fromString(data['reason'] as String)
          : WaitlistReason.classFull,
      position: data['position'] ?? 0,
      createdAt: _timestampToDate(data['createdAt']),
      updatedAt: _timestampToDate(data['updatedAt']),
      offeredAt: _nullableTimestampToDate(data['offeredAt']),
      offerExpiresAt: _nullableTimestampToDate(data['offerExpiresAt']),
      promotedAt: _nullableTimestampToDate(data['promotedAt']),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'classId': classId,
      'studentId': studentId,
      'parentId': parentId,
      'classType': classType,
      'day': dayOfWeek,
      'startTime': startTime,
      'endTime': endTime,
      'status': status.value,
      'reason': reason.value,
      'position': position,
      'createdAt': Timestamp.fromDate(createdAt),
      'updatedAt': Timestamp.fromDate(updatedAt),
      'offeredAt': offeredAt != null ? Timestamp.fromDate(offeredAt!) : null,
      'offerExpiresAt':
          offerExpiresAt != null ? Timestamp.fromDate(offerExpiresAt!) : null,
      'promotedAt': promotedAt != null ? Timestamp.fromDate(promotedAt!) : null,
    };
  }

  WaitlistEntry copyWith({
    String? id,
    String? classId,
    String? studentId,
    String? parentId,
    String? classType,
    String? dayOfWeek,
    String? startTime,
    String? endTime,
    WaitlistStatus? status,
    WaitlistReason? reason,
    int? position,
    DateTime? createdAt,
    DateTime? updatedAt,
    DateTime? offeredAt,
    DateTime? offerExpiresAt,
    DateTime? promotedAt,
  }) {
    return WaitlistEntry(
      id: id ?? this.id,
      classId: classId ?? this.classId,
      studentId: studentId ?? this.studentId,
      parentId: parentId ?? this.parentId,
      classType: classType ?? this.classType,
      dayOfWeek: dayOfWeek ?? this.dayOfWeek,
      startTime: startTime ?? this.startTime,
      endTime: endTime ?? this.endTime,
      status: status ?? this.status,
      reason: reason ?? this.reason,
      position: position ?? this.position,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      offeredAt: offeredAt ?? this.offeredAt,
      offerExpiresAt: offerExpiresAt ?? this.offerExpiresAt,
      promotedAt: promotedAt ?? this.promotedAt,
    );
  }

  static DateTime _timestampToDate(dynamic value) {
    if (value is Timestamp) return value.toDate();
    return DateTime.now();
  }

  static DateTime? _nullableTimestampToDate(dynamic value) {
    if (value is Timestamp) return value.toDate();
    return null;
  }
}
