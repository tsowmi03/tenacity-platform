import 'package:flutter/material.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/ui/messaging/inbox_data.dart';

/// One person the current user may start a conversation with.
@immutable
class ContactRowData {
  final String uid;
  final String name;
  final String roleLabel;
  final String initials;

  const ContactRowData({
    required this.uid,
    required this.name,
    required this.roleLabel,
    required this.initials,
  });
}

/// Contacts of one kind, under a section label.
@immutable
class ContactSection {
  final String title;
  final List<ContactRowData> contacts;

  const ContactSection({required this.title, required this.contacts});
}

const _teamSectionTitle = 'TENACITY TEAM';
const _parentsSectionTitle = 'PARENTS';

/// Filters and groups the contact list into the sections the picker renders.
///
/// Pure, and it owns the search rather than deferring to
/// `UsersController.filterUsers`. That method mutates a list held on the
/// app-scoped controller, so a query typed here outlived the screen: closing
/// the picker reset its search box but not the filter behind it, and reopening
/// showed the previous search's results under an empty box. It also meant a
/// search here silently re-filtered the admin user list, and vice versa.
///
/// Three rules are enforced here rather than in the view:
///
/// - Parents never see other parents. This is the existing parent-to-parent
///   contact restriction from `UI_REQUIREMENTS.md`, not a display choice.
/// - Nobody sees themselves. The underlying list is every parent plus every
///   tutor, so a tutor or admin previously found their own name in it and
///   could open a conversation with themselves.
/// - A parent matches on their children's names too, so staff can find a
///   family by the student they teach. [studentsByParentId] is the
///   controller's `parentStudents` map; an absent entry simply means that
///   parent matches on their own name alone.
List<ContactSection> buildContactSections({
  required List<AppUser> users,
  required String? currentUserRole,
  required String currentUserId,
  Map<String, List<Student>> studentsByParentId = const {},
  String query = '',
}) {
  final viewerIsParent = currentUserRole?.toLowerCase() == 'parent';
  final trimmedQuery = query.trim().toLowerCase();

  final team = <ContactRowData>[];
  final parents = <ContactRowData>[];

  for (final user in users) {
    if (user.uid == currentUserId) continue;

    final role = user.role.toLowerCase();
    final isParent = role == 'parent';
    if (isParent && viewerIsParent) continue;

    if (!_matches(
      user: user,
      query: trimmedQuery,
      students: isParent ? studentsByParentId[user.uid] : null,
    )) {
      continue;
    }

    final row = _rowFor(user);
    if (isParent) {
      parents.add(row);
    } else {
      team.add(row);
    }
  }

  int byName(ContactRowData a, ContactRowData b) =>
      a.name.toLowerCase().compareTo(b.name.toLowerCase());
  team.sort(byName);
  parents.sort(byName);

  return [
    if (team.isNotEmpty)
      ContactSection(title: _teamSectionTitle, contacts: team),
    if (parents.isNotEmpty)
      ContactSection(title: _parentsSectionTitle, contacts: parents),
  ];
}

/// Total across every section, for the header count.
int contactCount(List<ContactSection> sections) =>
    sections.fold(0, (sum, section) => sum + section.contacts.length);

/// Matches on the person's name, their role, and — for a parent — their
/// children's names. Mirrors the rules `UsersController.filterUsers` applies
/// for the admin user list, so the same query finds the same people in both.
bool _matches({
  required AppUser user,
  required String query,
  required List<Student>? students,
}) {
  if (query.isEmpty) return true;

  final fullName = '${user.firstName} ${user.lastName}'.toLowerCase();
  if (fullName.contains(query)) return true;
  if (user.role.toLowerCase().contains(query)) return true;

  return students?.any((student) => '${student.firstName} ${student.lastName}'
          .toLowerCase()
          .contains(query)) ??
      false;
}

ContactRowData _rowFor(AppUser user) {
  final name = '${user.firstName} ${user.lastName}'.trim();
  final displayName = name.isEmpty ? 'Unknown' : name;

  return ContactRowData(
    uid: user.uid,
    name: displayName,
    roleLabel: roleLabelFor(user.role),
    initials: initialsFor(displayName),
  );
}

/// `tutor` reads as `Tutor`. An unrecognised role is shown as stored rather
/// than hidden, so a new role is visible instead of silently blank.
String roleLabelFor(String role) {
  final trimmed = role.trim();
  if (trimmed.isEmpty) return '';
  return trimmed[0].toUpperCase() + trimmed.substring(1).toLowerCase();
}
