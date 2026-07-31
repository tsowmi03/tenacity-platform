import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// A conversation in the inbox: a rounded-square avatar, the other party's
/// name, a one-line preview of the last message, the time, and an unread count.
///
/// Unread threads are pulled forward — a solid avatar, heavier name and
/// preview, a blue timestamp and a count badge — so a scan down the list lands
/// on what still needs reading.
class ConversationRow extends StatelessWidget {
  final String name;
  final String preview;
  final String timeLabel;
  final int unreadCount;

  /// Initials shown when [avatarImage] is null.
  final String initials;

  /// Used for identities with real branding, such as the Tenacity team.
  final ImageProvider? avatarImage;

  final VoidCallback? onTap;
  final bool showDivider;

  const ConversationRow({
    super.key,
    required this.name,
    required this.preview,
    required this.timeLabel,
    required this.initials,
    this.unreadCount = 0,
    this.avatarImage,
    this.onTap,
    this.showDivider = true,
  });

  bool get _isUnread => unreadCount > 0;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.paper,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 15),
          decoration: BoxDecoration(
            border: showDivider
                ? const Border(bottom: BorderSide(color: AppColors.lineSoft))
                : null,
          ),
          child: Row(
            children: [
              _Avatar(
                initials: initials,
                image: avatarImage,
                highlighted: _isUnread,
              ),
              const SizedBox(width: 13),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.body(
                        fontSize: 15,
                        fontWeight:
                            _isUnread ? FontWeight.w700 : FontWeight.w600,
                        color: AppColors.ink,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      preview,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.body(
                        fontSize: 13,
                        fontWeight:
                            _isUnread ? FontWeight.w600 : FontWeight.w400,
                        color: _isUnread ? AppColors.text : AppColors.muted,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.labelGap),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    timeLabel,
                    style: AppText.body(
                      fontSize: 11,
                      fontWeight: _isUnread ? FontWeight.w700 : FontWeight.w400,
                      color: _isUnread ? AppColors.blue : AppColors.muted,
                    ),
                  ),
                  if (_isUnread) ...[
                    const SizedBox(height: 5),
                    _UnreadBadge(count: unreadCount),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  final String initials;
  final ImageProvider? image;
  final bool highlighted;

  const _Avatar({
    required this.initials,
    required this.image,
    required this.highlighted,
  });

  @override
  Widget build(BuildContext context) {
    if (image != null) {
      return Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          color: AppColors.paper,
          border: Border.all(color: AppColors.line),
          borderRadius: BorderRadius.circular(AppRadii.tile + 2),
          image: DecorationImage(image: image!, fit: BoxFit.contain),
        ),
      );
    }

    return Container(
      width: 48,
      height: 48,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: highlighted ? AppColors.blue : AppColors.blue100,
        borderRadius: BorderRadius.circular(AppRadii.tile + 2),
      ),
      child: Text(
        initials,
        style: AppText.display(
          fontSize: 16,
          color: highlighted ? Colors.white : AppColors.navy,
        ),
      ),
    );
  }
}

class _UnreadBadge extends StatelessWidget {
  final int count;

  const _UnreadBadge({required this.count});

  @override
  Widget build(BuildContext context) {
    // Past 99 the number stops being useful and starts breaking the circle.
    final label = count > 99 ? '99+' : '$count';

    return Container(
      constraints: const BoxConstraints(minWidth: AppSpacing.xl),
      height: AppSpacing.xl,
      padding: EdgeInsets.symmetric(horizontal: count > 9 ? 5 : 0),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: AppColors.blue,
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      child: Text(
        label,
        style: AppText.body(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: Colors.white,
        ),
      ),
    );
  }
}
