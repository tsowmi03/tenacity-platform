import 'dart:io';
import 'package:firebase_storage/firebase_storage.dart';

class StorageService {
  final FirebaseStorage _storage = FirebaseStorage.instance;

  Future<String> uploadImage(File imageFile, String path) async {
    final ref = _storage.ref().child(path);
    final uploadTask = ref.putFile(imageFile);

    // Listen to snapshot events
    uploadTask.snapshotEvents.listen((event) {
      print("Bytes transferred: ${event.bytesTransferred}/${event.totalBytes}");
    }, onError: (error) {
      print("Upload error: $error");
    });

    // Wait for the upload to complete
    final snapshot = await uploadTask;
    print("Upload completed. Getting download URL...");

    final downloadUrl = await snapshot.ref.getDownloadURL();
    print("Download URL: $downloadUrl");
    return downloadUrl;
  }

}
