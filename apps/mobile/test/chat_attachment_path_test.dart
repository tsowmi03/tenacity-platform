import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/services/chat_media.dart';
import 'package:tenacity/src/services/chat_outbox.dart';
import 'package:tenacity/src/services/storage_service.dart';

/// Answers every upload, and remembers where it was asked to put the file.
class _RecordingStorage extends StorageService {
  final List<String> paths = <String>[];

  @override
  Future<String> uploadImage(File file, String path) async {
    paths.add(path);
    return 'https://storage.test/$path';
  }
}

/// Where an attachment lands is a security boundary, not a naming detail: the
/// Storage rules authorise a write by comparing the uid in the path against the
/// caller. A path that loses its uid segment is one no rule can check, which is
/// how chat uploads came to be permitted only by a catch-all (TP-21).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory workspace;
  late _RecordingStorage storage;
  late ChatMediaStore media;

  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  const pathProvider = MethodChannel('plugins.flutter.io/path_provider');

  setUp(() async {
    workspace = await Directory.systemTemp.createTemp('chat_attachment_path');
    storage = _RecordingStorage();
    media = ChatMediaStore(storageService: storage);

    // The image compressor has no implementation off-device and throws, which
    // ChatMediaStore treats as "compression declined" and uploads the original
    // for — all this test needs, since it asserts paths rather than image
    // quality. It still asks for a temporary directory first, so that one
    // plugin does have to answer.
    messenger.setMockMethodCallHandler(
      pathProvider,
      (call) async => workspace.path,
    );
  });

  tearDown(() async {
    messenger.setMockMethodCallHandler(pathProvider, null);
    if (await workspace.exists()) await workspace.delete(recursive: true);
  });

  Future<OutboxEntry> entry({
    required String id,
    required String senderId,
    required String messageType,
    required String fileName,
  }) async {
    final file = File('${workspace.path}/$fileName');
    await file.writeAsBytes(const [1, 2, 3, 4]);

    return OutboxEntry(
      id: id,
      chatId: 'chat-1',
      senderId: senderId,
      createdAt: DateTime.now(),
      kind: OutboxKind.media,
      messageType: messageType,
      localPath: file.path,
      fileName: messageType == 'image' ? null : fileName,
    );
  }

  test('an image and its thumbnail go under the sender own uid', () async {
    final photo = await entry(
      id: 'msg-1',
      senderId: 'user-1',
      messageType: 'image',
      fileName: 'photo.jpg',
    );

    final result = await media.upload(photo);

    expect(storage.paths, [
      'chatImages/user-1/msg-1.jpg',
      'chatImages/user-1/thumb_msg-1.jpg',
    ]);
    expect(result.mediaUrl, contains('chatImages/user-1/msg-1.jpg'));
    expect(result.thumbnailUrl, isNotNull);
  });

  test('a file goes under the sender own uid', () async {
    final document = await entry(
      id: 'msg-2',
      senderId: 'user-2',
      messageType: 'file',
      fileName: 'notes.pdf',
    );

    await media.upload(document);

    expect(storage.paths, ['chatFiles/user-2/msg-2_notes.pdf']);
  });

  test('the prefix is the sender, not the message it belongs to', () async {
    final mine = await entry(
      id: 'shared-id',
      senderId: 'user-1',
      messageType: 'image',
      fileName: 'mine.jpg',
    );
    final theirs = await entry(
      id: 'shared-id',
      senderId: 'user-2',
      messageType: 'image',
      fileName: 'theirs.jpg',
    );

    await media.upload(mine);
    await media.upload(theirs);

    // Two senders, one message id: the uid is what separates them, so a rule
    // comparing it against the caller can tell the two writes apart.
    expect(storage.paths, [
      'chatImages/user-1/shared-id.jpg',
      'chatImages/user-1/thumb_shared-id.jpg',
      'chatImages/user-2/shared-id.jpg',
      'chatImages/user-2/thumb_shared-id.jpg',
    ]);
  });
}
