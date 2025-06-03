import 'dart:io';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/chat_controller.dart';
import 'package:tenacity/src/models/message_model.dart';
import 'package:tenacity/src/services/storage_service.dart';
import 'package:uuid/uuid.dart';

Future<File> _compressImage(File file) async {
  final dir = await getTemporaryDirectory();
  final targetPath =
      '${dir.absolute.path}/${DateTime.now().millisecondsSinceEpoch}.jpg';

  final XFile? result = await FlutterImageCompress.compressAndGetFile(
    file.absolute.path,
    targetPath,
    quality: 75, // Adjust quality as needed (0-100)
    minWidth: 1080, // Optional: resize
    minHeight: 1080,
  );
  return result != null ? File(result.path) : file;
}

Future<File> _generateThumbnail(File file) async {
  final dir = await getTemporaryDirectory();
  final targetPath =
      '${dir.absolute.path}/thumb_${DateTime.now().millisecondsSinceEpoch}.jpg';

  final XFile? result = await FlutterImageCompress.compressAndGetFile(
    file.absolute.path,
    targetPath,
    quality: 25, // Lower quality for thumbnail
    minWidth: 200,
    minHeight: 200,
  );
  return result != null ? File(result.path) : file;
}

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

    // Store the selected image in a local variable
    final File? imageToSend = _selectedImage;

    setState(() {
      _isSending = true;
      _selectedImage = null; // Clear preview immediately
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
        context.read<ChatController>().markMessagesAsRead(chatId);
      }

      if (chatId == null) {
        throw Exception("Chat ID is null, cannot send messages");
      }

      // Optimistic image message
      if (imageToSend != null) {
        final tempId = const Uuid().v4();
        final pendingMsg = Message(
          id: tempId,
          senderId: chatController.userId,
          text: "",
          mediaUrl: imageToSend.path,
          type: "image",
          timestamp: Timestamp.now(),
          readBy: {chatController.userId: Timestamp.now()},
          isPending: true,
        );
        setState(() {
          _pendingMessages.insert(0, pendingMsg);
        });

        final compressedImage = await _compressImage(imageToSend);
        final thumbnailImage = await _generateThumbnail(imageToSend);

        final path = "chatImages/${DateTime.now().millisecondsSinceEpoch}.jpg";
        final thumbPath =
            "chatImages/thumb_${DateTime.now().millisecondsSinceEpoch}.jpg";
        final imageUrl =
            await StorageService().uploadImage(compressedImage, path);
        final thumbUrl =
            await StorageService().uploadImage(thumbnailImage, thumbPath);

        await chatController.sendMessage(
          chatId: chatId,
          text: "",
          mediaUrl: imageUrl,
          messageType: "image",
          thumbnailUrl: thumbUrl,
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
                      List<Message> lastMessages = [];

                      if (snapshot.hasData && snapshot.data != null) {
                        lastMessages = snapshot.data!;
                      }

                      final firestoreMessages = lastMessages;
                      final allMessages = [
                        ..._pendingMessages,
                        ...firestoreMessages
                      ];

                      if (allMessages.isEmpty) {
                        if (snapshot.connectionState ==
                            ConnectionState.waiting) {
                          return const Center(
                              child: CircularProgressIndicator());
                        }
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
                child: IconButton(
                  icon: const Icon(Icons.send, color: Colors.white),
                  onPressed: () {
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

    Future<void> _openImage() async {
      print('Opening image: ${message.mediaUrl}');
      if (message.isPending) {
        // Local file
        await OpenFilex.open(message.mediaUrl!);
      } else if (message.mediaUrl != null) {
        // Download to temp and open
        final tempDir = await getTemporaryDirectory();
        final filePath = '${tempDir.path}/${message.id}.jpg';
        final file = File(filePath);
        if (!file.existsSync()) {
          final response =
              await HttpClient().getUrl(Uri.parse(message.mediaUrl!));
          final bytes = await response
              .close()
              .then((r) => r.fold<List<int>>([], (p, e) => p..addAll(e)));
          await file.writeAsBytes(bytes);
        }
        await OpenFilex.open(filePath);
      }
    }

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
                ? GestureDetector(
                    onTap: () async {
                      try {
                        await _openImage();
                      } catch (e) {
                        print("Error opening image: $e");
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('Could not open image: $e')),
                        );
                      }
                    },
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(16),
                      child: SizedBox(
                        height: 200, // Fixed height for tap area
                        width: 200,
                        child: message.isPending
                            ? Stack(
                                alignment: Alignment.center,
                                children: [
                                  Image.file(
                                    File(message.mediaUrl!),
                                    fit: BoxFit.cover,
                                    width: 200,
                                    height: 200,
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
                            : CachedNetworkImage(
                                imageUrl: message.mediaUrl ?? "",
                                fit: BoxFit.cover,
                                width: 200,
                                height: 200,
                                placeholder: (context, url) =>
                                    message.thumbnailUrl != null
                                        ? Image.network(
                                            message.thumbnailUrl!,
                                            fit: BoxFit.cover,
                                            width: 200,
                                            height: 200,
                                          )
                                        : Container(
                                            color: Colors.black12,
                                            height: 200,
                                            width: 200,
                                          ),
                                errorWidget: (context, url, error) =>
                                    const Icon(Icons.broken_image, size: 80),
                              ),
                      ),
                    ),
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
