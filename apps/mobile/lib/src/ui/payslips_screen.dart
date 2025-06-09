import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../controllers/payslip_controller.dart';
import '../models/payslip_model.dart';

class PayslipsScreen extends StatefulWidget {
  final String userId;
  const PayslipsScreen({super.key, required this.userId});

  @override
  State<PayslipsScreen> createState() => _PayslipsScreenState();
}

class _PayslipsScreenState extends State<PayslipsScreen> {
  final Map<String, String?> _pdfUrlCache = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<PayslipController>().listenToPayslipsForTutor(widget.userId);
    });
  }

  @override
  Widget build(BuildContext context) {
    final payslipController = context.watch<PayslipController>();
    final isLoading = payslipController.isLoading;
    final payslips = payslipController.payslips;

    // Sort by period end date, newest first
    payslips.sort((a, b) => b.periodEnd.compareTo(a.periodEnd));

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          "Payslips",
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
          : payslips.isEmpty
              ? const Center(child: Text("No payslips found."))
              : ListView.builder(
                  itemCount: payslips.length,
                  itemBuilder: (context, index) {
                    final payslip = payslips[index];
                    return _buildPayslipListTile(payslip);
                  },
                ),
    );
  }

  Widget _buildPayslipListTile(Payslip payslip) {
    final period =
        "${DateFormat('dd MMM yyyy').format(payslip.periodStart)} - ${DateFormat('dd MMM yyyy').format(payslip.periodEnd)}";
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.15),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.all(16.0),
        title: Text(
          'Payslip for $period',
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
              // Text(
              //   'Tutor: ${payslip.tutorName}',
              //   style: TextStyle(
              //     color: Colors.grey.shade700,
              //     fontSize: 14,
              //   ),
              // ),
              Text(
                'Hours Worked: ${payslip.hoursWorked.toStringAsFixed(2)}',
                style: TextStyle(
                  color: Colors.grey.shade700,
                  fontSize: 14,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                'Gross: \$${payslip.grossPay.toStringAsFixed(2)}',
                style: TextStyle(
                  color: Colors.grey.shade700,
                  fontSize: 14,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                'Deductions: \$${payslip.deductions.toStringAsFixed(2)}',
                style: TextStyle(
                  color: Colors.grey.shade700,
                  fontSize: 14,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                'Net Pay: \$${payslip.netPay.toStringAsFixed(2)}',
                style: const TextStyle(
                  color: Colors.green,
                  fontWeight: FontWeight.bold,
                  fontSize: 15,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                'Issued: ${DateFormat('dd/MM/yyyy').format(payslip.createdAt)}',
                style: TextStyle(
                  color: Colors.grey.shade500,
                  fontSize: 13,
                ),
              ),
            ],
          ),
        ),
        trailing: IconButton(
          icon: const Icon(Icons.picture_as_pdf),
          tooltip: 'View PDF',
          onPressed: payslip.pdfUrl == null
              ? null
              : () async {
                  String? pdfUrl = _pdfUrlCache[payslip.id];
                  if (pdfUrl == null) {
                    pdfUrl = payslip.pdfUrl;
                    _pdfUrlCache[payslip.id] = pdfUrl;
                  }
                  final Uri pdfUri = Uri.parse(pdfUrl!);
                  if (await canLaunchUrl(pdfUri)) {
                    await launchUrl(pdfUri);
                  } else {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text("Could not launch PDF URL")),
                    );
                  }
                },
        ),
      ),
    );
  }
}
