import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:flutter_stripe/flutter_stripe.dart';

import '../controllers/invoice_controller.dart';
import '../models/invoice_model.dart';

class InvoicesScreen extends StatefulWidget {
  final String parentId;
  const InvoicesScreen({super.key, required this.parentId});

  @override
  State<InvoicesScreen> createState() => _InvoicesScreenState();
}

class _InvoicesScreenState extends State<InvoicesScreen> {
  bool _isProcessingPayment = false;

  @override
  void initState() {
    super.initState();
    // Start listening to invoices for the given parent.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context
          .read<InvoiceController>()
          .listenToInvoicesForParent(widget.parentId);
    });
  }

  @override
  Widget build(BuildContext context) {
    final invoiceController = context.watch<InvoiceController>();
    final bool isLoading = invoiceController.isLoading;
    final invoices = invoiceController.invoices;

    // Sort invoices by status and creation date.
    invoices.sort((a, b) {
      final statusOrderA = _statusRank(a.status);
      final statusOrderB = _statusRank(b.status);
      if (statusOrderA != statusOrderB) {
        return statusOrderA.compareTo(statusOrderB);
      } else {
        return b.createdAt.compareTo(a.createdAt);
      }
    });

    // Calculate total outstanding amount.
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
      body: isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                _buildOutstandingHeader(outstandingAmount),
                Expanded(
                  child: invoices.isEmpty
                      ? const Center(child: Text("No invoices found."))
                      : ListView.builder(
                          itemCount: invoices.length,
                          itemBuilder: (context, index) {
                            final invoice = invoices[index];
                            return _buildInvoiceListTile(invoice);
                          },
                        ),
                ),
              ],
            ),
    );
  }

  Widget _buildOutstandingHeader(double outstandingAmount) {
    return Padding(
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
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            // Wrap the text in an Expanded so it can shrink if needed
            Expanded(
              child: Row(
                children: [
                  const Text(
                    'Total Outstanding: ',
                    style: TextStyle(
                      fontSize: 16.6,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                    '\$${outstandingAmount.toStringAsFixed(2)}',
                    style: const TextStyle(
                      fontSize: 16.6,
                      fontWeight: FontWeight.bold,
                      color: Colors.red,
                    ),
                  ),
                ],
              ),
            ),

            // Only show button if there's something to pay
            if (outstandingAmount > 0)
              ElevatedButton.icon(
                onPressed: _isProcessingPayment
                    ? null
                    : () async {
                        // ... existing payment logic ...
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
    );
  }

  Widget _buildInvoiceListTile(Invoice invoice) {
    // Use the stored line items to display names.
    final studentNames = invoice.lineItems
        .map((line) => line['studentName'] as String? ?? '')
        .where((name) => name.isNotEmpty)
        .toSet()
        .toList();

    final nameString = studentNames.join(" and ");

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
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
          'Invoice for $nameString',
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
          debugPrint("Tapped on Invoice #${invoice.id}");
        },
      ),
    );
  }

  Widget _buildTrailingActions(Invoice invoice) {
    final isPaid = invoice.status == InvoiceStatus.paid;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        IconButton(
          onPressed: () {
            debugPrint("View PDF for Invoice #${invoice.id}");
          },
          icon: const Icon(Icons.picture_as_pdf),
          tooltip: 'View PDF',
        ),
        if (!isPaid)
          ElevatedButton.icon(
            onPressed: _isProcessingPayment
                ? null
                : () async {
                    setState(() {
                      _isProcessingPayment = true;
                    });
                    final paymentController = context.read<InvoiceController>();
                    try {
                      final clientSecret =
                          await paymentController.initiatePayment(
                        amount: invoice.amountDue,
                        currency: 'aud',
                      );
                      await Stripe.instance.initPaymentSheet(
                        paymentSheetParameters: SetupPaymentSheetParameters(
                          paymentIntentClientSecret: clientSecret,
                          merchantDisplayName: 'Tenacity App',
                        ),
                      );
                      await Stripe.instance.presentPaymentSheet();
                      final isVerified = await paymentController
                          .verifyPaymentStatus(clientSecret);
                      if (isVerified) {
                        await context
                            .read<InvoiceController>()
                            .updateInvoiceAfterPayment(
                                invoice.id, invoice.amountDue);
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text("Payment successful!")),
                        );
                      } else {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                              content: Text("Payment could not be verified.")),
                        );
                      }
                    } catch (error) {
                      debugPrint("Payment failed: ${error.toString()}");
                    } finally {
                      setState(() {
                        _isProcessingPayment = false;
                      });
                    }
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

  int _statusRank(InvoiceStatus status) {
    switch (status) {
      case InvoiceStatus.overdue:
        return 0;
      case InvoiceStatus.unpaid:
        return 1;
      case InvoiceStatus.paid:
        return 3;
    }
  }

  Widget _buildStatusChip(InvoiceStatus status) {
    final String label = status.value;
    Color chipColor;
    switch (status) {
      case InvoiceStatus.unpaid:
        chipColor = Colors.orange;
        break;
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
}

extension DateTimeExtension on DateTime {
  String toShortDateString() {
    final DateFormat formatter = DateFormat('dd/MM/yyyy');
    return formatter.format(this);
  }
}
