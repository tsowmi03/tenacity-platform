import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import 'package:tenacity/src/controllers/invoice_controller.dart';
import 'package:tenacity/src/models/invoice_model.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:tenacity/src/ui/admin_create_invoice_screen.dart';

enum InvoiceFilter { all, unpaid, paid, overdue }

enum InvoiceSortBy { dueDate, amount, createdDate, parentName }

class AdminInvoiceView extends StatefulWidget {
  const AdminInvoiceView({super.key});

  @override
  State<AdminInvoiceView> createState() => _AdminInvoiceViewState();
}

class _AdminInvoiceViewState extends State<AdminInvoiceView> {
  InvoiceFilter _currentFilter = InvoiceFilter.all;
  InvoiceSortBy _currentSort = InvoiceSortBy.dueDate;
  bool _sortAscending = true;
  String _searchQuery = '';
  List<Invoice> _allInvoices = [];
  bool _isLoading = true;
  final Set<String> _selectedInvoices = {};
  bool _isSelectionMode = false;

  @override
  void initState() {
    super.initState();
    _loadInvoices();
  }

  Future<void> _loadInvoices() async {
    setState(() {
      _isLoading = true;
    });

    try {
      final invoiceController = context.read<InvoiceController>();
      final invoices = await invoiceController.getAllInvoices();

      setState(() {
        _allInvoices = invoices;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _isLoading = false;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error loading invoices: $e')),
        );
      }
    }
  }

  List<Invoice> get _filteredAndSortedInvoices {
    List<Invoice> filtered = _allInvoices.where((invoice) {
      // Filter by status
      bool matchesFilter = switch (_currentFilter) {
        InvoiceFilter.all => true,
        InvoiceFilter.unpaid => invoice.status == InvoiceStatus.unpaid,
        InvoiceFilter.paid => invoice.status == InvoiceStatus.paid,
        InvoiceFilter.overdue => invoice.status == InvoiceStatus.overdue,
      };

      // Filter by search query - search parent name or student names
      bool matchesSearch = _searchQuery.isEmpty ||
          invoice.parentName
              .toLowerCase()
              .contains(_searchQuery.toLowerCase()) ||
          invoice.lineItems.any((item) => (item['studentName'] as String? ?? '')
              .toLowerCase()
              .contains(_searchQuery.toLowerCase()));

      return matchesFilter && matchesSearch;
    }).toList();

    // Sort
    filtered.sort((a, b) {
      int comparison = switch (_currentSort) {
        InvoiceSortBy.dueDate => a.dueDate.compareTo(b.dueDate),
        InvoiceSortBy.amount => a.amountDue.compareTo(b.amountDue),
        InvoiceSortBy.createdDate => a.createdAt.compareTo(b.createdAt),
        InvoiceSortBy.parentName => a.parentName.compareTo(b.parentName),
      };

      return _sortAscending ? comparison : -comparison;
    });

    // Prioritize unpaid invoices
    if (_currentFilter == InvoiceFilter.all) {
      final unpaid =
          filtered.where((i) => i.status == InvoiceStatus.unpaid).toList();
      final overdue =
          filtered.where((i) => i.status == InvoiceStatus.overdue).toList();
      final paid =
          filtered.where((i) => i.status == InvoiceStatus.paid).toList();
      return [...overdue, ...unpaid, ...paid];
    }

    return filtered;
  }

  double get _totalUnpaidAmount {
    return _allInvoices
        .where((i) =>
            i.status == InvoiceStatus.unpaid ||
            i.status == InvoiceStatus.overdue)
        .fold(0.0, (sum, invoice) => sum + invoice.amountDue);
  }

  int get _unpaidCount {
    return _allInvoices.where((i) => i.status == InvoiceStatus.unpaid).length;
  }

