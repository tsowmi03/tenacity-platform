import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/services/audit_service.dart';

void main() {
  group('AuditService helpers', () {
    test('builds readable class and invoice target names', () {
      const classModel = ClassModel(
        id: 'classA',
        type: 'Maths',
        dayOfWeek: 'Monday',
        startTime: '16:00',
        endTime: '17:00',
        capacity: 8,
        enrolledStudents: [],
        tutors: [],
      );

      expect(
        AuditService.classTargetName(classModel),
        'Maths · Monday · 16:00',
      );
      expect(
        AuditService.invoiceTargetName(
          invoiceId: 'abcdef123456',
          invoiceNumber: '1042',
        ),
        'Invoice 1042',
      );
      expect(
        AuditService.invoiceTargetName(invoiceId: 'abcdef123456'),
        'Invoice abcdef',
      );
    });

    test('returns only changed fields', () {
      final changed = AuditService.changedFields(
        {
          'firstName': 'Jane',
          'lastName': 'Smith',
          'phone': '0400000000',
        },
        {
          'firstName': 'Jane',
          'lastName': 'Doe',
          'phone': '0411000000',
        },
      );

      expect(changed, ['lastName', 'phone']);
    });
  });
}
