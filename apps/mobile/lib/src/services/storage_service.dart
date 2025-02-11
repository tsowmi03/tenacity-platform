// storage_service.dart
import 'dart:io';
import 'package:firebase_storage/firebase_storage.dart';

class StorageService {
  final FirebaseStorage _storage = FirebaseStorage.instance;

  /// Uploads [imageFile] to Firebase Storage at [path].
  /// Returns the download URL of the uploaded file.
  Future<String> uploadImage(File imageFile, String path) async {
    // Create a reference in Firebase Storage
    final ref = _storage.ref().child(path);
    // Start upload
    final uploadTask = ref.putFile(imageFile);

    // Optionally listen for progress:
    uploadTask.snapshotEvents.listen((snapshot) {
      print(
        "Bytes transferred: ${snapshot.bytesTransferred}/${snapshot.totalBytes}",
      );
    }, onError: (error) {
      print("Upload error: $error");
    });

    // Wait for completion
    final snapshot = await uploadTask;
    print("Upload completed. Getting download URL...");

    // Get the download URL
    final downloadUrl = await snapshot.ref.getDownloadURL();
    print("Download URL: $downloadUrl");
    return downloadUrl;
  }
}
