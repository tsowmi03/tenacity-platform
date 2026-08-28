import 'dart:async';
import 'dart:io';

import 'package:clock/clock.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
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
import 'package:tenacity/src/models/chat_model.dart';
import 'package:tenacity/src/models/message_model.dart';
import 'package:tenacity/src/services/storage_service.dart';
import 'package:tenacity/src/utils/error_presenter.dart';
import 'package:uuid/uuid.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter_linkify/flutter_linkify.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/messaging/inbox_data.dart';
import 'package:tenacity/src/ui/messaging/typing_reporter.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

enum _AttachmentChoice { camera, photoLibrary, file }

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

class _ChatScreenState extends State<ChatScreen> with WidgetsBindingObserver {
  final ImagePicker _picker = ImagePicker();

  /// Holds the locally selected image file (if any)
  File? _selectedImage;

  /// The text field controller for normal messages
  final TextEditingController _messageController = TextEditingController();

  bool _isSending = false;

  /// Owns everything about announcing that this user is typing. The screen
  /// only tells it what the composer now contains.
  late final TypingReporter _typing;

  /// Resolved while the element tree is still stable, so [dispose] can still
  /// write the stop.
  ChatController? _chatController;

  String? _activeChatId;

  String? _downloadingMessageId; // Add this line

  /// Messages shown optimistically, newest first, until the server's own copy
  /// of each one arrives in the thread.
  ///
  /// An entry stops being rendered as soon as a snapshot contains its id — see
  /// [_buildMessagesList] — rather than when the send completes. Dropping them
  /// on completion is what MOB-31 was: `sendChatMessage` commits the message
  /// and only then does its notification fan-out, so the snapshot carries the
  /// real copy for around a second before the call returns, and both copies
  /// were on screen for that whole window.
  final List<Message> _pendingMessages = [];

  /// How long an optimistic copy may sit unconfirmed before we stop treating
  /// the outcome as open and call it undelivered.
  ///
  /// A committed write comes back through the thread's snapshot in well under a
  /// second, so this is generous. It only has to be long enough that a slow but
  /// successful send is not accused of failing.
  static const Duration _confirmationWindow = Duration(seconds: 15);

  /// Optimistic copies whose send returned an ambiguous code and whose server
  /// copy never arrived.
  ///
  /// Ambiguity is not an outcome, only a delay in learning one. Without this
  /// the not-committed case had no end at all: nothing retires a copy whose id
  /// never comes back, so the message sat there looking sent forever while its
  /// text had already been cleared (MOB-32).
  final Set<String> _undeliveredMessageIds = {};
  final Map<String, Timer> _confirmationTimers = {};

  /// The message whose text the draft is being held for, if any.
  ///
  /// A send we cannot judge must not destroy the text, but nor should it leave
  /// a stale draft behind once the send turns out to have worked — so the draft
  /// is kept until that specific message is confirmed.
  String? _draftHeldForMessageId;

  /// The live message stream for [_activeChatId], built once per chat.
  ///
  /// Held rather than built inline in [build]: [ChatController.getMessages]
  /// returns a new stream each call, so building it there made `StreamBuilder`
  /// drop its subscription and resubscribe on every rebuild — and this screen
  /// rebuilds on each of its own `setState`s, including the one that starts a
  /// send, as well as on every `ChatController` notification. Each resubscribe
  /// emptied the thread for a frame and re-ran the chat document read that
  /// `getMessages` opens with.
  Stream<List<Message>>? _messagesStream;
  String? _messagesStreamChatId;

  @override
  void initState() {
    super.initState();
    _activeChatId = widget.chatId;
    _typing = TypingReporter(
      report: (isTyping) async {
        final chatId = _activeChatId;
        final controller = _chatController;
        if (chatId == null || controller == null) return;
        // Held rather than looked up, because the most important report this
        // makes is the one from dispose(), and an ancestor lookup is not legal
        // there. Nor is it gated on `mounted` for the same reason: leaving the
        // screen is exactly when the stop has to get out.
        //
        // Deliberately not gated on connectivity either. Firestore queues
        // writes made offline and replays them on reconnect; skipping them is
        // what used to strand a `typing` never followed by its `stopped`.
        await controller.updateTypingStatus(chatId, isTyping);
      },
    );
    WidgetsBinding.instance.addObserver(this);
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

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _chatController = context.read<ChatController>();
  }

