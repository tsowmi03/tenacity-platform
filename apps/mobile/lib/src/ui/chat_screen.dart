import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/chat_controller.dart';
import 'package:tenacity/src/models/message_model.dart';
import 'package:tenacity/src/services/storage_service.dart';

class ChatScreen extends StatefulWidget {
  final String chatId;
  final String otherUserName;

  const ChatScreen({
    required this.chatId,
    required this.otherUserName,
    super.key,
  });

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final ImagePicker _picker = ImagePicker();
  final TextEditingController _messageController = TextEditingController();

  bool _isTyping = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ChatController>().markMessagesAsRead(widget.chatId);
    });
  }

  @override
  Widget build(BuildContext context) {
    final chatController = context.watch<ChatController>();

    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.otherUserName,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
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
          // Messages List
          Expanded(
            child: StreamBuilder<List<Message>>(
              stream: chatController.getMessages(widget.chatId),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (!snapshot.hasData || snapshot.data!.isEmpty) {
                  return const Center(child: Text("No messages yet"));
                }

                final messages = snapshot.data!;
                return ListView.builder(
                  reverse: true,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  itemCount: messages.length,
                  itemBuilder: (context, index) {
                    return _buildMessageBubble(messages[index]);
                  },
                );
              },
            ),
          ),

          // Typing Indicator
          _buildTypingIndicator(),

          // Message Input
          _buildMessageInput(),
        ],
      ),
    );
  }

  /// Shows a small indicator if the other user is typing
  Widget _buildTypingIndicator() {
    final chatController = context.watch<ChatController>();
    final isTyping = chatController.isOtherUserTyping(widget.chatId);
    if (!isTyping) return const SizedBox.shrink();

    return const Padding(
      padding: EdgeInsets.only(left: 16, bottom: 8),
      child: Row(
        children: [
          SizedBox(width: 8),
          Text(
            "Typing...",
            style: TextStyle(fontSize: 14, color: Colors.grey),
          ),
        ],
      ),
    );
  }

  /// Bottom row with an icon to pick images, text input, and a send button
  Widget _buildMessageInput() {
    final chatController = context.watch<ChatController>();

    return Padding(
      padding: const EdgeInsets.fromLTRB(15, 0, 15, 25),
      child: Row(
        children: <Widget>[
          // Icon to pick an image from gallery
          IconButton(
            icon: const Icon(Icons.photo, color: Colors.grey),
            onPressed: () => _pickImageWithCaption(),
          ),
          // Text field
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
                  final isCurrentlyTyping = text.trim().isNotEmpty;
                  if (isCurrentlyTyping != _isTyping) {
                    setState(() {
                      _isTyping = isCurrentlyTyping;
                    });
                    chatController.updateTypingStatus(widget.chatId, _isTyping);
                  }
                },
              ),
            ),
          ),
          const SizedBox(width: 12),

          // Send Button
          Container(
            height: 48,
            width: 48,
            decoration: BoxDecoration(
              color: Colors.blue[500],
              shape: BoxShape.circle,
            ),
            child: IconButton(
              icon: const Icon(Icons.send, color: Colors.white),
              onPressed: () {
                final text = _messageController.text.trim();
                if (text.isNotEmpty) {
                  chatController.sendMessage(
                    chatId: widget.chatId,
                    text: text,
                  );
                  _messageController.clear();
                  setState(() {
                    _isTyping = false;
                  });
                  chatController.updateTypingStatus(widget.chatId, false);
                }
              },
            ),
          ),
        ],
      ),
    );
  }

  /// Prompts the user to pick an image and optionally enter a caption
  Future<void> _pickImageWithCaption() async {
    try {
      final pickedFile = await _picker.pickImage(source: ImageSource.gallery);
      if (pickedFile == null) return;

      // First, ask the user for a caption
      final caption = await _promptForCaption();
      if (caption == null) {
        // user canceled
        return;
      }

      // Then, upload image & send message
      final imageFile = File(pickedFile.path);
      await _uploadAndSendImage(imageFile, caption);
    } catch (e) {
      print("Error picking image: $e");
    }
  }

  /// Shows a dialog for the user to type a caption (can be empty)
  Future<String?> _promptForCaption() async {
    final captionController = TextEditingController();
    return showDialog<String?>(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text("Image Caption"),
          content: TextField(
            controller: captionController,
            decoration: const InputDecoration(
              hintText: "Enter caption (optional)",
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, null), // cancel
              child: const Text("Cancel"),
            ),
            TextButton(
              onPressed: () => Navigator.pop(ctx, captionController.text.trim()),
              child: const Text("Send"),
            ),
          ],
        );
      },
    );
  }

  /// Uploads the file, then sends a message with type=image and an optional caption
  Future<void> _uploadAndSendImage(File imageFile, String caption) async {
    try {
      print("Begin uploading image...");
      final path = "chatImages/${DateTime.now().millisecondsSinceEpoch}.jpg";
      final imageUrl = await StorageService().uploadImage(imageFile, path);
      print("Image uploaded. URL = $imageUrl");

      await context.read<ChatController>().sendMessage(
        chatId: widget.chatId,
        text: caption,
        mediaUrl: imageUrl,
        messageType: "image",
      );
      print("Message sent to Firestore with type=image");
    } catch (e) {
      print("Error uploading/sending image: $e");
    }
  }

  /// Renders either text or image message. If it's an image,
  /// we remove the colored background + display optional caption
  Widget _buildMessageBubble(Message message) {
    final isMe = message.senderId == context.read<ChatController>().userId;
    final formattedTime = DateFormat('h:mm a').format(message.timestamp.toDate());
    final isImage = (message.type == "image");

    // Decide on bubble color & padding
    final bubbleColor = isImage
        ? Colors.transparent  // no background for images
        : (isMe ? Colors.blue[500] : Colors.grey[300]);
    final bubblePadding = isImage
        ? EdgeInsets.zero
        : const EdgeInsets.symmetric(vertical: 10, horizontal: 14);

    return Align(
      alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
      child: Column(
        crossAxisAlignment: isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          Container(
            constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
            padding: bubblePadding,
            decoration: BoxDecoration(
              color: bubbleColor,
              borderRadius: BorderRadius.only(
                topLeft: const Radius.circular(20),
                topRight: const Radius.circular(20),
                bottomLeft: isMe ? const Radius.circular(20) : const Radius.circular(0),
                bottomRight: isMe ? const Radius.circular(0) : const Radius.circular(20),
              ),
            ),

            // If it's an image, show the image plus optional caption
            child: isImage
                ? Column(
                    crossAxisAlignment:
                        isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                    children: [
                      // The image
                      if (message.mediaUrl != null)
                        Image.network(message.mediaUrl!),
                      // If the user included a caption, show it below
                      if (message.text.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text(
                            message.text,
                            style: TextStyle(
                              color: isMe ? Colors.white : Colors.black87,
                            ),
                          ),
                        ),
                    ],
                  )
                // Otherwise, a regular text message
                : Text(
                    message.text,
                    style: TextStyle(
                      color: isMe ? Colors.white : Colors.black87,
                      fontSize: 16,
                    ),
                  ),
          ),
          const SizedBox(height: 4),
          // Timestamp
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
