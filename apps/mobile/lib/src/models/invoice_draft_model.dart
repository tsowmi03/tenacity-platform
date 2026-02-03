class InvoiceDraft {
  InvoiceDraft({
    required this.parentId,
    required this.parentName,
    required this.parentEmail,
    required this.lineItems,
    required this.weeks,
    required this.dueDate,
    required this.computedTotal,
    this.studentIds = const [],
    this.overrideTotal,
    this.adminNotes,
    this.createdByAdminId,
  });

  final String parentId;
  final String parentName;
  final String parentEmail;

  /// Editable line items.
  /// Expected keys: description(String), quantity(int), unitAmount(num), lineTotal(num)
  final List<Map<String, dynamic>> lineItems;

  final int weeks;
  final DateTime dueDate;

  /// What the system calculated before admin changes.
  final double computedTotal;

  final List<String> studentIds;

  /// If set, invoice amountDue will use this number.
  final double? overrideTotal;

  final String? adminNotes;
  final String? createdByAdminId;

  double get lineItemsTotal {
    return lineItems.fold<double>(
      0,
      (sum, li) => sum + ((li['lineTotal'] as num?)?.toDouble() ?? 0.0),
    );
  }

  double get finalTotal => overrideTotal ?? lineItemsTotal;

  InvoiceDraft copyWith({
    List<Map<String, dynamic>>? lineItems,
    int? weeks,
    DateTime? dueDate,
    double? computedTotal,
    List<String>? studentIds,
    double? overrideTotal,
    String? adminNotes,
    String? createdByAdminId,
  }) {
    return InvoiceDraft(
      parentId: parentId,
      parentName: parentName,
      parentEmail: parentEmail,
      lineItems: lineItems ?? this.lineItems,
      weeks: weeks ?? this.weeks,
      dueDate: dueDate ?? this.dueDate,
      computedTotal: computedTotal ?? this.computedTotal,
      studentIds: studentIds ?? this.studentIds,
      overrideTotal: overrideTotal ?? this.overrideTotal,
      adminNotes: adminNotes ?? this.adminNotes,
      createdByAdminId: createdByAdminId ?? this.createdByAdminId,
    );
  }
}
