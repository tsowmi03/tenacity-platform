import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/chat_model.dart';

void main() {
  group('typing status parsing', _parsing);
  group('Chat.isTypingNow', _expiry);
  group('Chat.otherParticipant', _otherParticipant);
}

final _now = DateTime(2026, 8, 25, 9, 30);

void _parsing() {
  test('reads heartbeat timestamps', () {
    final parsed = parseTypingHeartbeats({'a': Timestamp.fromDate(_now)});

    expect(parsed['a']?.toDate(), _now);
  });

  test('a legacy bool is not read as a heartbeat', () {
    // The two live in separate fields precisely so neither has to interpret
    // the other's shape.
    final parsed = parseTypingHeartbeats({'a': true});

    expect(parsed['a'], isNull);
  });

  test('the legacy field keeps its booleans', () {
    // Still written for one release: clients on the old build cast every value
    // here to bool while mapping the whole inbox snapshot, so a timestamp in
    // this field costs them the inbox, not just the indicator.
    final parsed = parseLegacyTypingStatus({'a': true, 'b': false});

    expect(parsed['a'], isTrue);
    expect(parsed['b'], isFalse);
  });

  test('a timestamp in the legacy field is ignored rather than thrown on', () {
    expect(parseLegacyTypingStatus({'a': Timestamp.fromDate(_now)}), isEmpty);
  });

  test('both parsers survive a missing or malformed field', () {
    expect(parseTypingHeartbeats(null), isEmpty);
    expect(parseTypingHeartbeats('nonsense'), isEmpty);
    expect(parseTypingHeartbeats({7: Timestamp.fromDate(_now)}), isEmpty);
    expect(parseLegacyTypingStatus(null), isEmpty);
    expect(parseLegacyTypingStatus('nonsense'), isEmpty);
  });
}

void _expiry() {
  test('a fresh heartbeat reads as typing', () {
    final chat = _chat({'them': _now.subtract(const Duration(seconds: 1))});

    expect(chat.isTypingNow('them', _now), isTrue);
  });

  test('a heartbeat inside the window still reads as typing', () {
    final chat = _chat({
      'them': _now.subtract(typingHeartbeatTtl - const Duration(seconds: 1)),
    });

    expect(chat.isTypingNow('them', _now), isTrue);
  });

  test('a heartbeat past the window has expired', () {
    final chat = _chat({
      'them': _now.subtract(typingHeartbeatTtl + const Duration(seconds: 1)),
    });

    // The whole point: nobody has to write anything for this to become false.
    expect(chat.isTypingNow('them', _now), isFalse);
  });

  test('the window is wider than two heartbeats', () {
    // Otherwise a single dropped write blinks the indicator off underneath
    // somebody who is still typing.
    expect(typingHeartbeatTtl, greaterThan(typingHeartbeatInterval * 2));
  });

  test('a client stops claiming before its own heartbeat expires', () {
    // So the ordinary path is an explicit stop and the TTL stays a backstop.
    expect(typingIdleTimeout, lessThan(typingHeartbeatTtl));
  });

  test('an absent heartbeat is not typing', () {
    expect(_chat({}).isTypingNow('them', _now), isFalse);
  });

  test('a legacy `true` flag does not drive the indicator', () {
    // An old client can still strand one of these, and it cannot be aged out.
    // Honouring it would put the permanently-stuck indicator back on screen,
    // which is the whole complaint.
    final chat = Chat(
      id: 'chat-1',
      participants: const ['me', 'them'],
      lastMessage: '',
      updatedAt: Timestamp.fromDate(_now),
      unreadCounts: const {},
      deletedFor: const {},
      typingStatus: const {'them': true},
    );

    expect(chat.isTypingNow('them', _now), isFalse);
  });

  test('a heartbeat stamped in the future is bounded, not trusted forever', () {
    // Server timestamps and a skewed device clock can disagree. Treating the
    // gap as a magnitude keeps a fast device from showing "typing" until the
    // skew elapses.
    final chat = _chat({'them': _now.add(const Duration(days: 1))});

    expect(chat.isTypingNow('them', _now), isFalse);
  });
}

void _otherParticipant() {
  test('finds the other side of a one-to-one thread', () {
    expect(_chat({}).otherParticipant('me'), 'them');
  });

  test('returns null when nobody else is on the thread', () {
    final chat = Chat(
      id: 'c',
      participants: const ['me'],
      lastMessage: '',
      updatedAt: Timestamp.fromDate(_now),
      unreadCounts: const {},
      deletedFor: const {},
      typingStatus: const {},
    );

    expect(chat.otherParticipant('me'), isNull);
  });
}

Chat _chat(Map<String, DateTime> typing) {
  return Chat(
    id: 'chat-1',
    participants: const ['me', 'them'],
    lastMessage: '',
    updatedAt: Timestamp.fromDate(_now),
    unreadCounts: const {},
    deletedFor: const {},
    typingStatus: const {},
    typingHeartbeats: typing.map(
      (key, value) => MapEntry(key, Timestamp.fromDate(value)),
    ),
  );
}
