import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';

class ConnectivityController extends ChangeNotifier {
  ConnectivityController({Connectivity? connectivity})
      : _connectivity = connectivity ?? Connectivity();

  final Connectivity _connectivity;
  StreamSubscription<List<ConnectivityResult>>? _subscription;

  bool _isOffline = false;
  bool _hasCheckedConnectivity = false;
  DateTime? _lastChangedAt;

  bool get isOffline => _isOffline;
  bool get isOnline => !_isOffline;
  bool get hasCheckedConnectivity => _hasCheckedConnectivity;
  DateTime? get lastChangedAt => _lastChangedAt;

  Future<void> initialize() async {
    await refresh();
    _subscription ??=
        _connectivity.onConnectivityChanged.listen(_handleConnectivityChange);
  }

  Future<void> refresh() async {
    try {
      final results = await _connectivity.checkConnectivity();
      _handleConnectivityChange(results);
    } catch (e) {
      debugPrint('Error checking connectivity: $e');
    } finally {
      if (!_hasCheckedConnectivity) {
        _hasCheckedConnectivity = true;
        notifyListeners();
      }
    }
  }

  void _handleConnectivityChange(List<ConnectivityResult> results) {
    final isOffline = results.isEmpty ||
        results.every((result) => result == ConnectivityResult.none);

    if (_isOffline == isOffline && _hasCheckedConnectivity) return;

    _isOffline = isOffline;
    _hasCheckedConnectivity = true;
    _lastChangedAt = DateTime.now();
    notifyListeners();
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }
}
