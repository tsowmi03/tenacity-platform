import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import '../models/chat_model.dart';
import '../models/message_model.dart';
import '../services/chat_service.dart';

class ChatController with ChangeNotifier {
  final ChatService _chatService;

  String _userId;
  String get userId => _userId;

  ChatController({required String userId, required ChatService chatService})
      : _userId = userId,
        _chatService = chatService;

  /// The controller for [userId], reusing [previous] when there is one.
  ///
  /// This is what the provider's `update` callback resolves to. Building a new
  /// controller there instead would throw away the loaded chats every time
  /// `AuthController` notified, however unrelated the notification.
  static ChatController forUser(
    ChatController? previous,
    String userId, {
    ChatService Function() createService = ChatService.new,
  }) {
    if (previous == null) {
      return ChatController(chatService: createService(), userId: userId);
    }
    return previous..updateUser(userId);
  }

  List<Chat> _chats = [];
  List<Chat> get chats => _chats;
  bool isLoading = false;

  StreamSubscription<List<Chat>>? _chatsSubscription;

  /// Re-points this controller at [userId], and does nothing if it is already
  /// the user being shown.
  ///
  /// The provider hands every `AuthController` notification here, and most of
  /// them — a refreshed user document, an announcement marked read — carry the
  /// same uid. Replacing the controller (or its chat list) on those would empty
  /// an inbox that is still on screen, because the tab shell keeps the screen
  /// alive and so nothing calls [loadChats] a second time.
  void updateUser(String userId) {
    if (userId == _userId) return;

    // A real change of user: the previous user's chats are neither correct to
    // show nor still readable, and the subscription must go with them.
    _chatsSubscription?.cancel();
    _chatsSubscription = null;
    _userId = userId;
    _chats = [];
    isLoading = false;
    notifyListeners();
  }

  // Loads all user chats
  void loadChats() {
    isLoading = true;
    notifyListeners();

    // Each call replaces the last, rather than leaving another Firestore
    // listener attached for the lifetime of the app.
    _chatsSubscription?.cancel();
    _chatsSubscription = _chatService.getUserChats(_userId).listen(
      (chatList) {
        _chats = chatList;
        isLoading = false;
        notifyListeners();
      },
      onError: (Object error) {
        debugPrint('[ChatController] chat stream failed: $error');
        isLoading = false;
        notifyListeners();
      },
    );
  }

  @override
  void dispose() {
    _chatsSubscription?.cancel();
    super.dispose();
  }

  // Fetches messages for a chat
  Stream<List<Message>> getMessages(String chatId, {int? limit}) {
    return _chatService.getMessages(
      chatId,
      userId,
      limit: limit ?? ChatService.messagePageSize,
    );
  }

  /// One page of messages older than [before], newest first.
  ///
  /// Empty when there is nothing older, which is how the thread knows it has
  /// reached the start of the conversation.
  Future<List<Message>> fetchMessagesBefore({
    required String chatId,
    required Timestamp before,
  }) {
    return _chatService.fetchMessagesBefore(
      chatId: chatId,
      userId: userId,
      before: before,
    );
  }

  /// Sends a new message (text or image) as [messageId].
  ///
  /// The caller supplies the id so that the optimistic copy it is already
  /// showing and the document the server writes are the same message. See
  /// [ChatService.sendMessage].
  Future<void> sendMessage({
    required String chatId,
    required String messageId,
    required String text,
    String? mediaUrl,
    String? thumbnailUrl,
    String messageType = "text",
    String? fileName,
    int? fileSize,
    String? recipientId,
  }) async {
    final cachedParticipants = _cachedParticipantsForChat(
      chatId: chatId,
      recipientId: recipientId,
    );

    await _chatService.sendMessage(
      chatId: chatId,
      messageId: messageId,
      text: text,
      mediaUrl: mediaUrl,
      thumbnailUrl: thumbnailUrl,
      messageType: messageType,
      fileName: fileName,
      fileSize: fileSize,
      participants: cachedParticipants,
    );
  }

  /// Records that this user has read [chatId] up to now.
  ///
  /// [legacyReadByIds] are the on-screen messages whose `readBy` map still has
  /// to be updated for clients on the previous release. Bounded by the page the
  /// caller can see, not by the length of the conversation.
  Future<void> markMessagesAsRead(
    String chatId, {
    List<String> legacyReadByIds = const [],
  }) async {
    await _chatService.markMessagesAsRead(
      chatId,
      userId,
      legacyReadByIds: legacyReadByIds,
    );
  }

  /// Whether the other participant of [chat] is typing as at [now].
  ///
  /// Takes the chat rather than an id: the caller watching a single chat has
  /// the document already, and the inbox has it in [chats]. The previous
  /// version looked the id up in [_chats] and swallowed the lookup failure,
  /// which meant a screen opened from a push notification — where [_chats] is
  /// empty because only the inbox loads it — reported "not typing" forever
  /// instead of reporting that it did not know.
  bool isOtherUserTyping(Chat? chat, DateTime now) {
    if (chat == null) return false;
    final otherUserId = chat.otherParticipant(userId);
    if (otherUserId == null) return false;
    return chat.isTypingNow(otherUserId, now);
  }

  /// The chat with [chatId] from the loaded inbox, if it happens to be there.
  Chat? chatById(String chatId) {
    for (final chat in _chats) {
      if (chat.id == chatId) return chat;
    }
    return null;
  }

  /// One chat, live — for screens that were not reached through the inbox.
  Stream<Chat?> watchChat(String chatId) => _chatService.watchChat(chatId);

  /// Stamps or clears this user's typing heartbeat.
  ///
  /// Returns the future so callers can await it, but tolerates being dropped:
  /// a failed heartbeat is not worth an error in front of somebody mid-message,
  /// and the reader's expiry window already covers a lost write.
  Future<void> updateTypingStatus(String chatId, bool isTyping) async {
    try {
      await _chatService.updateTypingStatus(chatId, userId, isTyping);
    } catch (error) {
      debugPrint('[ChatController] typing heartbeat failed: $error');
    }
  }

  // Deletes chat for the user
  Future<void> deleteChatForUser(String chatId) async {
    await _chatService.deleteChatForUser(chatId, userId);
  }

  /// Creates or returns an existing chat with [recipientId].
  Future<String> createChatWithUser(String recipientId) async {
    for (final chat in _chats) {
      if (chat.participants.length == 2 &&
          chat.participants.contains(userId) &&
          chat.participants.contains(recipientId)) {
        return chat.id;
      }
    }

    final chatId = await _chatService.createChat(
      userId: userId,
      recipientId: recipientId,
    );
    // Optionally, refresh the chat list.
    loadChats();
    return chatId;
  }

  List<String>? _cachedParticipantsForChat({
    required String chatId,
    String? recipientId,
  }) {
    for (final chat in _chats) {
      if (chat.id == chatId) {
        return chat.participants;
      }
    }

    if (recipientId != null && recipientId.isNotEmpty) {
      return [userId, recipientId];
    }

    return null;
  }

  Future<int> getUnreadCount() async {
    try {
      return await _chatService.fetchUnreadMessagesCount(userId);
    } catch (e) {
      debugPrint("Error fetching unread count: $e");
      return 0;
    }
  }
}