  /// Leaving the screen stops the announcement.
  ///
  /// The absence of this method was MOB-27's main cause: a composer with text
  /// in it left `typingStatus` set, and nothing on any later path cleared it,
  /// so the other participant saw "is typing…" indefinitely.
  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    for (final timer in _confirmationTimers.values) {
      timer.cancel();
    }
    _confirmationTimers.clear();
    _typing.dispose();
    _messageController.dispose();
    super.dispose();
  }

  /// Backgrounding or closing the app stops the announcement too.
  ///
  /// [dispose] does not run when the app is merely suspended, and a process
  /// killed while backgrounded never runs anything again — so this is the last
  /// point at which a stop can still be written. If even this is missed, the
  /// heartbeat's own expiry is the backstop.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    super.didChangeAppLifecycleState(state);
    if (state != AppLifecycleState.resumed) {
      _typing.stop();
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
      // The text comes back, but the claim does not. Restoring a draft is not
      // typing, and the old code's local-only `_isTyping = true` desynced this
      // screen from Firestore: because the write was edge-triggered on the
      // empty/non-empty transition, every later keystroke saw "no change" and
      // the other participant was never told anything at all.
      setState(() {
        _messageController.text = draft;
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

        // No optimistic copy on this path, so nothing to reconcile — the id is
        // here so a retried send cannot leave two copies of the attachment.
        await chatController.sendMessage(
          chatId: chatId,
          messageId: const Uuid().v4(),
          text: "",
          mediaUrl: fileUrl,
          messageType: "file",
          fileName: fileName,
          fileSize: fileSize,
          recipientId: widget.receipientId,
        );
      } catch (e, stackTrace) {
        if (mounted) {
          // Unlike a text send, this path has no optimistic copy and so no
          // pending indicator to settle. An ambiguous outcome still has to be
          // said out loud here, or a send that never landed leaves no trace at
          // all — hence the message rather than the silence used below.
          final presented = presentError(
            e,
            action: 'send this file',
            stackTrace: stackTrace,
          );
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(presented.message)),
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
    // Set before the first await below, so a double-tap landing in that
    // async gap can't slip past the check above (MOB-21).
    setState(() => _isSending = true);
    if (!await OfflineActionGuard.ensureOnline(
      context,
      action: 'send a message',
    )) {
      if (mounted) setState(() => _isSending = false);
      return;
    }

    // Store the selected image in a local variable
    final File? imageToSend = _selectedImage;
    final text = _messageController.text.trim();
    // Chosen here rather than left to Firestore, and used both for the
    // optimistic copy below and as the id the server writes the message at.
    // Sharing an id is what lets the thread recognise its own optimistic copy
    // (MOB-31); it also makes a retried send land on the same document instead
    // of writing a second message.
    final textMessageId = const Uuid().v4();
    Message? pendingTextMessage;
    var reachedTextSend = false;
    var awaitingConfirmation = false;
    final chatController = context.read<ChatController>();
    final shouldOptimisticallySendText = text.isNotEmpty && imageToSend == null;

    setState(() {
      _selectedImage = null; // Clear preview immediately
      if (shouldOptimisticallySendText) {
        pendingTextMessage = Message(
          id: textMessageId,
          senderId: chatController.userId,
          text: text,
          type: "text",
          timestamp: Timestamp.now(),
          readBy: {},
          isPending: true,
        );
        _pendingMessages.insert(0, pendingTextMessage!);
        _messageController.clear();
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

        // Warms the cache for the uploaded image before the server's copy of
        // this message can arrive. A confirmed image renders through
        // `CachedNetworkImage`, so without this the bubble swaps a fully drawn
        // local file for a provider holding nothing, and the photo blinks back
        // to a placeholder at the exact moment the send lands. A failure here
        // is not worth failing the send over — it costs a placeholder, which
        // is what used to happen every time.
        await precacheImage(
          CachedNetworkImageProvider(imageUrl),
          context,
          onError: (error, stackTrace) => debugPrint(
              '[ChatScreen] pre-caching the sent image failed: $error'),
        );
        if (!mounted) return;

        await chatController.sendMessage(
          chatId: chatId,
          messageId: tempId,
          text: "",
          mediaUrl: imageUrl,
          messageType: "image",
          thumbnailUrl: thumbUrl,
          recipientId: widget.receipientId,
        );
      }

      // Send text if present
      if (text.isNotEmpty) {
        // Everything above this line — creating the chat, uploading and
        // pre-caching an image — happens before the callable is invoked. A
        // timeout there is not an ambiguous send but a definite non-send, and
        // treating it as ambiguous left a copy waiting for a document that was
        // never going to be written (MOB-32).
        reachedTextSend = true;
        await chatController.sendMessage(
          chatId: chatId,
          messageId: textMessageId,
          text: text,
          recipientId: widget.receipientId,
        );
      }
    } catch (e, stackTrace) {
      final presented = presentError(
        e,
        action: 'send your message',
        stackTrace: stackTrace,
      );

      // An ambiguous code means we stopped waiting, not that the write failed:
      // the server may well have committed it. Leaving the pending message
      // alone lets its indicator settle once reconciliation runs (MOB-31).
      // Taking the text back into the composer and calling it a failure would
      // state an outcome we do not know, and invite a send that already
      // happened.
      //
      // Only the callable itself can be ambiguous, though. If we never reached
      // it, nothing was sent, whatever code came back.
      awaitingConfirmation = presented.isAmbiguous &&
          reachedTextSend &&
          pendingTextMessage != null;

      if (awaitingConfirmation) {
        // Ambiguity has to end somewhere: this gives the copy a deadline, after
        // which it is called undelivered and offered a retry.
        _watchForConfirmation(pendingTextMessage!.id);
        _draftHeldForMessageId = pendingTextMessage!.id;
      } else if (!presented.isAmbiguous || !reachedTextSend) {
        if (pendingTextMessage != null) {
          if (mounted) {
            setState(() {
              _pendingMessages
                  .removeWhere((m) => m.id == pendingTextMessage!.id);
              // Same reasoning as a restored draft: the text is theirs again,
              // but a failed send is not them typing.
              _messageController.text = text;
            });
          }
        }
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(presented.message)),
          );
        }
      }
    } finally {
      if (mounted) {
        setState(() {
          if (pendingTextMessage == null) {
            _messageController.clear();
          }
          _isSending = false;
        });
      }
      // Held, not cleared, while an outcome is still unknown: it is the only
      // copy of the text that survives the app being killed, and
      // [_retireConfirmedPendingMessages] clears it if the send did land.
      if (!awaitingConfirmation) await _clearDraft();
      // Sending is the end of typing, whether it succeeded or not: the composer
      // is either empty or holding text the user has not touched since.
      _typing.stop();
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

  /// The live message stream for [chatId], built once and then reused.
  ///
  /// See [_messagesStream] for why this is not called straight from [build].
  Stream<List<Message>> _messagesFor(ChatController controller, String chatId) {
    final existing = _messagesStream;
    if (existing != null && _messagesStreamChatId == chatId) return existing;

    final stream = controller.getMessages(chatId);
    _messagesStream = stream;
    _messagesStreamChatId = chatId;
    return stream;
  }

  /// Forgets optimistic copies whose real message is now in the thread.
  ///
  /// Runs after the frame rather than during it, and deliberately without
  /// `setState`: the build that scheduled it has already left these out of
  /// what it rendered, so forgetting them cannot change the screen.
  void _retireConfirmedPendingMessages(Set<String> arrivedIds) {
    _pendingMessages.removeWhere((message) => arrivedIds.contains(message.id));
    for (final id in arrivedIds) {
      _confirmationTimers.remove(id)?.cancel();
      _undeliveredMessageIds.remove(id);
      if (_draftHeldForMessageId == id) {
        // The send did land after all, so the text it was holding is no longer
        // the user's to get back.
        _draftHeldForMessageId = null;
        unawaited(_clearDraft());
      }
    }
  }

  /// Waits out [_confirmationWindow] for the server's copy of [messageId].
  ///
  /// Started only where the send returned a code meaning we stopped waiting
  /// rather than that it failed. If the copy arrives,
  /// [_retireConfirmedPendingMessages] cancels this; if it does not, the
  /// message is marked undelivered and offered a retry.
  void _watchForConfirmation(String messageId) {
    _confirmationTimers.remove(messageId)?.cancel();
    _confirmationTimers[messageId] = Timer(_confirmationWindow, () {
      if (!mounted) return;
      setState(() {
        _confirmationTimers.remove(messageId);
        if (_pendingMessages.any((message) => message.id == messageId)) {
          _undeliveredMessageIds.add(messageId);
        }
      });
    });
  }

  /// Sends [message] again under its own id.
  ///
  /// The id is deliberately reused: MOB-31 made the callable write at the id it
  /// is given, so a resend of something that did commit lands on the same
  /// document rather than posting the message twice.
  Future<void> _retryUndeliveredMessage(Message message) async {
    final chatId = _activeChatId;
    if (chatId == null) return;
    final chatController = context.read<ChatController>();

    setState(() => _undeliveredMessageIds.remove(message.id));

    try {
      await chatController.sendMessage(
        chatId: chatId,
        messageId: message.id,
        text: message.text,
        recipientId: widget.receipientId,
      );
    } catch (error, stackTrace) {
      if (!mounted) return;
      final presented = presentError(
        error,
        action: 'send your message',
        stackTrace: stackTrace,
      );
      if (presented.isAmbiguous) {
        // No more certain than the first attempt, so wait it out again rather
        // than declare an outcome.
        _watchForConfirmation(message.id);
        return;
      }
      setState(() => _undeliveredMessageIds.add(message.id));
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(presented.message)),
      );
    }
  }

  Widget _buildMessagesList({
    required ChatController chatController,
    required List<Message> firestoreMessages,
    bool isWaiting = false,
  }) {
    // Reconciled by filtering rather than by removing the optimistic copy when
    // the send returns. The thread's snapshots repeat — the callable clears
    // `notificationAction` just after committing, and opening a thread rewrites
    // `readBy` on every message in it — so the answer has to be the same
    // however many times the same message arrives.
    final arrivedIds = firestoreMessages.map((message) => message.id).toSet();
    final pendingMessages = _pendingMessages
        .where((message) => !arrivedIds.contains(message.id))
        .toList();
    if (pendingMessages.length != _pendingMessages.length) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _retireConfirmedPendingMessages(arrivedIds);
      });
    }

    final allMessages = [...pendingMessages, ...firestoreMessages];

    // Insert date separators
    final items = _buildMessagesWithDateSeparators(allMessages);

    if (items.isEmpty) {
      if (isWaiting) {
        return const MessageThreadSkeleton(key: Key('chat-loading'));
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
              if (_undeliveredMessageIds.contains(item.id))
                _UndeliveredNotice(
                  key: Key('undelivered-${item.id}'),
                  onRetry: () => _retryUndeliveredMessage(item),
                )
              else if (isLastMessage && isMe && !item.isPending)
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
                        stream: _messagesFor(chatController, _activeChatId!),
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

          if (_activeChatId != null)
            _TypingIndicator(
              key: ValueKey(_activeChatId),
              chatId: _activeChatId!,
              otherUserName: widget.otherUserName,
            ),

          // Show the selected image preview + text field
          _buildMessageInput(),
        ],
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
                  clipBehavior: Clip.antiAlias,
                  decoration: BoxDecoration(
                    color: AppColors.blue50,
                    // A fixed radius (rather than AppRadii.pill) so corners
                    // stay a constant curve as the field grows to multiple
                    // lines, instead of scaling with height into a deep
                    // stadium shape that eats into wrapped text.
                    borderRadius: BorderRadius.circular(AppRadii.md),
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
                      // Every keystroke, not just the empty/non-empty edge.
                      // The reporter throttles the writes and expires the
                      // claim on its own; the edge-trigger it replaces could
                      // only ever fire twice per message and had no way to say
                      // "still going".
                      _typing.onTextChanged(text);
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
                  onPressed: _isSending
                      ? null
                      : () {
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
                      } catch (e, stackTrace) {
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(
                                presentError(
                                  e,
                                  action: 'open this image',
                                  stackTrace: stackTrace,
                                ).message,
                              ),
                            ),
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
                              } catch (e, stackTrace) {
                                if (mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      content: Text(
                                        presentError(
                                          e,
                                          action: 'open this file',
                                          stackTrace: stackTrace,
                                        ).message,
                                      ),
                                    ),
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

  Future<void> _showAttachmentOptions() async {
    final choice = await showAppBottomSheet<_AttachmentChoice>(
      context: context,
      builder: (sheetContext) => AppBottomSheet(
        title: 'Add attachment',
        subtitle: 'Choose where to add it from.',
        child: QuickActionGrid(
          columns: 3,
          tiles: [
            QuickActionTile(
              key: const Key('chat-attachment-camera'),
              icon: Icons.photo_camera_outlined,
              label: 'Camera',
              onTap: () => Navigator.pop(
                sheetContext,
                _AttachmentChoice.camera,
              ),
            ),
            QuickActionTile(
              key: const Key('chat-attachment-library'),
              icon: Icons.photo_library_outlined,
              label: 'Photos',
              onTap: () => Navigator.pop(
                sheetContext,
                _AttachmentChoice.photoLibrary,
              ),
            ),
            QuickActionTile(
              key: const Key('chat-attachment-file'),
              icon: Icons.folder_outlined,
              label: 'File',
              onTap: () => Navigator.pop(
                sheetContext,
                _AttachmentChoice.file,
              ),
            ),
          ],
        ),
      ),
    );

    if (!mounted || choice == null) return;
    switch (choice) {
      case _AttachmentChoice.camera:
        await _pickImage(ImageSource.camera);
      case _AttachmentChoice.photoLibrary:
        await _pickImage(ImageSource.gallery);
      case _AttachmentChoice.file:
        await _pickFile();
    }
  }
}

/// The "… is typing…" line, which removes itself when the heartbeat goes stale.
///
/// Watches the one chat rather than reading the inbox list. The list is loaded
/// only by the inbox screen, so a chat opened from a push notification or a
/// person screen had nothing behind it and the indicator silently never
/// appeared — one of the two halves of MOB-27.
class _TypingIndicator extends StatefulWidget {
  final String chatId;
  final String otherUserName;

  const _TypingIndicator({
    required this.chatId,
    required this.otherUserName,
    super.key,
  });

  @override
  State<_TypingIndicator> createState() => _TypingIndicatorState();
}

class _TypingIndicatorState extends State<_TypingIndicator> {
  late final Stream<Chat?> _chat;

  /// Fires once, when the current heartbeat is due to expire.
  ///
  /// Expiry happens on a clock rather than on a write, so without this the
  /// last "still typing" snapshot would hold the line on screen until some
  /// unrelated edit to the document happened to arrive. A one-shot timer per
  /// heartbeat costs a rebuild only while somebody is actually typing, where a
  /// periodic ticker would rebuild all day for an empty thread.
  Timer? _expiry;

  @override
  void initState() {
    super.initState();
    _chat = context.read<ChatController>().watchChat(widget.chatId);
  }

  @override
  void dispose() {
    _expiry?.cancel();
    super.dispose();
  }

  void _scheduleExpiry(Chat? chat, String userId, DateTime now) {
    _expiry?.cancel();
    _expiry = null;
    if (chat == null) return;

    final otherUserId = chat.otherParticipant(userId);
    if (otherUserId == null) return;

    final heartbeat = chat.typingHeartbeats[otherUserId];
    if (heartbeat == null) return;

    final remaining = typingHeartbeatTtl - now.difference(heartbeat.toDate());
    if (remaining <= Duration.zero) return;

    _expiry = Timer(remaining, () {
      if (mounted) setState(() {});
    });
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.read<ChatController>();

    return StreamBuilder<Chat?>(
      stream: _chat,
      builder: (context, snapshot) {
        // Falls back to the inbox copy while the first snapshot is in flight,
        // so a chat reached through the inbox shows the indicator immediately
        // rather than after a round trip.
        final chat = snapshot.data ?? controller.chatById(widget.chatId);
        // Read through `clock` rather than DateTime.now() so a test can age a
        // heartbeat out by advancing the test clock. The expiry is the whole
        // mechanism here; it should not be the one part that has to be taken
        // on trust.
        final now = clock.now();

        _scheduleExpiry(chat, controller.userId, now);

        if (!controller.isOtherUserTyping(chat, now)) {
          return const SizedBox.shrink();
        }

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
      },
    );
  }
}

/// Shown under a message whose send we could not judge and which never came
/// back from the server.
///
/// Deliberately says "not delivered" rather than "failed": the send may have
/// been received and lost on the way back, which is why the retry reuses the
/// message's own id instead of writing a new one.
class _UndeliveredNotice extends StatelessWidget {
  final VoidCallback onRetry;

  const _UndeliveredNotice({super.key, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.xxs, right: AppSpacing.xs),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.error_outline_rounded,
            size: 14,
            color: AppColors.danger,
          ),
          const SizedBox(width: AppSpacing.xxs),
          Text(
            'Not delivered',
            style: AppText.body(fontSize: 12, color: AppColors.danger),
          ),
          const SizedBox(width: AppSpacing.xs),
          GestureDetector(
            onTap: onRetry,
            child: Text(
              'Retry',
              style: AppText.body(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: AppColors.blue,
              ).copyWith(decoration: TextDecoration.underline),
            ),
          ),
        ],
      ),
    );
  }
}
