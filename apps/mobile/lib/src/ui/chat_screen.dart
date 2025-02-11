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
  
  /// Holds the locally selected image file (if any)
  File? _selectedImage;

  /// The text field controller for normal messages
  final TextEditingController _messageController = TextEditingController();

  bool _isTyping = false;
  bool _isSending = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ChatController>().markMessagesAsRead(widget.chatId);
    });
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

    try {
      // 1) If we have an image, upload + send as a separate message
      if (_selectedImage != null) {
        final path = "chatImages/${DateTime.now().millisecondsSinceEpoch}.jpg";
        final imageUrl = await StorageService().uploadImage(_selectedImage!, path);

        await chatController.sendMessage(
          chatId: widget.chatId,
          text: "",           // No caption
          mediaUrl: imageUrl,
          messageType: "image",
        );
      }

      // 2) If there's any typed text, send it as a normal text message
      if (text.isNotEmpty) {
        await chatController.sendMessage(
          chatId: widget.chatId,
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
      chatController.updateTypingStatus(widget.chatId, false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final chatController = context.watch<ChatController>();

    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.otherUserName,
          style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
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

          _buildTypingIndicator(),

          // Show the selected image preview + text field
          _buildMessageInput(),
        ],
      ),
    );
  }

  /// If the other user is typing, show a "Typing..." indicator
  Widget _buildTypingIndicator() {
    final isOtherTyping = context.watch<ChatController>().isOtherUserTyping(widget.chatId);
    if (!isOtherTyping) return const SizedBox.shrink();

    return const Padding(
      padding: EdgeInsets.only(left: 16, bottom: 8),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Text("Typing...", style: TextStyle(fontSize: 14, color: Colors.grey)),
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
                        child: const Icon(Icons.close, color: Colors.white, size: 20),
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
                onPressed: _isSending ? null : () => _pickImage(ImageSource.gallery),
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
                        context.read<ChatController>().updateTypingStatus(widget.chatId, isNowTyping);
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
                        child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5),
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
    final formattedTime = DateFormat('h:mm a').format(message.timestamp.toDate());

    final isImage = message.type == "image";

    return Align(
      alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
      child: Column(
        crossAxisAlignment: isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          // If it's an image message, show the image alone. If it's text, show the text bubble
          Container(
            constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
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
                bottomLeft: isMe ? const Radius.circular(20) : const Radius.circular(0),
                bottomRight: isMe ? const Radius.circular(0) : const Radius.circular(20),
              ),
            ),
            child: isImage
                ? Image.network(message.mediaUrl ?? "", fit: BoxFit.cover)
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
