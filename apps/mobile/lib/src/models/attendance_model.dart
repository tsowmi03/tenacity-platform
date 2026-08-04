import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

/// What the roll recorded for one student.
///
/// Stored as a stable string rather than an index, so reordering the values
/// cannot silently reinterpret existing records.
enum RollMark {
  here('here'),
  away('away');

  final String value;

  const RollMark(this.value);

  static RollMark? fromValue(Object? value) {
    for (final mark in RollMark.values) {
      if (mark.value == value) return mark;
    }
    // An unrecognised value is dropped rather than guessed at — a newer client
    // may have written a mark this build does not know about.
    return null;
  }
}

@immutable
class Attendance {
  final String id;
  final DateTime date;
  final String termId;
  final bool cancelled;
  final DateTime updatedAt;
  final String updatedBy;
  final int weekNumber;

  /// Who is booked into this session — the permanent roster for the week, plus
  /// one-off visitors, minus one-off cancellations.
  ///
  /// This is a booking record, not an attendance record. Capacity, one-off
  /// eligibility, the family's own timetable and the backend's lesson
  /// reminders all read it as "who is expected". A student marked away in
  /// [marks] stays in this list: the booking is history, the mark is the
  /// record.
  final List<String> attendance;

  final List<String> tutors;

  /// What the roll recorded, keyed by student id.
  ///
  /// Separate from [attendance] because the two answer different questions,
  /// and conflating them meant marking a student away un-booked them — freeing
  /// a seat that was not really free and firing a "removed from class" alert
  /// at admins. Empty on documents written before marks existed, and on any
  /// session nobody has started marking.
  ///
  /// Written a key at a time (`marks.<studentId>`), so two tutors working
  /// through opposite halves of the same class merge instead of overwriting
  /// each other.
  final Map<String, RollMark> marks;

  /// When a tutor or admin confirmed this session's roll, and who.
  ///
  /// Attribution only. Completeness itself is derived from [marks] covering
  /// the roster — see [isRollCompleteFor] — because a stamp can go stale when
  /// an admin adds a student to a class after the roll was marked. The stamp
  /// remains the sole evidence for documents written before marks existed and
  /// not yet backfilled.
  final DateTime? rollCompletedAt;
  final String? rollCompletedBy;

  const Attendance({
    required this.id,
    required this.date,
    required this.termId,
    required this.cancelled,
    required this.updatedAt,
    required this.updatedBy,
    required this.weekNumber,
    required this.attendance,
    required this.tutors,
    this.marks = const {},
    this.rollCompletedAt,
    this.rollCompletedBy,
  });

  factory Attendance.fromMap(Map<String, dynamic> data, String documentId) {
    final rollCompletedAt = data['rollCompletedAt'];

    return Attendance(
      id: documentId,
      date: (data['date'] as Timestamp).toDate(),
      termId: data['termId'],
      cancelled: (data['cancelled'] as bool?) ?? false,
      updatedAt: (data['updatedAt'] as Timestamp).toDate(),
      updatedBy: data['updatedBy'],
      weekNumber: _weekNumberFrom(data, documentId),
      attendance: List<String>.from(data['attendance'] ?? []),
      tutors: List<String>.from(data['tutors'] ?? []),
      marks: _marksFrom(data['marks']),
      rollCompletedAt:
          rollCompletedAt is Timestamp ? rollCompletedAt.toDate() : null,
      rollCompletedBy: data['rollCompletedBy'] as String?,
    );
  }

  /// The session's week, from whichever field carries it.
  ///
  /// This used to be `data['weekNum'] ?? 0`, which quietly corrupted data.
  /// Two write paths disagreed on the name — the scheduled term rollover wrote
  /// `weekNumber`, the class-creation callable wrote `weekNum` — so for every
  /// rollover-created session this read 0. [toMap] then wrote that 0 straight
  /// back on the next admin roster edit, and 148 production documents ended up
  /// permanently claiming week 0.
  ///
  /// Both names are read, and the document id is the last resort: it is
  /// `{termId}_W{week}` under every write path without exception. Zero is
  /// never returned unless nothing at all can be derived, so the old value can
  /// no longer be silently re-persisted.
  static int _weekNumberFrom(Map<String, dynamic> data, String documentId) {
    final fromWeekNum = _positiveInt(data['weekNum']);
    if (fromWeekNum != null) return fromWeekNum;

    final fromWeekNumber = _positiveInt(data['weekNumber']);
    if (fromWeekNumber != null) return fromWeekNumber;

    final match = RegExp(r'_W(\d+)$').firstMatch(documentId);
    if (match != null) {
      final parsed = _positiveInt(int.tryParse(match.group(1)!));
      if (parsed != null) return parsed;
    }

    return 0;
  }

