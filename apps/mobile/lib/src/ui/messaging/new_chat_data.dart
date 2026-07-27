import 'package:flutter/material.dart';
import 'package:tenacity/src/models/app_user_model.dart';
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

/// Groups the contact list into the sections the picker renders.
///
/// Pure, so the role restrictions are testable without Firestore. [users] is
/// the controller's already-filtered list — the search itself stays there
/// because it also matches a parent's students by name, which needs data this
/// function does not have.
///
/// Two rules are enforced here rather than in the view:
///
/// - Parents never see other parents. This is the existing parent-to-parent
///   contact restriction from `UI_REQUIREMENTS.md`, not a display choice.
/// - Nobody sees themselves. The underlying list is every parent plus every
///   tutor, so a tutor or admin previously found their own name in it and
///   could open a conversation with themselves.
List<ContactSection> buildContactSections({
  required List<AppUser> users,
  required String? currentUserRole,
  required String currentUserId,
}) {
  final viewerIsParent = currentUserRole?.toLowerCase() == 'parent';

  final team = <ContactRowData>[];
  final parents = <ContactRowData>[];

  for (final user in users) {
    if (user.uid == currentUserId) continue;

    final role = user.role.toLowerCase();
    final isParent = role == 'parent';
    if (isParent && viewerIsParent) continue;

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
