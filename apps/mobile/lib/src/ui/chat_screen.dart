import 'dart:io';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/chat_controller.dart';
import 'package:tenacity/src/models/message_model.dart';
import 'package:tenacity/src/services/storage_service.dart';
import 'package:uuid/uuid.dart';

class ChatScreen extends StatefulWidget {
  final String? chatId;
  final String otherUserName;
  final String? receipientId;

  const ChatScreen({
    required this.chatId,
    required this.otherUserName,
    this.receipientId,
    super.key,
  });

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final ImagePicker _picker = ImagePicker();

  /// Holds the locally selected image file (if any)
  File? _selectedImage;

  /// The text field controller for normal messages
  final TextEditingController _messageController = TextEditingController();

  bool _isTyping = false;
  bool _isSending = false;

  String? _activeChatId;

  // Add this:
  final List<Message> _pendingMessages = [];

  @override
  void initState() {
    super.initState();
    _activeChatId = widget.chatId;
    if (_activeChatId != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        context.read<ChatController>().markMessagesAsRead(_activeChatId!);
      });
    }
  }

  /// Let the user pick an image from gallery or camera
  Future<void> _pickImage(ImageSource source) async {
    if (_isSending) return; // prevent picking while we're sending

    final pickedFile = await _picker.pickImage(source: source);
    if (pickedFile != null) {
      setState(() {
        _selectedImage = File(pickedFile.path);
      });
    }
  }

  /// Called when user taps "Send"
  /// If there's an image, send that as one message.
  /// Then if there's text, send that as a separate message.
  Future<void> _sendMessages() async {
    if (_isSending) return; // prevent double taps
    setState(() {
      _isSending = true;
    });

    final chatController = context.read<ChatController>();
    final text = _messageController.text.trim();
    String? chatId = _activeChatId;

    try {
      // If chatId is null, create the chat now
      if (chatId == null && widget.receipientId != null) {
        chatId = await chatController.createChatWithUser(widget.receipientId!);
        setState(() {
          _activeChatId = chatId;
        });
        // Mark as read after creating the chat
        context.read<ChatController>().markMessagesAsRead(chatId);
      }

      if (chatId == null) {
        throw Exception("Chat ID is null, cannot send messages");
      }

      // Optimistic image message
      if (_selectedImage != null) {
        final tempId = const Uuid().v4();
        final pendingMsg = Message(
          id: tempId,
          senderId: chatController.userId,
          text: "",
          mediaUrl: _selectedImage!.path,
          type: "image",
          timestamp: Timestamp.now(),
          readBy: {chatController.userId: Timestamp.now()},
          isPending: true,
        );
        setState(() {
          _pendingMessages.insert(0, pendingMsg);
        });

        final path = "chatImages/${DateTime.now().millisecondsSinceEpoch}.jpg";
        final imageUrl =
            await StorageService().uploadImage(_selectedImage!, path);

        await chatController.sendMessage(
          chatId: chatId,
          text: "",
          mediaUrl: imageUrl,
          messageType: "image",
        );

        setState(() {
          _pendingMessages.removeWhere((m) => m.id == tempId);
        });
      }

      // Send text if present
      if (text.isNotEmpty) {
        await chatController.sendMessage(
          chatId: chatId,
          text: text,
        );
      }
    } catch (e) {
      print("Error sending messages: $e");
    } finally {
      setState(() {
        _selectedImage = null;
        _messageController.clear();
        _isTyping = false;
        _isSending = false;
      });
      if (_activeChatId != null) {
        chatController.updateTypingStatus(_activeChatId!, false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final chatController = context.watch<ChatController>();

    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.otherUserName,
          style: const TextStyle(
              color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
        ),
        iconTheme: const IconThemeData(color: Colors.white),
        elevation: 0,
        flexibleSpace: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              colors: [Color(0xFF1C71AF), Color(0xFF1B3F71)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
        ),
      ),
      backgroundColor: const Color(0xFFF6F9FC),
      body: Column(
        children: [
          Expanded(
            child: (_activeChatId == null)
                ? const Center(child: Text("Say hi to start chatting!"))
                : StreamBuilder<List<Message>>(
                    stream: chatController.getMessages(_activeChatId!),
                    builder: (context, snapshot) {
                      if (snapshot.connectionState == ConnectionState.waiting) {
                        return const Center(child: CircularProgressIndicator());
                      }
                      final firestoreMessages = snapshot.data ?? [];
                      // Merge pending and Firestore messages
                      final allMessages = [
                        ..._pendingMessages,
                        ...firestoreMessages
                      ];
                      if (allMessages.isEmpty) {
                        return const Center(child: Text("No messages yet"));
                      }
                      return ListView.builder(
                        reverse: true,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 10),
                        itemCount: allMessages.length,
                        itemBuilder: (context, index) {
                          return _buildMessageBubble(allMessages[index]);
                        },
                      );
                    },
                  ),
          ),

          _buildTypingIndicator(),

          // Show the selected image preview + text field
          _buildMessageInput(),
        ],
      ),
    );
  }

  /// If the other user is typing, show a "Typing..." indicator
  Widget _buildTypingIndicator() {
    if (_activeChatId == null) return const SizedBox.shrink();
    final isOtherTyping =
        context.watch<ChatController>().isOtherUserTyping(_activeChatId!);
    if (!isOtherTyping) return const SizedBox.shrink();

    return const Padding(
      padding: EdgeInsets.only(left: 16, bottom: 8),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Text("Typing...",
            style: TextStyle(fontSize: 14, color: Colors.grey)),
      ),
    );
  }

  /// The bottom area with an optional image preview, text field, and send button
  Widget _buildMessageInput() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(15, 0, 15, 25),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (_selectedImage != null)
            Align(
              alignment: Alignment.centerLeft,
              child: Stack(
                children: [
                  Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    height: 100,
                    width: 100,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.grey),
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Image.file(_selectedImage!, fit: BoxFit.cover),
                    ),
                  ),
                  // Close button on top of the image preview
                  Positioned(
                    top: 0,
                    right: 0,
                    child: InkWell(
                      onTap: () {
                        setState(() => _selectedImage = null);
                      },
                      child: Container(
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: Colors.black54,
                        ),
                        child: const Icon(Icons.close,
                            color: Colors.white, size: 20),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          Row(
            children: <Widget>[
              IconButton(
                icon: const Icon(Icons.photo, color: Colors.grey),
                onPressed:
                    _isSending ? null : () => _pickImage(ImageSource.gallery),
              ),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 15),
                  decoration: BoxDecoration(
                    color: Colors.grey[200],
                    borderRadius: BorderRadius.circular(30),
                  ),
                  child: TextField(
                    controller: _messageController,
                    decoration: const InputDecoration(
                      hintText: 'Type a message...',
                      border: InputBorder.none,
                    ),
                    minLines: 1,
                    maxLines: 5,
                    onChanged: (text) {
                      final isNowTyping = text.trim().isNotEmpty;
                      if (isNowTyping != _isTyping) {
                        setState(() {
                          _isTyping = isNowTyping;
                        });
                        if (_activeChatId != null) {
                          context
                              .read<ChatController>()
                              .updateTypingStatus(_activeChatId!, isNowTyping);
                        }
                      }
                    },
                  ),
                ),
              ),
              const SizedBox(width: 12),

              // Send button or loader
              Container(
                height: 48,
                width: 48,
                decoration: BoxDecoration(
                  color: Colors.blue[500],
                  shape: BoxShape.circle,
                ),
                child: _isSending
                    ? const Padding(
                        padding: EdgeInsets.all(10.0),
                        child: CircularProgressIndicator(
                            color: Colors.white, strokeWidth: 2.5),
                      )
                    : IconButton(
                        icon: const Icon(Icons.send, color: Colors.white),
                        onPressed: () {
                          // If no image selected & text is empty, do nothing
                          if (_selectedImage == null &&
                              _messageController.text.trim().isEmpty) {
                            return;
                          }
                          _sendMessages();
                        },
                      ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// Renders either a text bubble or an image bubble
  Widget _buildMessageBubble(Message message) {
    final isMe = message.senderId == context.read<ChatController>().userId;
    final formattedTime =
        DateFormat('h:mm a').format(message.timestamp.toDate());

    final isImage = message.type == "image";

    return Align(
      alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
      child: Column(
        crossAxisAlignment:
            isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          // If it's an image message, show the image alone. If it's text, show the text bubble
          Container(
            constraints: BoxConstraints(
                maxWidth: MediaQuery.of(context).size.width * 0.75),
            padding: isImage
                ? EdgeInsets.zero
                : const EdgeInsets.symmetric(vertical: 10, horizontal: 14),
            decoration: BoxDecoration(
              color: isImage
                  ? Colors.transparent
                  : (isMe ? Colors.blue[500] : Colors.grey[300]),
              borderRadius: BorderRadius.only(
                topLeft: const Radius.circular(20),
                topRight: const Radius.circular(20),
                bottomLeft:
                    isMe ? const Radius.circular(20) : const Radius.circular(0),
                bottomRight:
                    isMe ? const Radius.circular(0) : const Radius.circular(20),
              ),
            ),
            child: isImage
                ? message.isPending
                    ? Stack(
                        alignment: Alignment.center,
                        children: [
                          Image.file(
                            File(message.mediaUrl!),
                            fit: BoxFit.cover,
                          ),
                          Container(
                            color: Colors.black26,
                            child: const Padding(
                              padding: EdgeInsets.all(8.0),
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2,
                              ),
                            ),
                          ),
                        ],
                      )
                    : Image.network(
                        message.mediaUrl ?? "",
                        fit: BoxFit.cover,
                        loadingBuilder: (context, child, progress) {
                          if (progress == null) return child;
                          return Container(
                            color: Colors.black12,
                            height: 200,
                            child: const Center(
                              child: CircularProgressIndicator(),
                            ),
                          );
                        },
                        errorBuilder: (context, error, stackTrace) =>
                            const Icon(Icons.broken_image, size: 80),
                      )
                : Text(
                    message.text,
                    style: TextStyle(
                      color: isMe ? Colors.white : Colors.black87,
                      fontSize: 16,
                    ),
                  ),
          ),
          const SizedBox(height: 4),
          Padding(
            padding: const EdgeInsets.only(left: 8, right: 8),
            child: Text(
              formattedTime,
              style: TextStyle(fontSize: 12, color: Colors.grey[500]),
            ),
          ),
        ],
      ),
    );
  }
}
