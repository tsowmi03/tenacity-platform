import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';

class EventService {
  static final EventService _instance = EventService._internal();
  factory EventService() => _instance;
  EventService._internal();

  final FirebaseFunctions _functions = FirebaseFunctions.instance;

  /// Publishes a business event to the backend
  Future<void> publishEvent({
    required String eventType,
    required Map<String, dynamic> data,
    Map<String, dynamic>? metadata,
  }) async {
    try {
      debugPrint('[EventService] Publishing event: $eventType');
      debugPrint('[EventService] Event data: $data');

      await _functions.httpsCallable('publishEvent').call({
        'eventType': eventType,
        'data': data,
        'metadata': metadata ?? {},
        'timestamp': DateTime.now().toIso8601String(),
      });

      debugPrint('[EventService] Event published successfully: $eventType');
    } catch (e) {
      debugPrint('[EventService] Error publishing event $eventType: $e');
      // don't rethrow - main action should succeed even if event publishing fails
    }
  }

  /// Publishes enrollment events
  Future<void> publishEnrollmentEvent({
    required String action, // 'enrolled' or 'unenrolled'
    required String enrollmentType, // 'permanent' or 'oneoff'
    required String classId,
    required String studentId,
    required String userId,
    String? attendanceDocId,
  }) async {
    await publishEvent(
      eventType: 'student.$action',
      data: {
        'enrollmentType': enrollmentType,
        'classId': classId,
        'studentId': studentId,
        'userId': userId,
        if (attendanceDocId != null) 'attendanceDocId': attendanceDocId,
      },
    );
  }

  Future<void> publishSwapEvent({
    required String oldClassId,
    required String newClassId,
    required String studentId,
    required String userId,
  }) async {
    await publishEvent(
      eventType: 'student.swapped',
      data: {
        'oldClassId': oldClassId,
        'newClassId': newClassId,
        'studentId': studentId,
        'userId': userId,
      },
    );
  }

  Future<void> publishWeeklyRescheduleEvent({
    required String oldClassId,
    required String oldAttendanceDocId,
    required String newClassId,
    required String newAttendanceDocId,
    required String studentId,
    required String userId,
  }) async {
    await EventService().publishEvent(
      eventType: 'student.weekly_rescheduled',
      data: {
        'oldClassId': oldClassId,
        'oldAttendanceDocId': oldAttendanceDocId,
        'newClassId': newClassId,
        'newAttendanceDocId': newAttendanceDocId,
        'studentId': studentId,
        'userId': userId,
      },
    );
  }
}
