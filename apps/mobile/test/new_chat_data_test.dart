import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/models/tutor_model.dart';
import 'package:tenacity/src/ui/messaging/new_chat_data.dart';

Tutor _tutor({
  required String uid,
  required String firstName,
  String lastName = 'Doe',
  String role = 'tutor',
}) {
  return Tutor(
    uid: uid,
    role: role,
    firstName: firstName,
    lastName: lastName,
    email: '$uid@example.com',
    fcmTokens: const [],
    phone: '',
    unreadChats: const {},
    activeChats: const [],
  );
}

Parent _parent({
  required String uid,
  required String firstName,
  String lastName = 'Smith',
}) {
  return Parent(
    uid: uid,
    firstName: firstName,
    lastName: lastName,
    email: '$uid@example.com',
    fcmTokens: const [],
    students: const [],
    phone: '',
    unreadChats: const {},
    activeChats: const [],
  );
}

void main() {
  group('buildContactSections', () {
    test('a parent sees the team but never another parent', () {
      final sections = buildContactSections(
        users: [
          _tutor(uid: 't1', firstName: 'Alice'),
          _parent(uid: 'p2', firstName: 'Bob'),
          _tutor(uid: 'a1', firstName: 'Cara', role: 'admin'),
        ],
        currentUserRole: 'parent',
        currentUserId: 'p1',
      );

      expect(sections.length, 1);
      expect(sections.single.title, 'TENACITY TEAM');
      expect(
        sections.single.contacts.map((c) => c.name),
        ['Alice Doe', 'Cara Doe'],
      );
    });

    test('an admin sees the team and parents in separate sections', () {
      final sections = buildContactSections(
        users: [
          _parent(uid: 'p1', firstName: 'Bob'),
          _tutor(uid: 't1', firstName: 'Alice'),
        ],
        currentUserRole: 'admin',
        currentUserId: 'a1',
      );

      expect(sections.map((s) => s.title), ['TENACITY TEAM', 'PARENTS']);
      expect(sections.first.contacts.single.name, 'Alice Doe');
      expect(sections.last.contacts.single.name, 'Bob Smith');
    });

    test('nobody is offered a conversation with themselves', () {
      // The underlying list is every parent plus every tutor, so a tutor used
      // to find their own name in it.
      final sections = buildContactSections(
        users: [
          _tutor(uid: 't1', firstName: 'Alice'),
          _tutor(uid: 't2', firstName: 'Blake'),
        ],
        currentUserRole: 'tutor',
        currentUserId: 't1',
      );

      expect(sections.single.contacts.map((c) => c.uid), ['t2']);
    });

    test('sorts by name within a section, ignoring case', () {
      final sections = buildContactSections(
        users: [
          _tutor(uid: 't1', firstName: 'zoe'),
          _tutor(uid: 't2', firstName: 'Adam'),
          _tutor(uid: 't3', firstName: 'mia'),
        ],
        currentUserRole: 'admin',
        currentUserId: 'a1',
      );

      expect(
        sections.single.contacts.map((c) => c.name),
        ['Adam Doe', 'mia Doe', 'zoe Doe'],
      );
    });

    test('omits a section with no one in it', () {
      final sections = buildContactSections(
        users: [_parent(uid: 'p1', firstName: 'Bob')],
        currentUserRole: 'admin',
        currentUserId: 'a1',
      );

      expect(sections.map((s) => s.title), ['PARENTS']);
    });

    test('carries initials and a readable role label', () {
      final sections = buildContactSections(
        users: [_tutor(uid: 't1', firstName: 'Alice', lastName: 'Nguyen')],
        currentUserRole: 'parent',
        currentUserId: 'p1',
      );

      final contact = sections.single.contacts.single;
      expect(contact.initials, 'AN');
      expect(contact.roleLabel, 'Tutor');
    });

    test('falls back rather than rendering a blank identity', () {
      final sections = buildContactSections(
        users: <AppUser>[
          _tutor(uid: 't1', firstName: '', lastName: '', role: ''),
        ],
        currentUserRole: 'parent',
        currentUserId: 'p1',
      );

      final contact = sections.single.contacts.single;
      expect(contact.name, 'Unknown');
      expect(contact.initials, 'U');
      expect(contact.roleLabel, '');
    });
  });

  group('contactCount', () {
    test('totals every section', () {
      final sections = buildContactSections(
        users: [
          _tutor(uid: 't1', firstName: 'Alice'),
          _parent(uid: 'p1', firstName: 'Bob'),
          _parent(uid: 'p2', firstName: 'Cara'),
        ],
        currentUserRole: 'admin',
        currentUserId: 'a1',
      );

      expect(contactCount(sections), 3);
    });

    test('is zero when there is nobody to message', () {
      expect(contactCount(const []), 0);
    });
  });

  group('roleLabelFor', () {
    test('capitalises a known role', () {
      expect(roleLabelFor('tutor'), 'Tutor');
      expect(roleLabelFor('ADMIN'), 'Admin');
    });

    test('shows an unrecognised role rather than hiding it', () {
      expect(roleLabelFor('coordinator'), 'Coordinator');
    });
  });
}