  static int? _positiveInt(Object? value) {
    if (value is int && value > 0) return value;
    return null;
  }

  static Map<String, RollMark> _marksFrom(Object? raw) {
    if (raw is! Map) return const {};

    return {
      for (final entry in raw.entries)
        if (entry.key is String && RollMark.fromValue(entry.value) != null)
          entry.key as String: RollMark.fromValue(entry.value)!,
    };
  }

  /// Whether anyone has started marking this roll.
  ///
  /// The completion stamp is honoured too, so a roll marked before [marks]
  /// existed does not read as untouched.
  bool get hasRoll => marks.isNotEmpty || rollCompletedAt != null;

  /// Whether every student in [rosterIds] carries a mark.
  ///
  /// Derived rather than stamped: a partial save can no longer claim the roll
  /// is finished, and adding a student to the class reopens it automatically.
  /// Falls back to the stamp only when there are no marks at all, which is a
  /// document from before marks existed.
  bool isRollCompleteFor(Iterable<String> rosterIds) {
    if (marks.isEmpty) return rollCompletedAt != null;

    final ids = rosterIds.toSet();
    if (ids.isEmpty) return rollCompletedAt != null;

    return ids.every(marks.containsKey);
  }

  /// How many of [rosterIds] were marked here.
  ///
  /// Falls back to the booking list for a stamped document with no marks,
  /// where — before this split existed — the list *was* the record of who
  /// turned up.
  int hereCountFor(Iterable<String> rosterIds) {
    final ids = rosterIds.toSet();

    if (marks.isEmpty) {
      return attendance.where(ids.contains).length;
    }

    return ids.where((id) => marks[id] == RollMark.here).length;
  }

  Map<String, dynamic> toMap() {
    return {
      'date': Timestamp.fromDate(date),
      'termId': termId,
      'cancelled': cancelled,
      'updatedAt': Timestamp.fromDate(updatedAt),
      'updatedBy': updatedBy,
      'weekNum': weekNumber,
      'attendance': attendance,
      'tutors': tutors,
      // Written even when null, so reopening a roll clears the stamp rather
      // than leaving a stale one behind.
      'rollCompletedAt':
          rollCompletedAt == null ? null : Timestamp.fromDate(rollCompletedAt!),
      'rollCompletedBy': rollCompletedBy,
      // `marks` is deliberately absent. Callers pass this map straight to
      // `update()` when an admin edits a session's roster, and a whole-map
      // write would undo any mark a tutor set in the meantime. Marks are
      // written a key at a time by TutorSessionService and nowhere else.
    };
  }

  Attendance copyWith({
    String? id,
    DateTime? date,
    String? termId,
    bool? cancelled,
    DateTime? updatedAt,
    String? updatedBy,
    int? weekNumber,
    List<String>? attendance,
    List<String>? tutors,
    Map<String, RollMark>? marks,
    DateTime? rollCompletedAt,
    String? rollCompletedBy,
  }) {
    return Attendance(
      id: id ?? this.id,
      date: date ?? this.date,
      termId: termId ?? this.termId,
      cancelled: cancelled ?? this.cancelled,
      updatedAt: updatedAt ?? this.updatedAt,
      updatedBy: updatedBy ?? this.updatedBy,
      weekNumber: weekNumber ?? this.weekNumber,
      attendance: attendance ?? this.attendance,
      tutors: tutors ?? this.tutors,
      marks: marks ?? this.marks,
      rollCompletedAt: rollCompletedAt ?? this.rollCompletedAt,
      rollCompletedBy: rollCompletedBy ?? this.rollCompletedBy,
    );
  }
}