  int get _overdueCount {
    return _allInvoices.where((i) => i.status == InvoiceStatus.overdue).length;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Invoice Management',
          style: TextStyle(
              color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
        ),
        backgroundColor: const Color(0xFF1C71AF),
        foregroundColor: Colors.white,
        actions: [
          if (_isSelectionMode) ...[
            IconButton(
              icon: const Icon(Icons.check_circle),
              onPressed: _selectedInvoices.isEmpty ? null : _markSelectedAsPaid,
              tooltip: 'Mark Selected as Paid',
            ),
            IconButton(
              icon: const Icon(Icons.clear),
              onPressed: _exitSelectionMode,
              tooltip: 'Cancel Selection',
            ),
          ] else ...[
            IconButton(
              icon: const Icon(Icons.checklist),
              onPressed: _enterSelectionMode,
              tooltip: 'Select Multiple',
            ),
            IconButton(
              icon: const Icon(Icons.refresh),
              onPressed: _loadInvoices,
              tooltip: 'Refresh',
            ),
          ],
        ],
      ),
      body: Consumer<InvoiceController>(
        builder: (context, invoiceController, child) {
          final isControllerLoading = invoiceController.isLoading;

          return (isControllerLoading || _isLoading)
              ? const Center(child: CircularProgressIndicator())
              : Column(
                  children: [
                    _buildSummaryCards(),
                    _buildFiltersAndSearch(),
                    Expanded(child: _buildInvoicesList()),
                  ],
                );
        },
      ),
      floatingActionButton: FloatingActionButton(
        heroTag: 'create-invoice-fab',
        onPressed: () {
          Navigator.of(context)
              .push(
                MaterialPageRoute(
                  builder: (_) => const AdminCreateInvoiceScreen(),
                ),
              )
              .then((_) => _loadInvoices());
        },
        backgroundColor: const Color(0xFF1C71AF),
        child: const Icon(
          Icons.add,
          color: Colors.white,
        ),
      ),
    );
  }

  Widget _buildSummaryCards() {
    return Container(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          Expanded(
            flex: 3, // Reduce from 2 to 3
            child: _buildSummaryCard(
              'Unpaid Total',
              '\$${_totalUnpaidAmount.toStringAsFixed(2)}',
              Colors.red,
              Icons.account_balance_wallet,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            flex: 2, // Increase from 1 to 2
            child: _buildSummaryCard(
              'Overdue',
              '$_overdueCount',
              Colors.orange,
              Icons.warning,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            flex: 2, // Increase from 1 to 2
            child: _buildSummaryCard(
              'Unpaid',
              '$_unpaidCount',
              Colors.blue,
              Icons.pending,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSummaryCard(
      String title, String value, Color color, IconData icon) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12), // Reduced padding
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min, // Important: minimize height
          children: [
            Row(
              children: [
                Icon(icon, color: color, size: 16), // Smaller icon
                const SizedBox(width: 6), // Less spacing
                Expanded(
                  child: Text(
                    title,
                    style: TextStyle(
                      fontSize: 11, // Smaller font
                      color: Colors.grey[600],
                      fontWeight: FontWeight.w500,
                    ),
                    overflow: TextOverflow.ellipsis,
                    maxLines: 1, // Force single line
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6), // Less spacing
            Text(
              value,
              style: TextStyle(
                fontSize: 14, // Smaller value font
                fontWeight: FontWeight.bold,
                color: color,
              ),
              overflow: TextOverflow.ellipsis,
              maxLines: 1, // Force single line
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFiltersAndSearch() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        children: [
          // Search bar
          TextField(
            decoration: InputDecoration(
              hintText: 'Search by parent or student name...',
              prefixIcon: const Icon(Icons.search),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
              ),
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            ),
            onChanged: (value) {
              setState(() {
                _searchQuery = value;
              });
            },
          ),
          const SizedBox(height: 12),
          // Filters and sort
          Row(
            children: [
              // Status filter
              Expanded(
                flex: 3, // Increase flex to give more space
                child: DropdownButtonFormField<InvoiceFilter>(
                  value: _currentFilter,
                  decoration: const InputDecoration(
                    labelText: 'Filter',
                    border: OutlineInputBorder(),
                    contentPadding:
                        EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  ),
                  items: InvoiceFilter.values.map((filter) {
                    return DropdownMenuItem(
                      value: filter,
                      child: Text(_getFilterLabel(filter)),
                    );
                  }).toList(),
                  onChanged: (value) {
                    if (value != null) {
                      setState(() {
                        _currentFilter = value;
                      });
                    }
                  },
                ),
              ),
              const SizedBox(width: 8), // Reduce spacing
              // Sort dropdown
              Expanded(
                flex: 3, // Increase flex to give more space
                child: DropdownButtonFormField<InvoiceSortBy>(
                  value: _currentSort,
                  decoration: const InputDecoration(
                    labelText: 'Sort by',
                    border: OutlineInputBorder(),
                    contentPadding:
                        EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  ),
                  items: InvoiceSortBy.values.map((sort) {
                    return DropdownMenuItem(
                      value: sort,
                      child: Text(_getSortLabel(sort)),
                    );
                  }).toList(),
                  onChanged: (value) {
                    if (value != null) {
                      setState(() {
                        _currentSort = value;
                      });
                    }
                  },
                ),
              ),
              const SizedBox(width: 4), // Reduce spacing
              // Sort direction - use smaller button
              Container(
                width: 40,
                height: 40,
                child: IconButton(
                  onPressed: () {
                    setState(() {
                      _sortAscending = !_sortAscending;
                    });
                  },
                  icon: Icon(
                    _sortAscending ? Icons.arrow_upward : Icons.arrow_downward,
                    size: 20, // Smaller icon
                  ),
                  tooltip: _sortAscending ? 'Ascending' : 'Descending',
                  padding: EdgeInsets.zero, // Remove padding
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }

  Widget _buildInvoicesList() {
    final invoices = _filteredAndSortedInvoices;

    if (invoices.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.receipt_long, size: 64, color: Colors.grey),
            SizedBox(height: 16),
            Text(
              'No invoices found',
              style: TextStyle(fontSize: 16, color: Colors.grey),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      itemCount: invoices.length,
      itemBuilder: (context, index) {
        final invoice = invoices[index];
        final isSelected = _selectedInvoices.contains(invoice.id);

        return Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: ListTile(
            leading: _isSelectionMode
                ? Checkbox(
                    value: isSelected,
                    onChanged: (bool? value) {
                      _toggleSelection(invoice.id);
                    },
                  )
                : _buildStatusIcon(invoice.status),
            title: Row(
              children: [
                Expanded(
                  // Wrap in Expanded to prevent overflow
                  child: Text(
                    invoice.invoiceNumber ?? 'N/A',
                    style: const TextStyle(fontWeight: FontWeight.bold),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                _buildStatusChip(invoice.status),
              ],
            ),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  invoice.parentName,
                  overflow: TextOverflow.ellipsis, // Handle name overflow
                ),
                Text(
                  'Due: ${DateFormat('MMM dd, yyyy').format(invoice.dueDate)}',
                  style: TextStyle(
                    color: invoice.status == InvoiceStatus.overdue
                        ? Colors.red
                        : Colors.grey[600],
                  ),
                ),
              ],
            ),
            trailing: SizedBox(
              width: 80, // Fixed width to prevent overflow
              child: Text(
                '\$${invoice.amountDue.toStringAsFixed(2)}',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 14, // Slightly smaller font
                  color: invoice.status == InvoiceStatus.unpaid
                      ? Colors.red
                      : Colors.green,
                ),
                overflow: TextOverflow.ellipsis, // Handle amount overflow
                textAlign: TextAlign.end,
              ),
            ),
            onTap: () => _showInvoiceDetails(invoice),
            onLongPress:
                _isSelectionMode ? null : () => _toggleSelection(invoice.id),
          ),
        );
      },
    );
  }

  Widget _buildStatusIcon(InvoiceStatus status) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: _getStatusColor(status).withOpacity(0.1),
        shape: BoxShape.circle,
      ),
      child: Icon(
        _getStatusIcon(status),
        color: _getStatusColor(status),
        size: 20,
      ),
    );
  }

  Widget _buildStatusChip(InvoiceStatus status) {
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: 6, vertical: 2), // Reduce padding
      decoration: BoxDecoration(
        color: _getStatusColor(status).withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _getStatusColor(status).withOpacity(0.3)),
      ),
      child: Text(
        _getStatusLabel(status),
        style: TextStyle(
          color: _getStatusColor(status),
          fontSize: 10, // Smaller font size
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }

  Color _getStatusColor(InvoiceStatus status) {
    return switch (status) {
      InvoiceStatus.unpaid => Colors.blue,
      InvoiceStatus.paid => Colors.green,
      InvoiceStatus.overdue => Colors.red,
    };
  }

  IconData _getStatusIcon(InvoiceStatus status) {
    return switch (status) {
      InvoiceStatus.unpaid => Icons.pending,
      InvoiceStatus.paid => Icons.check_circle,
      InvoiceStatus.overdue => Icons.warning,
    };
  }

  String _getStatusLabel(InvoiceStatus status) {
    return switch (status) {
      InvoiceStatus.unpaid => 'Unpaid',
      InvoiceStatus.paid => 'Paid',
      InvoiceStatus.overdue => 'Overdue',
    };
  }

  String _getFilterLabel(InvoiceFilter filter) {
    return switch (filter) {
      InvoiceFilter.all => 'All',
      InvoiceFilter.unpaid => 'Unpaid',
      InvoiceFilter.paid => 'Paid',
      InvoiceFilter.overdue => 'Overdue',
    };
  }

  String _getSortLabel(InvoiceSortBy sort) {
    return switch (sort) {
      InvoiceSortBy.dueDate => 'Due Date',
      InvoiceSortBy.amount => 'Amount',
      InvoiceSortBy.createdDate => 'Created Date',
      InvoiceSortBy.parentName => 'Parent Name',
    };
  }

  void _enterSelectionMode() {
    setState(() {
      _isSelectionMode = true;
      _selectedInvoices.clear();
    });
  }

  void _exitSelectionMode() {
    setState(() {
      _isSelectionMode = false;
      _selectedInvoices.clear();
    });
  }

  void _toggleSelection(String invoiceId) {
    setState(() {
      if (_selectedInvoices.contains(invoiceId)) {
        _selectedInvoices.remove(invoiceId);
      } else {
        _selectedInvoices.add(invoiceId);
      }

      if (!_isSelectionMode && _selectedInvoices.isNotEmpty) {
        _isSelectionMode = true;
      } else if (_isSelectionMode && _selectedInvoices.isEmpty) {
        _isSelectionMode = false;
      }
    });
  }

  void _markSelectedAsPaid() async {
    if (_selectedInvoices.isEmpty) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Mark as Paid'),
        content: Text(
          'Are you sure you want to mark ${_selectedInvoices.length} invoice(s) as paid?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Mark as Paid'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      try {
        final invoiceController = context.read<InvoiceController>();

        // Mark each selected invoice as paid
        for (final invoiceId in _selectedInvoices) {
          await invoiceController.markInvoiceAsPaid(invoiceId);
        }

        // Clear selection and reload
        setState(() {
          _selectedInvoices.clear();
          _isSelectionMode = false;
        });

        // Reload invoices to get updated data
        await _loadInvoices();

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Selected invoices marked as paid')),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Error updating invoices: $e')),
          );
        }
      }
    }
  }

  void _showInvoiceDetails(Invoice invoice) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (context) => _InvoiceDetailSheet(
        invoice: invoice,
        onInvoiceUpdated: _loadInvoices, // Callback to refresh the list
      ),
    );
  }
}

