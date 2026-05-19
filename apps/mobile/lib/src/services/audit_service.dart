import 'dart:async';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:uuid/uuid.dart';

class AuditService {
  AuditService({FirebaseFunctions? functions})
      : _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFunctions _functions;

  void record({
    required String action,
    required String targetType,
    required String targetId,
    String? targetName,
    Map<String, Object?>? payloadSummary,
    Map<String, Object?>? before,
    Map<String, Object?>? after,
    String? requestId,
  }) async {
    final payload = <String, Object?>{
      'action': action,
      'targetType': targetType,
      'targetId': targetId,
      'targetName': targetName,
      'payloadSummary': _compactMap(payloadSummary),
      'before': _compactMap(before),
      'after': _compactMap(after),
      'requestId': requestId ?? createRequestId(action, targetType, targetId),
    }..removeWhere((_, value) => value == null);

    unawaited(_send(payload, action));
  }

  Future<void> _send(Map<String, Object?> payload, String action) async {
    try {
      await _functions.httpsCallable('recordAuditEvent').call(payload);
    } catch (error) {
      debugPrint('[AuditService] Failed to record $action: $error');
    }
  }

  static String createRequestId(
    String action,
    String targetType,
    String targetId,
  ) {
    return [
      action,
      targetType,
      targetId,
      DateTime.now().microsecondsSinceEpoch,
      const Uuid().v4(),
    ].join(':');
  }

  static String personName({
    required String firstName,
    required String lastName,
    String fallback = 'Unknown',
  }) {
    final name = '$firstName $lastName'.trim();
    return name.isEmpty ? fallback : name;
  }

  static String classTargetName(ClassModel classModel) {
    final type = classModel.type.trim().isEmpty ? 'Class' : classModel.type;
    final day = classModel.dayOfWeek.trim().isEmpty
        ? 'Unknown day'
        : classModel.dayOfWeek;
    final time = classModel.startTime.trim().isEmpty
        ? 'Unknown time'
        : classModel.startTime;
    return '$type · $day · $time';
  }

  static String attendanceTargetName({
    required ClassModel classModel,
    required Attendance attendance,
  }) {
    return '${classTargetName(classModel)} · ${dateOnly(attendance.date)}';
  }

  static String invoiceTargetName({
    required String invoiceId,
    String? invoiceNumber,
  }) {
    final number = invoiceNumber?.trim();
    return number == null || number.isEmpty
        ? 'Invoice ${invoiceId.length > 6 ? invoiceId.substring(0, 6) : invoiceId}'
        : 'Invoice $number';
  }

  static String dateOnly(DateTime value) {
    return DateFormat('yyyy-MM-dd').format(value);
  }

  static List<String> changedFields(
    Map<String, Object?> before,
    Map<String, Object?> after,
  ) {
    final keys = <String>{...before.keys, ...after.keys}.toList()..sort();
    return keys
        .where((key) => before[key]?.toString() != after[key]?.toString())
        .toList();
  }

  static Map<String, Object?>? _compactMap(Map<String, Object?>? input) {
    if (input == null) return null;
    final compact = Map<String, Object?>.from(input);
    return compact.isEmpty ? null : compact;
  }
}
