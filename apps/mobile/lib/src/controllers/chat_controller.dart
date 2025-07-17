import 'package:flutter/material.dart';
import '../models/chat_model.dart';
import '../models/message_model.dart';
import '../services/chat_service.dart';

class ChatController with ChangeNotifier {
  final ChatService _chatService;
  final String userId;

  ChatController({required this.userId, required ChatService chatService})
      : _chatService = chatService;

  List<Chat> _chats = [];
  List<Chat> get chats => _chats;
  bool isLoading = false;

  // Loads all user chats
  void loadChats() {
    isLoading = true;
    notifyListeners();

    _chatService.getUserChats(userId).listen((chatList) {
      _chats = chatList;
      isLoading = false;
      notifyListeners();
    });
  }

  // Fetches messages for a chat
  Stream<List<Message>> getMessages(String chatId) {
    return _chatService.getMessages(chatId, userId);
  }

  // Sends a new message (text or image)
  Future<void> sendMessage({
    required String chatId,
    required String text,
    String? mediaUrl,
    String? thumbnailUrl,
    String messageType = "text",
    String? fileName,
    int? fileSize,
  }) async {
    await _chatService.sendMessage(
      chatId: chatId,
      senderId: userId,
      text: text,
      mediaUrl: mediaUrl,
      thumbnailUrl: thumbnailUrl,
      messageType: messageType,
      fileName: fileName,
      fileSize: fileSize,
    );
  }

  // Marks messages as read
  Future<void> markMessagesAsRead(String chatId) async {
    await _chatService.markMessagesAsRead(chatId, userId);
  }

  bool isOtherUserTyping(String chatId) {
    try {
      final chat = _chats.firstWhere((c) => c.id == chatId);
      final otherUserId =
          chat.participants.firstWhere((id) => id != userId, orElse: () => "");
      return chat.typingStatus[otherUserId] ?? false;
    } catch (_) {
      return false;
    }
  }

  // Updates typing status
  void updateTypingStatus(String chatId, bool isTyping) {
    _chatService.updateTypingStatus(chatId, userId, isTyping);
  }

  // Deletes chat for the user
  Future<void> deleteChatForUser(String chatId) async {
    await _chatService.deleteChatForUser(chatId, userId);
  }

  /// Creates or returns an existing chat with [recipientId].
  Future<String> createChatWithUser(String recipientId) async {
    final chatId = await _chatService.createChat(
      userId: userId,
      recipientId: recipientId,
    );
    // Optionally, refresh the chat list.
    loadChats();
    return chatId;
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