class _InvoiceDetailSheet extends StatelessWidget {
  final Invoice invoice;
  final VoidCallback onInvoiceUpdated;

  const _InvoiceDetailSheet({
    required this.invoice,
    required this.onInvoiceUpdated,
  });

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      builder: (context, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
          ),
          child: Column(
            children: [
              // Handle bar
              Container(
                margin: const EdgeInsets.only(top: 8, bottom: 16),
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey[300],
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Expanded(
                child: ListView(
                  controller: scrollController,
                  padding: const EdgeInsets.all(16),
                  children: [
                    Text(
                      'Invoice ${invoice.invoiceNumber ?? 'N/A'}',
                      style: const TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 16),

                    _buildDetailRow('Status', _getStatusLabel(invoice.status)),
                    _buildDetailRow('Parent', invoice.parentName),
                    _buildDetailRow('Email', invoice.parentEmail),
                    _buildDetailRow('Amount Due',
                        '\$${invoice.amountDue.toStringAsFixed(2)}'),
                    _buildDetailRow('Due Date',
                        DateFormat('MMM dd, yyyy').format(invoice.dueDate)),
                    _buildDetailRow('Created',
                        DateFormat('MMM dd, yyyy').format(invoice.createdAt)),
                    _buildDetailRow('Weeks', '${invoice.weeks}'),

                    const SizedBox(height: 24),
                    const Text(
                      'Line Items',
                      style:
                          TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 8),

                    ...invoice.lineItems.map((item) => Card(
                          margin: const EdgeInsets.only(bottom: 8),
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  item['description'] ?? 'N/A',
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w500),
                                ),
                                const SizedBox(height: 4),
                                Row(
                                  mainAxisAlignment:
                                      MainAxisAlignment.spaceBetween,
                                  children: [
                                    Text('Qty: ${item['quantity'] ?? 0}'),
                                    Text(
                                        '\$${(item['lineTotal'] ?? 0).toStringAsFixed(2)}'),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        )),

                    const SizedBox(height: 24),

                    // Action buttons
                    Row(
                      children: [
                        if (invoice.status != InvoiceStatus.paid)
                          Expanded(
                            child: ElevatedButton.icon(
                              onPressed: () => _markAsPaid(context),
                              icon: const Icon(Icons.check),
                              label: const Text('Mark as Paid'),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: Colors.green,
                                foregroundColor: Colors.white,
                              ),
                            ),
                          ),
                        if (invoice.status != InvoiceStatus.paid)
                          const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () => _downloadPdf(context),
                            icon: const Icon(Icons.download),
                            label: const Text('Download PDF'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(
              '$label:',
              style: const TextStyle(
                fontWeight: FontWeight.w500,
                color: Colors.grey,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontWeight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }

  String _getStatusLabel(InvoiceStatus status) {
    return switch (status) {
      InvoiceStatus.unpaid => 'Unpaid',
      InvoiceStatus.paid => 'Paid',
      InvoiceStatus.overdue => 'Overdue',
    };
  }

  void _markAsPaid(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Mark as Paid'),
        content: Text('Mark invoice ${invoice.invoiceNumber} as paid?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Mark as Paid'),
          ),
        ],
      ),
    );

    if (confirmed == true && context.mounted) {
      try {
        final invoiceController = context.read<InvoiceController>();
        await invoiceController.markInvoiceAsPaid(invoice.id);

        Navigator.of(context).pop(); // Close the detail sheet

        // Call the callback to refresh the parent list
        onInvoiceUpdated();

        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Invoice marked as paid')),
        );
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error updating invoice: $e')),
        );
      }
    }
  }

  void _downloadPdf(BuildContext context) async {
    try {
      // Show loading indicator
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (context) => const Center(
          child: CircularProgressIndicator(),
        ),
      );

      final invoiceController = context.read<InvoiceController>();
      final pdfUrl = await invoiceController.fetchInvoicePdf(invoice.id);

      // Hide loading indicator
      if (context.mounted) {
        Navigator.of(context).pop();
      }

      final uri = Uri.parse(pdfUrl);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } else {
        throw 'Could not launch PDF';
      }
    } catch (e) {
      // Hide loading indicator if still showing
      if (context.mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error downloading PDF: $e')),
        );
      }
    }
  }
}
