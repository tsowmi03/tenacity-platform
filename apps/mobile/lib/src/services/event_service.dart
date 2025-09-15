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
}
