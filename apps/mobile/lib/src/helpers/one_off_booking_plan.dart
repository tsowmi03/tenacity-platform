import 'dart:math';

import 'package:flutter/foundation.dart';

@immutable
class OneOffBookingPlan {
  final List<String> tokenStudentIds;
  final List<String> paidStudentIds;

  const OneOffBookingPlan._({
    required this.tokenStudentIds,
    required this.paidStudentIds,
  });

  factory OneOffBookingPlan.fromSelection({
    required List<String> selectedChildIds,
    required int availableTokens,
  }) {
    final tokensToUse = min(max(availableTokens, 0), selectedChildIds.length);
    return OneOffBookingPlan._(
      tokenStudentIds:
          List.unmodifiable(selectedChildIds.take(tokensToUse).toList()),
      paidStudentIds:
          List.unmodifiable(selectedChildIds.skip(tokensToUse).toList()),
    );
  }

  int get tokensToUse => tokenStudentIds.length;
  int get paidBookings => paidStudentIds.length;
  bool get requiresPayment => paidStudentIds.isNotEmpty;
}
