import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:tenacity/src/models/invoice_model.dart';

class InvoicesScreen extends StatelessWidget {
  const InvoicesScreen({super.key});

  /// Dummy data for demonstration purposes.
  List<Invoice> get dummyInvoices => [
        Invoice(
          id: '1',
          parentId: 'user123',
          amountDue: 150.00,
          status: InvoiceStatus.paid,
          dueDate: DateTime.now().add(const Duration(days: 10)),
          createdAt: DateTime.now().subtract(const Duration(days: 30)),
        ),
        // Invoice(
        //   id: '2',
        //   parentId: 'user123',
        //   amountDue: 75.50,
        //   status: InvoiceStatus.partial,
        //   dueDate: DateTime.now().add(const Duration(days: 5)),
        //   createdAt: DateTime.now().subtract(const Duration(days: 25)),
        // ),
        Invoice(
          id: '2',
          parentId: 'user123',
          amountDue: 200.00,
          status: InvoiceStatus.unpaid,
          dueDate: DateTime.now().subtract(const Duration(days: 1)),
          createdAt: DateTime.now().subtract(const Duration(days: 40)),
        ),
        Invoice(
          id: '3',
          parentId: 'user123',
          amountDue: 300.00,
          status: InvoiceStatus.overdue,
          dueDate: DateTime.now().subtract(const Duration(days: 6)),
          createdAt: DateTime.now().subtract(const Duration(days: 40)),
        ),
        Invoice(
          id: '3',
          parentId: 'user123',
          amountDue: 300.00,
          status: InvoiceStatus.overdue,
          dueDate: DateTime.now().subtract(const Duration(days: 3)),
          createdAt: DateTime.now().subtract(const Duration(days: 60)),
        ),
      ];

  @override
  Widget build(BuildContext context) {
    // Make a copy so we can sort without mutating the original list
    final List<Invoice> invoices = List.from(dummyInvoices);

    // Sort by status (overdue -> unpaid -> paid),
    // then sort descending by createdAt (most recent first).
    invoices.sort((a, b) {
      final statusOrderA = _statusRank(a.status);
      final statusOrderB = _statusRank(b.status);

      if (statusOrderA != statusOrderB) {
        return statusOrderA.compareTo(statusOrderB);
      } else {
        // Within the same status, compare by createdAt descending
        return b.createdAt.compareTo(a.createdAt);
      }
    });

    // Calculate outstanding amount
    final outstandingAmount = invoices.fold<double>(0.0, (sum, invoice) {
      if (invoice.status != InvoiceStatus.paid) {
        return sum + invoice.amountDue;
      }
      return sum;
    });

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          "Invoices",
          style: TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
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
      body: Column(
        children: [
          // Header Summary Section
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Container(
              padding: const EdgeInsets.all(16.0),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12.0),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.3),
                    blurRadius: 5,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Row(
                children: [
                  const Text(
                    'Total Outstanding: ',
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                    '\$${outstandingAmount.toStringAsFixed(2)}   ',
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.bold,
                      color: Colors.red,
                    ),
                  ),
                  ElevatedButton.icon(
                    onPressed: () {
                      // TODO: Implement "Pay All Invoices" functionality.
                      debugPrint("Pay All Invoices tapped");
                    },
                    icon: const Icon(Icons.payment),
                    label: const Text('Pay All'),
                    style: ElevatedButton.styleFrom(
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8.0),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // List of Invoice Cards
          Expanded(
            child: ListView.builder(
              itemCount: invoices.length,
              itemBuilder: (context, index) {
                final invoice = invoices[index];

                return Container(
                  margin: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.3),
                        blurRadius: 4,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: ListTile(
                    contentPadding: const EdgeInsets.all(16.0),
                    title: Text(
                      'Invoice #${invoice.id}',
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    subtitle: Padding(
                      padding: const EdgeInsets.only(top: 8.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Due: ${invoice.dueDate.toShortDateString()}',
                            style: TextStyle(
                              color: Colors.grey.shade600,
                              fontSize: 14,
                            ),
                          ),
                          Text(
                            'Amount: \$${invoice.amountDue.toStringAsFixed(2)}',
                            style: TextStyle(
                              color: Colors.grey.shade600,
                              fontSize: 14,
                            ),
                          ),
                          const SizedBox(height: 4),
                          // Status Chip
                          Row(
                            children: [
                              _buildStatusChip(invoice.status),
                            ],
                          ),
                        ],
                      ),
                    ),
                    trailing: _buildTrailingActions(invoice),
                    onTap: () {
                      // TODO: Navigate to a detailed invoice screen.
                      debugPrint("Tapped on Invoice #${invoice.id}");
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  /// Assign each status an integer rank to define the sort order.
  /// Lower rank means higher priority (comes first).
  int _statusRank(InvoiceStatus status) {
    switch (status) {
      case InvoiceStatus.overdue:
        return 0; // highest priority
      case InvoiceStatus.unpaid:
        return 1;
      // case InvoiceStatus.partial:
      //   return 2; // if you re-enable partial, give it a rank
      case InvoiceStatus.paid:
        return 3; // lowest priority
    }
  }

  /// Build a color-coded chip for the invoice status.
  Widget _buildStatusChip(InvoiceStatus status) {
    final String label = status.value;
    final Color? chipColor;
    switch (status) {
      case InvoiceStatus.unpaid:
        chipColor = Colors.orange;
        break;
      // case InvoiceStatus.partial:
      //   chipColor = Colors.orange[200];
      //   break;
      case InvoiceStatus.paid:
        chipColor = Colors.green;
        break;
      case InvoiceStatus.overdue:
        chipColor = Colors.red;
        break;
    }

    return Chip(
      label: Text(
        label.toUpperCase(),
        style: const TextStyle(color: Colors.white, fontSize: 12),
      ),
      backgroundColor: chipColor,
      padding: const EdgeInsets.symmetric(horizontal: 8),
    );
  }

  /// Build trailing actions for each invoice.
  /// Shows "View PDF" and "Pay Now" (if applicable).
  Widget _buildTrailingActions(Invoice invoice) {
    final isPaid = invoice.status == InvoiceStatus.paid;

    // If invoice is paid, only show "View PDF".
    // If invoice is unpaid (or partial if it were enabled), show both.
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        // View PDF icon button
        IconButton(
          onPressed: () {
            // TODO: Implement PDF viewing functionality
            debugPrint("View PDF for Invoice #${invoice.id}");
          },
          icon: const Icon(Icons.picture_as_pdf),
          tooltip: 'View PDF',
        ),
        if (!isPaid)
          ElevatedButton.icon(
            onPressed: () {
              // TODO: Implement individual invoice payment.
              debugPrint("Pay Now tapped for Invoice #${invoice.id}");
            },
            icon: const Icon(Icons.payment),
            label: const Text('Pay Now'),
            style: ElevatedButton.styleFrom(
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8.0),
              ),
            ),
          ),
      ],
    );
  }
}

/// Simple extension to format the DateTime.
extension DateTimeExtension on DateTime {
  String toShortDateString() {
    final DateFormat formatter = DateFormat('dd/MM/yyyy');
    return formatter.format(this);
  }
}
