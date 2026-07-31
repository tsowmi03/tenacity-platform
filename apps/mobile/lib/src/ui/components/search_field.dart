import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// The pill search box that sits in the navy header on list screens.
///
/// Styled for a dark background. On the white content sheet use the app
/// theme's own input decoration instead.
class SearchField extends StatefulWidget {
  final String hintText;
  final ValueChanged<String> onChanged;
  final String initialValue;

  const SearchField({
    super.key,
    required this.hintText,
    required this.onChanged,
    this.initialValue = '',
  });

  @override
  State<SearchField> createState() => _SearchFieldState();
}

class _SearchFieldState extends State<SearchField> {
  late final TextEditingController _controller =
      TextEditingController(text: widget.initialValue);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _clear() {
    _controller.clear();
    widget.onChanged('');
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 17),
      decoration: BoxDecoration(
        color: AppColors.onInkSurface,
        border: Border.all(color: AppColors.onInkBorder),
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      child: Row(
        children: [
          Icon(
            Icons.search_rounded,
            size: AppSpacing.lg,
            color: Colors.white.withValues(alpha: 0.55),
          ),
          const SizedBox(width: AppSpacing.labelGap),
          Expanded(
            child: TextField(
              controller: _controller,
              onChanged: (value) {
                widget.onChanged(value);
                setState(() {});
              },
              style: AppText.body(fontSize: 14, color: Colors.white),
              cursorColor: Colors.white,
              decoration: InputDecoration(
                isDense: true,
                filled: false,
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                contentPadding: const EdgeInsets.symmetric(vertical: 11),
                hintText: widget.hintText,
                hintStyle: AppText.body(
                  fontSize: 14,
                  color: Colors.white.withValues(alpha: 0.55),
                ),
              ),
            ),
          ),
          if (_controller.text.isNotEmpty)
            Semantics(
              button: true,
              label: 'Clear search',
              child: InkWell(
                onTap: _clear,
                customBorder: const CircleBorder(),
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.xs),
                  child: Icon(
                    Icons.close_rounded,
                    size: AppSpacing.lg,
                    color: Colors.white.withValues(alpha: 0.55),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
