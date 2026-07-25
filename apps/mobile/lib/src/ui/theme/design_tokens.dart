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
}

class AppRadii {
  static const sm = 12.0;
  static const md = 18.0;
  static const lg = 26.0;
  static const pill = 999.0;
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
