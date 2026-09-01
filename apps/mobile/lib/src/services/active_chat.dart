/// Which chat thread the user is currently looking at, if any.
///
/// A plain static holder rather than a provider because its most important
/// reader has no `BuildContext` to look anything up with: [NotificationService]
/// is a singleton listening to a `FirebaseMessaging` stream, and it has to
/// decide whether to raise a banner long before any widget is involved.
///
/// Open is not the same as mounted. [ChatScreen] keeps its state while the app
/// is backgrounded, but a message arriving then is not one the user has seen —
/// so the claim is given up on the way out of the foreground and taken again on
/// the way back.
class ActiveChat {
  ActiveChat._();

  static String? _chatId;

  /// The chat that is both on screen and in the foreground, or null.
  static String? get chatId => _chatId;

  /// Whether [candidate] is that chat.
  ///
  /// A null candidate is never active, which saves every caller a null check —
  /// callers are holding an id that is legitimately absent until a new chat has
  /// been created.
  static bool isActive(String? candidate) =>
      candidate != null && candidate == _chatId;

  /// Claims [chatId] as the thread in front of the user.
  static void enter(String chatId) => _chatId = chatId;

  /// Gives up the claim, but only if [chatId] is still the one holding it.
  ///
  /// Routes overlap: pushing a second thread runs its `initState` before the
  /// first thread's `dispose`, so a screen on its way out must not clear a
  /// claim that already belongs to the screen replacing it. Clearing
  /// unconditionally would leave no thread active while one is plainly on
  /// screen.
  static void leave(String chatId) {
    if (_chatId == chatId) _chatId = null;
  }

  /// Drops the claim whoever holds it — for sign-out, and for tests that must
  /// not leak a claim into the next case.
  static void reset() => _chatId = null;
}
