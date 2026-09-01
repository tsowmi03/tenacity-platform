import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:path_provider/path_provider.dart';

import 'chat_outbox.dart';
import 'storage_service.dart';

/// Owns the file half of sending an attachment: keeping a copy the app
/// controls, and putting it in storage.
///
/// This used to live in [ChatScreen], which meant an upload belonged to a
/// widget: leaving the thread mid-upload abandoned the file and left the
/// uploaded blob behind with no message pointing at it (MOB-37). It sits here
/// so [ChatOutbox] can own it instead, and so a test can stand in for it.
class ChatMediaStore {
  ChatMediaStore({StorageService? storageService})
      : _injectedStorage = storageService;

  final StorageService? _injectedStorage;
  StorageService? _storageService;

  /// Built on first use, never in the constructor.
  ///
  /// [StorageService] resolves `FirebaseStorage.instance` in a field
  /// initialiser, so constructing one where there is no Firebase — a widget
  /// test, for instance — throws before anything has been asked of it. This
  /// class is held as a field on the chat screen, so that would be every chat
  /// widget test. Same reasoning as [ChatOutbox]'s lazy [ChatService].
  StorageService get _storage =>
      _injectedStorage ?? (_storageService ??= StorageService());

  /// The directory holding copies of files waiting to be sent.
  ///
  /// Under the app's documents directory rather than its cache: a cache is the
  /// first thing the system reclaims under pressure, and a queued attachment
  /// has to outlive that.
  static Future<Directory> outboxDirectory() async {
    final documents = await getApplicationDocumentsDirectory();
    final directory = Directory('${documents.path}/chat_outbox');
    if (!await directory.exists()) await directory.create(recursive: true);
    return directory;
  }

  /// Copies [source] somewhere the app owns, named after [messageId].
  ///
  /// The picker hands back a path in a temporary directory that the system may
  /// clear whenever it likes, so queueing that path would produce an entry
  /// whose file can evaporate before it is ever sent.
  Future<File> keepCopy(File source, String messageId) async {
    final directory = await outboxDirectory();
    final extension = _extensionOf(source.path);
    return source.copy('${directory.path}/$messageId$extension');
  }

  /// Uploads [entry]'s file and answers where it landed.
  ///
  /// An image is compressed and gets a thumbnail; anything else goes up as it
  /// is. The names are derived from the message id rather than the clock, so a
  /// retry of the same entry overwrites its own upload instead of leaving a
  /// second copy behind.
  Future<UploadedMedia> upload(OutboxEntry entry) async {
    final path = entry.localPath;
    if (path == null) {
      throw StateError('Outbox entry ${entry.id} has no file to upload.');
    }

    final file = File(path);
    if (!await file.exists()) {
      throw StateError('The file for message ${entry.id} is no longer there.');
    }

    if (entry.messageType != 'image') {
      final name = entry.fileName ?? '${entry.id}${_extensionOf(path)}';
      final url =
          await _storage.uploadImage(file, 'chatFiles/${entry.id}_$name');
      return UploadedMedia(mediaUrl: url);
    }

    final compressed = await _compress(file, quality: 75, minDimension: 1080);
    final thumbnail = await _compress(file, quality: 25, minDimension: 200);

    final mediaUrl =
        await _storage.uploadImage(compressed, 'chatImages/${entry.id}.jpg');
    final thumbnailUrl = await _storage.uploadImage(
      thumbnail,
      'chatImages/thumb_${entry.id}.jpg',
    );

    return UploadedMedia(mediaUrl: mediaUrl, thumbnailUrl: thumbnailUrl);
  }

  Future<File> _compress(
    File file, {
    required int quality,
    required int minDimension,
  }) async {
    final directory = await getTemporaryDirectory();
    final target = '${directory.absolute.path}/'
        '${quality}_${DateTime.now().millisecondsSinceEpoch}.jpg';

    final XFile? result = await FlutterImageCompress.compressAndGetFile(
      file.absolute.path,
      target,
      quality: quality,
      minWidth: minDimension,
      minHeight: minDimension,
    );
    // Compression is an optimisation, not a requirement: sending the original
    // is better than not sending it.
    if (result == null) {
      debugPrint('[ChatMediaStore] compression failed; sending the original');
      return file;
    }
    return File(result.path);
  }

  static String _extensionOf(String path) {
    final lastDot = path.lastIndexOf('.');
    final lastSlash = path.lastIndexOf('/');
    if (lastDot <= lastSlash || lastDot == -1) return '';
    return path.substring(lastDot);
  }
}
