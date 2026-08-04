/// Keeps a background refresh from running more often than it is worth.
///
/// Tabs are kept alive and refresh silently whenever the user returns to them,
/// so without this, flicking between two tabs would fire a full reload every
/// time. A refresh that has just run is not worth repeating.
class RefreshThrottle {
  final Duration minInterval;
  final DateTime Function() _now;

  DateTime? _lastRefreshedAt;

  RefreshThrottle({
    this.minInterval = const Duration(seconds: 30),
    DateTime Function()? now,
  }) : _now = now ?? DateTime.now;

  /// Whether enough time has passed since the last [markRefreshed].
  bool get shouldRefresh {
    final last = _lastRefreshedAt;
    if (last == null) return true;
    return _now().difference(last) >= minInterval;
  }

  /// Records a refresh as having just happened.
  ///
  /// Call this on success only. A failed load that marked itself would lock
  /// out the retry that follows it.
  void markRefreshed() => _lastRefreshedAt = _now();

  /// Forgets the last refresh, so the next [shouldRefresh] is true.
  void reset() => _lastRefreshedAt = null;
}
