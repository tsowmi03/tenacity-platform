import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/chat_controller.dart';
import 'package:tenacity/src/helpers/offline_action_guard.dart';
import 'package:tenacity/src/models/chat_model.dart';
import 'package:tenacity/src/ui/chat_screen.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/messaging/inbox_data.dart';
import 'package:tenacity/src/ui/new_chat_screen.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/widgets/offline_cached_data_notice.dart';

/// The message list, shared by every role — the reference designs give parents,
/// tutors and admins the same inbox.
class InboxScreen extends StatefulWidget {
  const InboxScreen({super.key});

  @override
  State<InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends State<InboxScreen> {
  String _searchQuery = '';
  bool _hasRequestedChats = false;

  /// Resolved lazily per chat, since a chat document holds participant ids
  /// rather than names.
  final Map<String, String> _namesByChatId = {};
  final Set<String> _resolvingChatIds = {};

  ChatController? _controller;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final controller = context.read<ChatController>();
      _controller = controller;
      controller.addListener(_onChatsChanged);
      setState(() => _hasRequestedChats = true);
      controller.loadChats();
      _resolveNames(controller.chats);
    });
  }

  @override
  void dispose() {
    // The previous implementation added this listener and never removed it, so
    // each time the inbox was rebuilt another one was left attached.
    _controller?.removeListener(_onChatsChanged);
    super.dispose();
  }

  void _onChatsChanged() {
    final controller = _controller;
    if (controller == null) return;

    final activeChatIds = controller.chats.map((chat) => chat.id).toSet();
    _namesByChatId.removeWhere((chatId, _) => !activeChatIds.contains(chatId));
    _resolveNames(controller.chats);
  }

  Future<void> _resolveNames(List<Chat> chats) async {
    final authController = context.read<AuthController>();
    final currentUserId = authController.currentUser?.uid;
    if (currentUserId == null) return;

    final unresolved = chats
        .where(
          (chat) =>
              !_namesByChatId.containsKey(chat.id) &&
              !_resolvingChatIds.contains(chat.id),
        )
        .toList();
    if (unresolved.isEmpty) return;

    _resolvingChatIds.addAll(unresolved.map((chat) => chat.id));

    final resolvedNames = await Future.wait(
      unresolved.map((chat) async {
        final others =
            chat.participants.where((id) => id != currentUserId).toList();
        if (others.isEmpty) {
          return MapEntry(chat.id, 'Unknown User');
        }
        try {
          final name =
              (await authController.fetchUserNameById(others.first)).trim();
          return MapEntry(
            chat.id,
            name.isEmpty ? 'Unknown User' : name,
          );
        } catch (error) {
          debugPrint(
            '[InboxScreen] participant name lookup failed for '
            '${others.first}: $error',
          );
          return MapEntry(chat.id, 'Unknown User');
        }
      }),
    );

    _resolvingChatIds.removeAll(unresolved.map((chat) => chat.id));
    if (!mounted) return;

    final activeChatIds =
        (_controller?.chats ?? const <Chat>[]).map((chat) => chat.id).toSet();
    for (final entry in resolvedNames) {
      if (activeChatIds.contains(entry.key)) {
        _namesByChatId[entry.key] = entry.value;
      }
    }
    setState(() {});
  }

  Future<bool> _confirmDelete(Chat chat) async {
    final confirmed = await showAppConfirmationSheet(
      context: context,
      title: 'Delete this conversation?',
      message: 'It will be removed from your inbox. This cannot be undone.',
      confirmLabel: 'Delete',
      tone: AppConfirmationTone.destructive,
    );

    if (!confirmed || !mounted) return false;

    if (!await OfflineActionGuard.ensureOnline(
      context,
      action: 'delete this chat',
    )) {
      return false;
    }
    if (!mounted) return false;

    try {
      await context.read<ChatController>().deleteChatForUser(chat.id);
      return true;
    } catch (error) {
      debugPrint('[InboxScreen] delete failed for ${chat.id}: $error');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'The conversation could not be deleted. Please try again.',
            ),
            backgroundColor: AppColors.danger,
          ),
        );
      }
      return false;
    }
  }

  void _openThread(InboxThread thread) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ChatScreen(
          chatId: thread.chatId,
          otherUserName: thread.name,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final chatController = context.watch<ChatController>();
    final currentUserId =
        context.watch<AuthController>().currentUser?.uid ?? '';
    final now = DateTime.now();

    final threads = buildInboxThreads(
      chats: chatController.chats,
      namesByChatId: _namesByChatId,
      currentUserId: currentUserId,
      now: now,
      query: _searchQuery,
    );

    // The header counts the whole inbox directly from chat data. Participant
    // names and search filtering must not make unread messages disappear.
    final totalUnread = chatController.chats.fold<int>(
      0,
      (sum, chat) => sum + (chat.unreadCounts[currentUserId] ?? 0),
    );
    final unresolvedNameCount = chatController.chats
        .where((chat) => !_namesByChatId.containsKey(chat.id))
        .length;
    final showInitialLoading = threads.isEmpty &&
        (!_hasRequestedChats ||
            chatController.isLoading ||
            unresolvedNameCount > 0);

    return Scaffold(
      backgroundColor: AppColors.ink,
      body: Material(
        color: AppColors.ink,
        child: SafeArea(
          bottom: false,
          child: Column(
            children: [
              _Header(
                unreadCount: totalUnread,
                onSearchChanged: (value) =>
                    setState(() => _searchQuery = value),
                onNewChat: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const NewChatScreen()),
                ),
              ),
              Expanded(
                child: ContentSheet.fixed(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.screenH,
                    AppSpacing.md,
                    AppSpacing.screenH,
                    0,
                  ),
                  child: showInitialLoading
                      ? const _InboxLoadingList()
                      : threads.isEmpty
                          ? _EmptyInbox(
                              hasQuery: _searchQuery.trim().isNotEmpty)
                          : ListView.builder(
                              key: const Key('inbox-list'),
                              padding: EdgeInsets.zero,
                              itemCount: threads.length,
                              itemBuilder: (context, index) {
                                final thread = threads[index];
                                final chat = chatController.chats
                                    .firstWhere((c) => c.id == thread.chatId);

                                return Dismissible(
                                  key: Key(thread.chatId),
                                  direction: DismissDirection.endToStart,
                                  background: const _DeleteBackground(),
                                  confirmDismiss: (_) => _confirmDelete(chat),
                                  child: ConversationRow(
                                    name: thread.name,
                                    preview: thread.preview,
                                    timeLabel: thread.timeLabel,
                                    unreadCount: thread.unreadCount,
                                    initials: thread.initials,
                                    avatarImage: thread.isTeam
                                        ? const AssetImage(
                                            'lib/assets/img/icon.png',
                                          )
                                        : null,
                                    showDivider: index < threads.length - 1,
                                    onTap: () => _openThread(thread),
                                  ),
                                );
                              },
                            ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _InboxLoadingList extends StatelessWidget {
  const _InboxLoadingList();

  @override
  Widget build(BuildContext context) {
    return const Column(
      key: Key('inbox-loading'),
      children: [
        _ConversationSkeleton(),
        _ConversationSkeleton(),
        _ConversationSkeleton(),
      ],
    );
  }
}

class _ConversationSkeleton extends StatelessWidget {
  const _ConversationSkeleton();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 15),
      child: Row(
        children: [
          const SkeletonBlock(
            height: 48,
            width: 48,
            radius: AppRadii.tile + 2,
          ),
          const SizedBox(width: 13),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SkeletonBlock(
                  height: 14,
                  width: 130,
                  radius: AppRadii.pill,
                ),
                SizedBox(height: AppSpacing.sm),
                SkeletonBlock(height: 11, radius: AppRadii.pill),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.labelGap),
          const SkeletonBlock(
            height: 11,
            width: 42,
            radius: AppRadii.pill,
          ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  final int unreadCount;
  final ValueChanged<String> onSearchChanged;
  final VoidCallback onNewChat;

  const _Header({
    required this.unreadCount,
    required this.onSearchChanged,
    required this.onNewChat,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.sm,
        AppSpacing.screenH,
        AppSpacing.xl,
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Messages',
                      style: AppText.display(fontSize: 27, color: Colors.white),
                    ),
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      unreadCount == 0
                          ? 'All caught up'
                          : '$unreadCount unread',
                      style: AppText.body(
                        fontSize: 12.5,
                        color: Colors.white.withValues(alpha: 0.55),
                      ),
                    ),
                  ],
                ),
              ),
              Semantics(
                button: true,
                label: 'Start a new conversation',
                child: Material(
                  color: AppColors.blue,
                  shape: const CircleBorder(),
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: onNewChat,
                    child: const SizedBox(
                      width: 42,
                      height: 42,
                      child: Icon(
                        Icons.add_rounded,
                        color: Colors.white,
                        size: 22,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          SearchField(
            hintText: 'Search by name…',
            onChanged: onSearchChanged,
          ),
        ],
      ),
    );
  }
}

class _DeleteBackground extends StatelessWidget {
  const _DeleteBackground();

  @override
  Widget build(BuildContext context) {
    return Container(
      alignment: Alignment.centerRight,
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
      color: AppColors.danger,
      child: const Icon(Icons.delete_outline_rounded, color: Colors.white),
    );
  }
}

class _EmptyInbox extends StatelessWidget {
  final bool hasQuery;

  const _EmptyInbox({required this.hasQuery});

  @override
  Widget build(BuildContext context) {
    // A search that matches nothing is not the same as having no messages; the
    // offline case is different again, which the existing notice handles.
    if (hasQuery) {
      return const EmptyStateView(
        icon: Icons.search_off_rounded,
        title: 'No matching conversations',
        message: 'Try a different name.',
      );
    }

    return const OfflineAwareEmptyState(
      emptyMessage: 'No messages yet',
      offlineEmptyMessage: 'No saved messages available offline.',
    );
  }
}
