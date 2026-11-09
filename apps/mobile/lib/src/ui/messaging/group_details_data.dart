import 'package:flutter/material.dart';
import 'package:tenacity/src/models/chat_model.dart';
import 'package:tenacity/src/ui/messaging/inbox_data.dart';
import 'package:tenacity/src/ui/messaging/new_chat_data.dart';

/// The most people a group can hold. Mirrors `MAX_GROUP_MEMBERS` in the
/// functions package, which refuses anything larger.
const maxGroupMembers = maxGroupPicks + 1;

/// Mirrors `MAX_GROUP_NAME_LENGTH` in the functions package.
const maxGroupNameLength = 60;

/// One current member of a group, ready to render.
@immutable
class GroupMemberRowData {
  final String uid;
  final String name;
  final String initials;
  final bool isYou;
  final bool canRemove;

  const GroupMemberRowData({
    required this.uid,
    required this.name,
    required this.initials,
    required this.isYou,
    required this.canRemove,
  });
}

/// Everyone in [chat]: the viewer first, then the others by name.
///
/// Nobody can remove themselves, since leaving is its own action, and a group
/// of two cannot lose anyone else.
List<GroupMemberRowData> buildGroupMemberRows({
  required Chat chat,
  required String viewerId,
  required bool canManageMembers,
}) {
  final canRemoveOthers = canManageMembers && chat.participants.length > 2;
  final rows = [
    for (final uid in chat.participants)
      GroupMemberRowData(
        uid: uid,
        name: chat.memberFullName(uid),
        initials: initialsFor(chat.memberFullName(uid)),
        isYou: uid == viewerId,
        canRemove: canRemoveOthers && uid != viewerId,
      ),
  ];
  rows.sort((a, b) {
    if (a.isYou != b.isYou) return a.isYou ? -1 : 1;
    return a.name.toLowerCase().compareTo(b.name.toLowerCase());
  });
  return rows;
}

/// How many more people [chat] has room for.
int remainingGroupPlaces(Chat chat) =>
    (maxGroupMembers - chat.participants.length).clamp(0, maxGroupMembers);
