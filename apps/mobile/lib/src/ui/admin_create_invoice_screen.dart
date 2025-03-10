import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';

import '../controllers/invoice_controller.dart';
import '../controllers/auth_controller.dart';
import '../models/app_user_model.dart';
import '../models/student_model.dart';

class AdminCreateInvoiceScreen extends StatefulWidget {
  const AdminCreateInvoiceScreen({super.key});

  @override
  State<AdminCreateInvoiceScreen> createState() => _AdminCreateInvoiceScreenState();
}

class _AdminCreateInvoiceScreenState extends State<AdminCreateInvoiceScreen> {
  // Search for parent
  final TextEditingController _searchController = TextEditingController();
  List<AppUser> _allParents = [];
  List<AppUser> _filteredParents = [];

  // Once parent is chosen:
  String? _selectedParentId;
  String _selectedParentName = "";

  // Students for that parent
  final List<String> _selectedStudentIds = [];
  List<Student> _parentStudents = [];

  // Invoice amount + due date
  final TextEditingController _amountController = TextEditingController();
  DateTime _selectedDueDate = DateTime.now().add(const Duration(days: 7));

  // Loading states
  bool _isLoadingParents = true; // for initial parent fetch
  bool _isLoadingStudents = false; // when fetching selected parent's students
  bool _isCreatingInvoice = false; // when calling createInvoice
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadParents();
    _searchController.addListener(_onSearchChanged);
  }

  @override
  void dispose() {
    _searchController.removeListener(_onSearchChanged);
    _searchController.dispose();
    super.dispose();
  }

  /// 1) Fetch all parents (once). We'll filter locally as the user types.
  Future<void> _loadParents() async {
    try {
      setState(() {
        _isLoadingParents = true;
        _error = null;
      });
      final authController = context.read<AuthController>();
      final parentDocs = await authController.fetchAllParents();

      setState(() {
        _allParents = parentDocs;
        _filteredParents = parentDocs; // initially the same
        _isLoadingParents = false;
      });
    } catch (e) {
      setState(() {
        _isLoadingParents = false;
        _error = "Failed to load parents: $e";
      });
    }
  }

  /// 2) Filter parents based on search text
  void _onSearchChanged() {
    final query = _searchController.text.trim().toLowerCase();
    setState(() {
      _filteredParents = _allParents.where((parent) {
        final fullName = "${parent.firstName} ${parent.lastName}".toLowerCase();
        return fullName.contains(query);
      }).toList();
    });
  }

  /// 3) When user taps on a parent in the search results:
  ///    - set _selectedParentId
  ///    - fetch that parent's students
  ///    - hide the search list
  Future<void> _selectParent(AppUser parent) async {
    _searchController.clear(); // optional: clear search to hide the result list
    FocusScope.of(context).unfocus(); // close the keyboard

    setState(() {
      _selectedParentId = parent.uid;
      _selectedParentName = "${parent.firstName} ${parent.lastName}";
      _parentStudents = [];
      _selectedStudentIds.clear();
      _isLoadingStudents = true;
    });

    // Fetch that parent's students
    final authController = context.read<AuthController>();
    try {
      final students = await authController.fetchStudentsForParent(parent.uid);
      setState(() {
        _parentStudents = students;
      });
    } catch (e) {
      _showSnackBar("Failed to load parent’s students: $e");
    } finally {
      setState(() {
        _isLoadingStudents = false;
      });
    }
  }

  /// Show a date picker for the due date
  Future<void> _pickDueDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDueDate,
      firstDate: now.subtract(const Duration(days: 365)),
      lastDate: now.add(const Duration(days: 365 * 3)),
    );
    if (picked != null) {
      setState(() => _selectedDueDate = picked);
    }
  }

  /// Validate input and create the invoice
  Future<void> _createInvoice() async {
    if (_selectedParentId == null) {
      _showSnackBar("Please select a parent.");
      return;
    }
    final amount = double.tryParse(_amountController.text);
    if (amount == null || amount <= 0) {
      _showSnackBar("Please enter a valid amount.");
      return;
    }

    final invoiceController = context.read<InvoiceController>();
    setState(() => _isCreatingInvoice = true);

    try {
      await invoiceController.createInvoice(
        parentId: _selectedParentId!,
        amountDue: amount,
        dueDate: _selectedDueDate,
        studentIds: _selectedStudentIds,
      );
      if (!mounted) return;

      _showSnackBar("Invoice created successfully!");
      // Navigator.pop(context);
    } catch (e) {
      _showSnackBar("Error creating invoice: $e");
    } finally {
      setState(() => _isCreatingInvoice = false);
    }
  }

  void _showSnackBar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  // ---------------------------------------
  // BUILD
  // ---------------------------------------
  @override
  Widget build(BuildContext context) {
    final invoiceController = context.watch<InvoiceController>();

    final isLoading = invoiceController.isLoading ||
        _isLoadingParents ||
        _isLoadingStudents ||
        _isCreatingInvoice;

    return Scaffold(
      appBar: AppBar(
        title: const Text("Create Invoice", style: TextStyle(color: Colors.white)),
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
          : _error != null
              ? Center(child: Text(_error!))
              : _buildBody(),
    );
  }

  Widget _buildBody() {
    return SingleChildScrollView(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            // SEARCH FIELD for Parents
            _buildParentSearchField(),

            const SizedBox(height: 12),

            // If a parent is selected, show it + load associated students
            if (_selectedParentId != null)
              _buildSelectedParentInfo()
            else
              // Otherwise, if text is typed, show the search results list
              _buildParentSearchResults(),

            const SizedBox(height: 20),

            // The multi-select is only shown if a parent is selected
            if (_selectedParentId != null) _buildStudentMultiSelect(),

            const SizedBox(height: 20),

            // Amount + Due Date
            _buildAmountField(),
            const SizedBox(height: 20),
            _buildDueDateField(),
            const SizedBox(height: 30),

            // Create Invoice Button
            ElevatedButton.icon(
              onPressed: _createInvoice,
              icon: const Icon(Icons.check),
              label: const Text("Create Invoice"),
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                textStyle: const TextStyle(fontSize: 16),
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

  // ---------------------------------------
  // WIDGETS
  // ---------------------------------------
  Widget _buildParentSearchField() {
    return TextField(
      controller: _searchController,
      decoration: const InputDecoration(
        labelText: "Search Parent by name...",
        border: OutlineInputBorder(),
      ),
    );
  }

  Widget _buildParentSearchResults() {
    // If the search is empty, maybe show a prompt or show all parents
    if (_searchController.text.isEmpty) {
      return const Text("Start typing to search parents...");
    }
    if (_filteredParents.isEmpty) {
      return const Text("No matching parents found.");
    }
    return Container(
      height: 200, // or any scrollable height
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade400),
        borderRadius: BorderRadius.circular(8),
      ),
      child: ListView.builder(
        itemCount: _filteredParents.length,
        itemBuilder: (context, index) {
          final parent = _filteredParents[index];
          return ListTile(
            title: Text("${parent.firstName} ${parent.lastName}"),
            onTap: () => _selectParent(parent),
          );
        },
      ),
    );
  }

  Widget _buildSelectedParentInfo() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
      decoration: BoxDecoration(
        color: Colors.green.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.green.shade200),
      ),
      child: Text(
        "Selected parent: $_selectedParentName",
        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
      ),
    );
  }

  Widget _buildStudentMultiSelect() {
    if (_parentStudents.isEmpty) {
      return const Text("No students found for this parent.");
    }
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade400),
        borderRadius: BorderRadius.circular(8.0),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            "Select Students",
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 6),
          ..._parentStudents.map((student) {
            final isSelected = _selectedStudentIds.contains(student.id);
            return CheckboxListTile(
              value: isSelected,
              title: Text("${student.firstName} ${student.lastName}"),
              onChanged: (checked) {
                setState(() {
                  if (checked == true) {
                    _selectedStudentIds.add(student.id);
                  } else {
                    _selectedStudentIds.remove(student.id);
                  }
                });
              },
            );
          }),
        ],
      ),
    );
  }

  Widget _buildAmountField() {
    return TextField(
      controller: _amountController,
      keyboardType: TextInputType.number,
      decoration: const InputDecoration(
        labelText: "Amount Due",
        border: OutlineInputBorder(),
      ),
    );
  }

  Widget _buildDueDateField() {
    return InkWell(
      onTap: _pickDueDate,
      child: InputDecorator(
        decoration: const InputDecoration(
          labelText: "Due Date",
          border: OutlineInputBorder(),
        ),
        child: Text(
          DateFormat('dd MMM yyyy').format(_selectedDueDate),
          style: const TextStyle(fontSize: 16),
        ),
      ),
    );
  }
}
