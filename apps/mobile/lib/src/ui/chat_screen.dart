import 'dart:io';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:tenacity/src/controllers/chat_controller.dart';
import 'package:tenacity/src/controllers/connectivity_controller.dart';
import 'package:tenacity/src/helpers/offline_action_guard.dart';
import 'package:tenacity/src/models/message_model.dart';
import 'package:tenacity/src/services/storage_service.dart';
import 'package:uuid/uuid.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter_linkify/flutter_linkify.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:tenacity/src/ui/messaging/inbox_data.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

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

  String? _downloadingMessageId; // Add this line

  // Add this:
  final List<Message> _pendingMessages = [];

  @override
  void initState() {
    super.initState();
    _activeChatId = widget.chatId;
    _restoreDraft();
    if (_activeChatId != null) {
      debugPrint(
          '[ChatScreen] Calling markMessagesAsRead for chat: $_activeChatId');
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || !context.read<ConnectivityController>().isOnline) {
          return;
        }
        context.read<ChatController>().markMessagesAsRead(_activeChatId!);
      });
    }
  }

  Widget _buildReadStatus(Message message, String otherUserId) {
    debugPrint(
        '[ChatScreen] _buildReadStatus called for message "${message.id}"');
    debugPrint('[ChatScreen] message.readBy: ${message.readBy}');
    debugPrint('[ChatScreen] otherUserId: $otherUserId');

    if (message.readBy.containsKey(otherUserId)) {
      final readTimestamp = message.readBy[otherUserId];
      if (readTimestamp != null) {
        final label = readReceiptLabel(readTimestamp.toDate(), DateTime.now());
        debugPrint(
            '[ChatScreen] Message "${message.id}" $label by $otherUserId (timestamp: ${readTimestamp.toDate()})');
        return Padding(
          padding: const EdgeInsets.only(top: 2, right: 8),
          child: Align(
            alignment: Alignment.centerRight,
            child: Text(
              label,
              style: AppText.body(fontSize: 12.5, color: AppColors.muted),
            ),
          ),
        );
      } else {
        debugPrint(
            '[ChatScreen] Message "${message.id}" readBy contains $otherUserId but value is null');
      }
    } else {
      debugPrint(
          '[ChatScreen] Message "${message.id}" readBy does NOT contain $otherUserId');
    }
    debugPrint(
        '[ChatScreen] Message "${message.id}" delivered to $otherUserId but not yet read');
    return Padding(
      padding: const EdgeInsets.only(top: 2, right: 8),
      child: Align(
        alignment: Alignment.centerRight,
        child: Text(
          'Delivered',
          style: AppText.body(fontSize: 12.5, color: AppColors.muted),
        ),
      ),
    );
  }

  Future<void> _restoreDraft() async {
    if (widget.chatId == null) return;
    final prefs = await SharedPreferences.getInstance();
    final draft = prefs.getString('draft_${widget.chatId}');
    debugPrint(
        '[ChatScreen] Restoring draft for chat ${widget.chatId}: "$draft"');
    if (draft != null && draft.isNotEmpty) {
      _messageController.text = draft;
      setState(() {
        _isTyping = true;
      });
    }
  }

  Future<void> _saveDraft(String text) async {
    if (_activeChatId == null) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('draft_$_activeChatId', text);
    debugPrint('[ChatScreen] Saved draft for chat $_activeChatId: "$text"');
  }

  Future<void> _clearDraft() async {
    if (_activeChatId == null) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('draft_$_activeChatId');
    debugPrint('[ChatScreen] Cleared draft for chat $_activeChatId');
  }

  String _otherUserId(ChatController chatController) {
    if (widget.receipientId != null && widget.receipientId!.isNotEmpty) {
      return widget.receipientId!;
    }

    for (final chat in chatController.chats) {
      if (chat.id == _activeChatId) {
        return chat.participants.firstWhere(
          (id) => id != chatController.userId,
          orElse: () => "",
        );
      }
    }

    return "";
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

  Future<void> _pickFile() async {
    if (_isSending) return;
    if (!await OfflineActionGuard.ensureOnline(
      context,
      action: 'send a file',
    )) {
      return;
    }
    final result = await FilePicker.platform.pickFiles(
      type: FileType.any,
      allowMultiple: false,
    );
    if (!mounted) return;
    if (result != null && result.files.single.path != null) {
      setState(() {
        _selectedImage = null; // Clear image if any
      });
      final file = File(result.files.single.path!);
      final fileName = result.files.single.name;
      final fileSize = result.files.single.size;

      setState(() {
        _isSending = true;
      });

      final chatController = context.read<ChatController>();
      try {
        String path =
            "chatFiles/${DateTime.now().millisecondsSinceEpoch}_$fileName";
        String fileUrl = await StorageService().uploadImage(file, path);
        if (!mounted) return;

        String? chatId = _activeChatId;
        if (chatId == null && widget.receipientId != null) {
          chatId =
              await chatController.createChatWithUser(widget.receipientId!);
          if (!mounted) return;
          setState(() {
            _activeChatId = chatId;
          });
          if (context.read<ConnectivityController>().isOnline) {
            chatController.markMessagesAsRead(chatId);
          }
        }
        if (chatId == null) throw Exception("Chat ID is null");

        await chatController.sendMessage(
          chatId: chatId,
          text: "",
          mediaUrl: fileUrl,
          messageType: "file",
          fileName: fileName,
          fileSize: fileSize,
          recipientId: widget.receipientId,
        );
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Failed to send file: $e')),
          );
        }
      } finally {
        if (mounted) {
          setState(() {
            _isSending = false;
          });
        }
      }
    }
  }

  /// Called when user taps "Send"
  /// If there's an image, send that as one message.
  /// Then if there's text, send that as a separate message.
  Future<void> _sendMessages() async {
    if (_isSending) return; // prevent double taps
    if (!await OfflineActionGuard.ensureOnline(
      context,
      action: 'send a message',
    )) {
      return;
    }

    // Store the selected image in a local variable
    final File? imageToSend = _selectedImage;
    final text = _messageController.text.trim();
    Message? pendingTextMessage;
    final chatController = context.read<ChatController>();
    final shouldOptimisticallySendText = text.isNotEmpty && imageToSend == null;

    setState(() {
      _isSending = true;
      _selectedImage = null; // Clear preview immediately
      if (shouldOptimisticallySendText) {
        pendingTextMessage = Message(
          id: const Uuid().v4(),
          senderId: chatController.userId,
          text: text,
          type: "text",
          timestamp: Timestamp.now(),
          readBy: {},
          isPending: true,
        );
        _pendingMessages.insert(0, pendingTextMessage!);
        _messageController.clear();
        _isTyping = false;
      }
    });

    String? chatId = _activeChatId;

    try {
      // If chatId is null, create the chat now
      if (chatId == null && widget.receipientId != null) {
        chatId = await chatController.createChatWithUser(widget.receipientId!);
        if (!mounted) return;
        setState(() {
          _activeChatId = chatId;
        });
        if (context.read<ConnectivityController>().isOnline) {
          chatController.markMessagesAsRead(chatId);
        }
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
        if (!mounted) return;

        await chatController.sendMessage(
          chatId: chatId,
          text: "",
          mediaUrl: imageUrl,
          messageType: "image",
          thumbnailUrl: thumbUrl,
          recipientId: widget.receipientId,
        );

        if (mounted) {
          setState(() {
            _pendingMessages.removeWhere((m) => m.id == tempId);
          });
        }
      }

      // Send text if present
      if (text.isNotEmpty) {
        await chatController.sendMessage(
          chatId: chatId,
          text: text,
          recipientId: widget.receipientId,
        );
        if (pendingTextMessage != null && mounted) {
          setState(() {
            _pendingMessages.removeWhere((m) => m.id == pendingTextMessage!.id);
          });
        }
      }
    } catch (e) {
      if (pendingTextMessage != null) {
        if (mounted) {
          setState(() {
            _pendingMessages.removeWhere((m) => m.id == pendingTextMessage!.id);
            _messageController.text = text;
            _isTyping = text.isNotEmpty;
          });
        }
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to send message: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          if (pendingTextMessage == null) {
            _messageController.clear();
            _isTyping = false;
          } else if (_messageController.text.isEmpty) {
            _isTyping = false;
          }
          _isSending = false;
        });
      }
      await _clearDraft(); // Clear draft after sending
      if (_activeChatId != null) {
        if (context.read<ConnectivityController>().isOnline) {
          chatController.updateTypingStatus(_activeChatId!, false);
        }
      }
    }
  }

  List<dynamic> _buildMessagesWithDateSeparators(List<Message> messages) {
    final List<dynamic> result = [];
    DateTime? lastDate;

    // Reverse to process from oldest to newest
    final ordered = List<Message>.from(messages.reversed);

    for (final message in ordered) {
      final messageDate = message.timestamp.toDate();
      final dateOnly =
          DateTime(messageDate.year, messageDate.month, messageDate.day);

      if (lastDate == null || dateOnly.isAfter(lastDate)) {
        result.add(dateOnly);
        lastDate = dateOnly;
      }
      result.add(message);
    }

    // Reverse again for ListView(reverse: true)
    return result.reversed.toList();
  }

  Widget _buildMessagesList({
    required ChatController chatController,
    required List<Message> firestoreMessages,
    bool isWaiting = false,
  }) {
    final allMessages = [..._pendingMessages, ...firestoreMessages];

    // Insert date separators
    final items = _buildMessagesWithDateSeparators(allMessages);

    if (items.isEmpty) {
      if (isWaiting) {
        return const Center(child: CircularProgressIndicator());
      }
      return const Center(child: Text("No messages yet"));
    }

    return ListView.builder(
      reverse: true,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      itemCount: items.length,
      itemBuilder: (context, index) {
        final item = items[index];
        if (item is Message) {
          final myUserId = chatController.userId;
          final otherUserId = _otherUserId(chatController);
          final isMe = item.senderId == myUserId;
          final isLastMessage =
              index == 0; // Only the very last message in chat

          return Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              _buildMessageBubble(
                item,
                showTime: isLastMessage && !isMe,
              ),
              if (isLastMessage && isMe && !item.isPending)
                _buildReadStatus(item, otherUserId),
            ],
          );
        } else if (item is DateTime) {
          final now = DateTime.now();
          String label;
          if (item.year == now.year &&
              item.month == now.month &&
              item.day == now.day) {
            label = "Today";
          } else if (item.year == now.year &&
              item.month == now.month &&
              item.day == now.day - 1) {
            label = "Yesterday";
          } else {
            label = DateFormat.yMMMMd().format(item);
          }
          return _buildDateSeparator(label);
        } else {
          return const SizedBox.shrink();
        }
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final chatController = context.watch<ChatController>();

    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.ink,
        foregroundColor: Colors.white,
        elevation: 0,
        titleSpacing: 0,
        title: Row(
          children: [
            // The same squircle identity the inbox row uses, so the thread
            // reads as a continuation of the row that opened it.
            Container(
              width: 34,
              height: 34,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: AppColors.blue,
                borderRadius: BorderRadius.circular(AppRadii.sm),
              ),
              child: Text(
                initialsFor(widget.otherUserName),
                style: AppText.display(fontSize: 13, color: Colors.white),
              ),
            ),
            const SizedBox(width: AppSpacing.labelGap),
            Expanded(
              child: Text(
                widget.otherUserName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppText.display(fontSize: 18, color: Colors.white),
              ),
            ),
          ],
        ),
      ),
      backgroundColor: AppColors.paper,
      body: Column(
        children: [
          Expanded(
            child: (_activeChatId == null && _pendingMessages.isEmpty)
                ? const Center(child: Text("Say hi to start chatting!"))
                : (_activeChatId == null)
                    ? _buildMessagesList(
                        chatController: chatController,
                        firestoreMessages: const [],
                      )
                    : StreamBuilder<List<Message>>(
                        stream: chatController.getMessages(_activeChatId!),
                        builder: (context, snapshot) {
                          List<Message> lastMessages = [];

                          if (snapshot.hasData && snapshot.data != null) {
                            lastMessages = snapshot.data!;
                          }

                          return _buildMessagesList(
                            chatController: chatController,
                            firestoreMessages: lastMessages,
                            isWaiting: snapshot.connectionState ==
                                ConnectionState.waiting,
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

    return Padding(
      padding:
          const EdgeInsets.only(left: AppSpacing.lg, bottom: AppSpacing.sm),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Text(
          '${widget.otherUserName.split(' ').first} is typing…',
          style: AppText.body(fontSize: 13.5, color: AppColors.muted),
        ),
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
                      border: Border.all(color: AppColors.line),
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
              // Replace the three icons with one "+" icon
              IconButton(
                icon: const Icon(Icons.add_rounded, color: AppColors.blue),
                onPressed: _isSending ? null : _showAttachmentOptions,
              ),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 15),
                  decoration: BoxDecoration(
                    color: AppColors.blue50,
                    borderRadius: BorderRadius.circular(AppRadii.pill),
                  ),
                  child: TextField(
                    controller: _messageController,
                    // The container above already draws the pill. Without
                    // switching the theme's fill and every border state off,
                    // the app-wide input decoration paints its own filled,
                    // rounded field inside it — a pill within a pill.
                    decoration: InputDecoration(
                      hintText: 'Type a message…',
                      hintStyle:
                          AppText.body(fontSize: 14, color: AppColors.muted),
                      filled: false,
                      isDense: true,
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                      errorBorder: InputBorder.none,
                      focusedErrorBorder: InputBorder.none,
                      disabledBorder: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    style: AppText.body(fontSize: 14, color: AppColors.ink),
                    minLines: 1,
                    maxLines: 5,
                    textCapitalization: TextCapitalization.sentences,
                    onChanged: (text) {
                      final isNowTyping = text.trim().isNotEmpty;
                      if (isNowTyping != _isTyping) {
                        setState(() {
                          _isTyping = isNowTyping;
                        });
                        if (_activeChatId != null) {
                          if (context.read<ConnectivityController>().isOnline) {
                            context.read<ChatController>().updateTypingStatus(
                                _activeChatId!, isNowTyping);
                          }
                        }
                      }
                      _saveDraft(text);
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
                  color: AppColors.blue,
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
  Widget _buildMessageBubble(Message message, {bool showTime = true}) {
    final isMe = message.senderId == context.read<ChatController>().userId;
    // Same reasoning as the read receipt: a bare clock time only makes sense
    // for today, and this shows under the newest incoming message however old
    // the conversation is.
    final formattedTime =
        messageTimeLabel(message.timestamp.toDate(), DateTime.now());

    final isImage = message.type == "image";
    final isFile = message.type == "file";

    Future<void> openImage() async {
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
                  : (isMe ? AppColors.blue : AppColors.blue50),
              borderRadius: BorderRadius.only(
                topLeft: const Radius.circular(AppSpacing.xl),
                topRight: const Radius.circular(AppSpacing.xl),
                bottomLeft:
                    isMe ? const Radius.circular(AppSpacing.xl) : Radius.zero,
                bottomRight:
                    isMe ? Radius.zero : const Radius.circular(AppSpacing.xl),
              ),
            ),
            child: isImage
                ? GestureDetector(
                    onTap: () async {
                      try {
                        await openImage();
                      } catch (e) {
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('Could not open image: $e')),
                          );
                        }
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
                : isFile
                    ? Stack(
                        alignment: Alignment.center,
                        children: [
                          GestureDetector(
                            onTap: () async {
                              if (_downloadingMessageId == message.id) return;
                              setState(() {
                                _downloadingMessageId = message.id;
                              });
                              try {
                                if (message.mediaUrl != null) {
                                  final tempDir = await getTemporaryDirectory();
                                  final filePath =
                                      '${tempDir.path}/${message.fileName ?? message.id}';
                                  final file = File(filePath);
                                  if (!file.existsSync()) {
                                    final response = await HttpClient()
                                        .getUrl(Uri.parse(message.mediaUrl!));
                                    final bytes = await response.close().then(
                                        (r) => r.fold<List<int>>(
                                            [], (p, e) => p..addAll(e)));
                                    await file.writeAsBytes(bytes);
                                  }
                                  // Hide indicator before opening the file
                                  if (!mounted) return;
                                  setState(() {
                                    _downloadingMessageId = null;
                                  });
                                  await OpenFilex.open(filePath);
                                }
                              } catch (e) {
                                if (mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                        content:
                                            Text('Could not open file: $e')),
                                  );
                                  setState(() {
                                    _downloadingMessageId = null;
                                  });
                                }
                              }
                            },
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  Icons.insert_drive_file,
                                  size: 32,
                                  color:
                                      isMe ? Colors.white : AppColors.blue600,
                                ),
                                const SizedBox(width: 8),
                                Flexible(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        message.fileName ?? "Attachment",
                                        style: TextStyle(
                                          color: isMe
                                              ? Colors.white
                                              : AppColors.blue600,
                                          fontSize: 16,
                                          decoration: TextDecoration.underline,
                                          decorationColor: isMe
                                              ? Colors.white
                                              : AppColors.blue600,
                                        ),
                                      ),
                                      if (message.fileSize != null)
                                        Text(
                                          _formatFileSize(message.fileSize!),
                                          style: TextStyle(
                                            color: isMe
                                                ? Colors.white70
                                                : AppColors.muted,
                                            fontSize: 12,
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                          if (_downloadingMessageId == message.id)
                            Container(
                              color: Colors.black26,
                              child: const Padding(
                                padding: EdgeInsets.all(12.0),
                                child: CircularProgressIndicator(
                                  valueColor: AlwaysStoppedAnimation<Color>(
                                      Colors.white),
                                  strokeWidth: 2,
                                ),
                              ),
                            ),
                        ],
                      )
                    : Linkify(
                        text: message.text,
                        style: TextStyle(
                          color: isMe ? Colors.white : AppColors.ink,
                          fontSize: 16,
                        ),
                        linkStyle: TextStyle(
                          color: isMe ? AppColors.blue100 : AppColors.blue600,
                          decoration: TextDecoration.underline,
                          decorationColor:
                              isMe ? AppColors.blue100 : AppColors.blue600,
                          decorationThickness: 2,
                        ),
                        onOpen: (link) async {
                          final url = Uri.parse(link.url);
                          if (await canLaunchUrl(url)) {
                            await launchUrl(url,
                                mode: LaunchMode.externalApplication);
                          }
                        },
                      ),
          ),
          const SizedBox(height: 4),
          if (showTime)
            Padding(
              padding: const EdgeInsets.only(left: 8, right: 8, top: 2),
              child: Text(
                formattedTime,
                style: AppText.body(fontSize: 11.5, color: AppColors.muted),
              ),
            ),
        ],
      ),
    );
  }

  /// Renders a date separator
  Widget _buildDateSeparator(String label) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 12),
          decoration: BoxDecoration(
            color: AppColors.blue50,
            borderRadius: BorderRadius.circular(AppRadii.pill),
          ),
          child: Text(
            label,
            style: AppText.body(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: AppColors.muted,
            ),
          ),
        ),
      ),
    );
  }

  String _formatFileSize(int sizeInBytes) {
    if (sizeInBytes < 1024) {
      return '$sizeInBytes B';
    } else if (sizeInBytes < 1024 * 1024) {
      return '${(sizeInBytes / 1024).toStringAsFixed(1)} KB';
    } else {
      return '${(sizeInBytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    }
  }

  void _showAttachmentOptions() {
    showCupertinoModalPopup<void>(
      context: context,
      builder: (context) => CupertinoActionSheet(
        actions: [
          CupertinoActionSheetAction(
            onPressed: () {
              Navigator.pop(context);
              _pickImage(ImageSource.camera);
            },
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: const [
                Icon(CupertinoIcons.camera, size: 20),
                SizedBox(width: 8),
                Text('Camera'),
              ],
            ),
          ),
          CupertinoActionSheetAction(
            onPressed: () {
              Navigator.pop(context);
              _pickImage(ImageSource.gallery);
            },
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: const [
                Icon(CupertinoIcons.photo, size: 20),
                SizedBox(width: 8),
                Text('Photo Library'),
              ],
            ),
          ),
          CupertinoActionSheetAction(
            onPressed: () {
              Navigator.pop(context);
              _pickFile();
            },
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: const [
                Icon(CupertinoIcons.folder, size: 20),
                SizedBox(width: 8),
                Text('File'),
              ],
            ),
          ),
        ],
        cancelButton: CupertinoActionSheetAction(
          onPressed: () => Navigator.pop(context),
          isDefaultAction: true,
          child: const Text('Cancel'),
        ),
      ),
    );
  }
}
