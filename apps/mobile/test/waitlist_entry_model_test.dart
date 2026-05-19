import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/waitlist_entry_model.dart';

void main() {
  group('WaitlistEntry', () {
    test('serializes to Firestore map values', () {
      final now = DateTime.utc(2026, 5, 1, 10);
      final offeredAt = DateTime.utc(2026, 5, 2, 10);
      final expiresAt = DateTime.utc(2026, 5, 3, 10);

      final entry = WaitlistEntry(
        id: 'classA_studentA',
        classId: 'classA',
        studentId: 'studentA',
        parentId: 'parentA',
        classType: 'Maths',
        dayOfWeek: 'Monday',
        startTime: '16:00',
        endTime: '17:00',
        status: WaitlistStatus.offered,
        reason: WaitlistReason.classFull,
        position: 3,
        createdAt: now,
        updatedAt: now,
        offeredAt: offeredAt,
        offerExpiresAt: expiresAt,
      );

      final map = entry.toMap();

      expect(map['classId'], 'classA');
      expect(map['studentId'], 'studentA');
      expect(map['parentId'], 'parentA');
      expect(map['classType'], 'Maths');
      expect(map['day'], 'Monday');
      expect(map['status'], 'offered');
      expect(map['reason'], 'class_full');
      expect(map['position'], 3);
      expect(
        (map['createdAt'] as Timestamp).toDate().millisecondsSinceEpoch,
        now.millisecondsSinceEpoch,
      );
      expect(
        (map['offeredAt'] as Timestamp).toDate().millisecondsSinceEpoch,
        offeredAt.millisecondsSinceEpoch,
      );
      expect(
        (map['offerExpiresAt'] as Timestamp).toDate().millisecondsSinceEpoch,
        expiresAt.millisecondsSinceEpoch,
      );
      expect(map['promotedAt'], isNull);
    });

    test('deserializes from Firestore map values', () {
      final createdAt = DateTime.utc(2026, 5, 1, 10);
      final updatedAt = DateTime.utc(2026, 5, 2, 10);
      final promotedAt = DateTime.utc(2026, 5, 3, 10);

      final entry = WaitlistEntry.fromMap(
        {
          'classId': 'classA',
          'studentId': 'studentA',
          'parentId': 'parentA',
          'classType': 'English',
          'day': 'Tuesday',
          'startTime': '17:00',
          'endTime': '18:00',
          'status': 'promoted',
          'reason': 'class_not_open',
          'position': 4,
          'createdAt': Timestamp.fromDate(createdAt),
          'updatedAt': Timestamp.fromDate(updatedAt),
          'promotedAt': Timestamp.fromDate(promotedAt),
        },
        'classA_studentA',
      );

      expect(entry.id, 'classA_studentA');
      expect(entry.classId, 'classA');
      expect(entry.studentId, 'studentA');
      expect(entry.parentId, 'parentA');
      expect(entry.classType, 'English');
      expect(entry.dayOfWeek, 'Tuesday');
      expect(entry.status, WaitlistStatus.promoted);
      expect(entry.reason, WaitlistReason.classNotOpen);
      expect(entry.position, 4);
      expect(entry.createdAt.millisecondsSinceEpoch,
          createdAt.millisecondsSinceEpoch);
      expect(entry.updatedAt.millisecondsSinceEpoch,
          updatedAt.millisecondsSinceEpoch);
      expect(entry.promotedAt?.millisecondsSinceEpoch,
          promotedAt.millisecondsSinceEpoch);
      expect(entry.offeredAt, isNull);
      expect(entry.offerExpiresAt, isNull);
    });
  });
}
