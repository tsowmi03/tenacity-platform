import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/services/chat_service.dart';

void main() {
  test(
      'an empty cache cannot erase history; a confirmed empty server result can',
      () {
    expect(shouldPublishMessageSnapshot(hasMessages: false, isFromCache: true),
        isFalse);
    expect(shouldPublishMessageSnapshot(hasMessages: true, isFromCache: true),
        isTrue);
    expect(shouldPublishMessageSnapshot(hasMessages: false, isFromCache: false),
        isTrue);
  });
}
