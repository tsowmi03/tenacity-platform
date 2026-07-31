import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/controllers/settings_controller.dart';
import 'package:tenacity/src/services/settings_service.dart';

class _FakeSettingsRepository implements SettingsRepository {
  final List<Completer<Map<String, dynamic>?>> loads = [];
  final List<Completer<void>> writes = [];
  int writeCalls = 0;

  @override
  Future<Map<String, dynamic>?> fetchUserSettings(String userId) {
    final request = Completer<Map<String, dynamic>?>();
    loads.add(request);
    return request.future;
  }

  @override
  Future<void> updateUserSetting(
    String userId,
    String key,
    bool value,
  ) {
    writeCalls++;
    final request = Completer<void>();
    writes.add(request);
    return request.future;
  }
}

void main() {
  test('loads notification preferences for the requested account', () async {
    final repository = _FakeSettingsRepository();
    final controller = SettingsController(settingsService: repository);

    final loading = controller.loadSettings('parent-1');
    repository.loads.single.complete({
      'spotOpened': false,
      'lessonReminder': true,
    });
    await loading;

    expect(controller.loadedUserId, 'parent-1');
    expect(controller.spotOpenedNotif, isFalse);
    expect(controller.lessonReminderNotif, isTrue);
    expect(controller.isLoading, isFalse);
  });

  test('an older settings response cannot replace a newer account', () async {
    final repository = _FakeSettingsRepository();
    final controller = SettingsController(settingsService: repository);

    final oldLoad = controller.loadSettings('old');
    final newLoad = controller.loadSettings('new');
    repository.loads[1].complete({
      'spotOpened': false,
      'lessonReminder': false,
    });
    await newLoad;
    repository.loads[0].complete({
      'spotOpened': true,
      'lessonReminder': true,
    });
    await oldLoad;

    expect(controller.loadedUserId, 'new');
    expect(controller.spotOpenedNotif, isFalse);
    expect(controller.lessonReminderNotif, isFalse);
  });

  test('blocks a duplicate write and changes state after persistence',
      () async {
    final repository = _FakeSettingsRepository();
    final controller = SettingsController(settingsService: repository);
    final loading = controller.loadSettings('parent-1');
    repository.loads.single.complete({});
    await loading;

    final first = controller.updateSetting(
      'parent-1',
      'spotOpened',
      false,
    );
    final duplicate = await controller.updateSetting(
      'parent-1',
      'spotOpened',
      false,
    );

    expect(duplicate, isFalse);
    expect(repository.writeCalls, 1);
    expect(controller.spotOpenedNotif, isTrue);
    repository.writes.single.complete();
    expect(await first, isTrue);
    expect(controller.spotOpenedNotif, isFalse);
  });

  test('a failed write keeps the previous value and exposes an error',
      () async {
    final repository = _FakeSettingsRepository();
    final controller = SettingsController(settingsService: repository);
    final loading = controller.loadSettings('parent-1');
    repository.loads.single.complete({});
    await loading;

    final write = controller.updateSetting(
      'parent-1',
      'lessonReminder',
      false,
    );
    repository.writes.single.completeError(Exception('offline'));

    expect(await write, isFalse);
    expect(controller.lessonReminderNotif, isTrue);
    expect(controller.errorMessage, contains('could not be saved'));
  });
}
