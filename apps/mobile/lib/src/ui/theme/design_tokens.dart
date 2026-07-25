import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Brand tokens ported from the Tenacity Tutoring Claude Design system.
/// Names mirror the source CSS custom properties (--ink, --navy, etc).
class AppColors {
  static const ink = Color(0xFF112D4F);
  static const navy = Color(0xFF1B3F71);
  static const blue = Color(0xFF1C71AF);
  static const blue600 = Color(0xFF145A8A);
  static const blue300 = Color(0xFF5AA5E3);
  static const blue100 = Color(0xFFD6EBF7);
  static const blue50 = Color(0xFFEEF5FB);
  static const gold = Color(0xFF5AA5E3);
  static const cream = Color(0xFFFBF8F3);
  static const paper = Color(0xFFFFFFFF);
  static const text = Color(0xFF243A57);
  static const muted = Color(0xFF61728A);
  static const line = Color(0x1A112D4F);
  static const lineSoft = Color(0x0F112D4F);

  /// Semantic status colours. `danger` marks an attention row that needs action;
  /// `unread` is the smaller dot used on counts and navigation badges. They are
  /// deliberately different reds — the design uses both.
  static const danger = Color(0xFFD64545);
  static const unread = Color(0xFFE05A5A);
  static const success = Color(0xFF2E7D5B);
  static const warning = Color(0xFFB4741C);
  static const info = blue;
  static const disabled = Color(0xFF9AA7B8);
  static const skeleton = Color(0xFFE8EDF3);

  /// Scrim behind modal surfaces.
  static const scrim = Color(0x66112D4F);

  /// Foreground values for content sitting on the navy header. Expressed as
  /// literal ARGB so they stay usable in const constructors; the comment gives
  /// the alpha they were derived from.
  static const onInkSurface = Color(0x12FFFFFF); // white @ 7%
  static const onInkBorder = Color(0x1CFFFFFF); // white @ 11%
  static const onInkAvatarBorder = Color(0x38FFFFFF); // white @ 22%
  static const onInkMuted = Color(0x99FFFFFF); // white @ 60%
  static const onInkSubtitle = Color(0x9EFFFFFF); // white @ 62%
}

class AppRadii {
  static const sm = 12.0;
  static const md = 18.0;
  static const lg = 26.0;
  static const pill = 999.0;

  /// Top corners of the white content sheet that overlaps the navy header.
  static const sheet = 28.0;

  /// Metric tiles in the header sit slightly tighter than [sm].
  static const tile = 14.0;
}

/// Layout constants taken from the reference designs. These are named rather
/// than placed on an arithmetic scale because the source uses deliberate
/// off-scale values (9, 13, 22) that a rounded scale would quietly change.
class AppSpacing {
  static const xxs = 2.0;
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 20.0;
  static const xxl = 24.0;

  /// Horizontal padding for the header and the content sheet.
  static const screenH = 22.0;

  /// Gap between metric tiles in the header row.
  static const tileGap = 9.0;

  /// Vertical gap between sections inside the content sheet.
  static const sectionGap = 14.0;

  /// Gap between a section label and the block beneath it.
  static const labelGap = 10.0;
}

/// Control sizes and stroke weights.
class AppSizes {
  static const avatar = 44.0;
  static const attentionDot = 8.0;
  static const unreadDot = 7.0;

  /// The vertical rule separating the time column from a ledger row's content.
  static const ledgerRuleWidth = 3.0;
  static const ledgerRuleHeight = 38.0;

  /// Width of the leading time column in a ledger row.
  static const ledgerTimeColumn = 50.0;

  static const navIcon = 21.0;
  static const quickActionIcon = 20.0;

  /// Minimum tappable extent, per platform accessibility guidance.
  static const minTouchTarget = 48.0;

  /// Letter spacing for uppercase section labels: 0.14em at 11px.
  static const sectionLabelTracking = 1.54;
}

/// Animation durations. Named by intent so screens do not invent their own.
class AppDurations {
  static const fast = Duration(milliseconds: 120);
  static const normal = Duration(milliseconds: 220);
  static const slow = Duration(milliseconds: 360);
}

class AppShadows {
  static List<BoxShadow> sm = [
    BoxShadow(
      color: AppColors.ink.withValues(alpha: 0.06),
      blurRadius: 8,
      offset: const Offset(0, 2),
    ),
  ];

  static List<BoxShadow> md = [
    BoxShadow(
      color: AppColors.ink.withValues(alpha: 0.28),
      blurRadius: 38,
      spreadRadius: -16,
      offset: const Offset(0, 14),
    ),
  ];

  /// Cast upward by the white content sheet over the navy header.
  /// Source: `box-shadow: 0 -12px 30px rgba(0,0,0,.25)`.
  static const List<BoxShadow> sheet = [
    BoxShadow(
      color: Color(0x40000000),
      blurRadius: 30,
      offset: Offset(0, -12),
    ),
  ];
}

class AppText {
  static TextStyle display({
    double fontSize = 22,
    FontWeight fontWeight = FontWeight.w700,
    Color color = AppColors.ink,
  }) =>
      GoogleFonts.bricolageGrotesque(
        fontSize: fontSize,
        fontWeight: fontWeight,
        color: color,
      );

  static TextStyle body({
    double fontSize = 16,
    FontWeight fontWeight = FontWeight.w400,
    Color color = AppColors.text,
  }) =>
      GoogleFonts.plusJakartaSans(
        fontSize: fontSize,
        fontWeight: fontWeight,
        color: color,
      );

  static TextStyle serif({
    double fontSize = 16,
    FontWeight fontWeight = FontWeight.w400,
    FontStyle fontStyle = FontStyle.italic,
    Color color = AppColors.text,
  }) =>
      GoogleFonts.newsreader(
        fontSize: fontSize,
        fontWeight: fontWeight,
        fontStyle: fontStyle,
        color: color,
      );
}
