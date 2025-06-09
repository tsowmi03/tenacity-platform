import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../controllers/invoice_controller.dart';
import '../controllers/auth_controller.dart';
import '../models/app_user_model.dart';
import '../models/student_model.dart';

class AdminCreateInvoiceScreen extends StatefulWidget {
  const AdminCreateInvoiceScreen({super.key});

  @override
  State<AdminCreateInvoiceScreen> createState() =>
      _AdminCreateInvoiceScreenState();
}

class _AdminCreateInvoiceScreenState extends State<AdminCreateInvoiceScreen> {
  // Parent search.
  final TextEditingController _searchController = TextEditingController();
  List<AppUser> _allParents = [];
  List<AppUser> _filteredParents = [];
  String? _selectedParentId;
  String _selectedParentName = "";
  String _selectedParentEmail = "";

  // Once parent is chosen, load their students.
  List<Student> _parentStudents = [];
  final List<String> _selectedStudentIds = [];
  // Map to store a TextEditingController for each student's session count.
  final Map<String, TextEditingController> _sessionControllers = {};

  // Weeks field.
  final TextEditingController _weeksController =
      TextEditingController(text: "1");

  // Due date.
  DateTime _selectedDueDate = DateTime.now().add(const Duration(days: 21));

  // Loading and error states.
  bool _isLoadingParents = true;
  bool _isLoadingStudents = false;
  bool _isCreatingInvoice = false;
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
    _weeksController.dispose();
    _sessionControllers.forEach((_, controller) => controller.dispose());
    super.dispose();
  }

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
        _filteredParents = parentDocs;
        _isLoadingParents = false;
      });
    } catch (e) {
      setState(() {
        _isLoadingParents = false;
        _error = "Failed to load parents: $e";
      });
    }
  }

  void _onSearchChanged() {
    final query = _searchController.text.trim().toLowerCase();
    setState(() {
      _filteredParents = _allParents.where((parent) {
        final fullName = "${parent.firstName} ${parent.lastName}".toLowerCase();
        return fullName.contains(query);
      }).toList();
    });
  }

  Future<void> _selectParent(AppUser parent) async {
    _searchController.clear();
    FocusScope.of(context).unfocus();
    setState(() {
      _selectedParentId = parent.uid;
      _selectedParentName = "${parent.firstName} ${parent.lastName}";
      _selectedParentEmail = parent.email;
      _parentStudents = [];
      _selectedStudentIds.clear();
      _sessionControllers.clear();
      _isLoadingStudents = true;
    });
    final authController = context.read<AuthController>();
    try {
      final students = await authController.fetchStudentsForParent(parent.uid);
      setState(() {
        _parentStudents = students;
      });
      // Initialize a session controller for each student.
      for (var student in students) {
        _sessionControllers[student.id] = TextEditingController(text: "1");
      }
    } catch (e) {
      _showSnackBar("Failed to load parent's students: $e");
    } finally {
      setState(() {
        _isLoadingStudents = false;
      });
    }
  }

  Future<void> _pickDueDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDueDate,
      firstDate: now.subtract(const Duration(days: 365)),
      lastDate: now.add(const Duration(days: 365 * 3)),
    );
    if (picked != null) {
      setState(() {
        _selectedDueDate = picked;
      });
    }
  }

  Future<void> _createInvoice() async {
    if (_selectedParentId == null) {
      _showSnackBar("Please select a parent.");
      return;
    }
    final weeks = int.tryParse(_weeksController.text) ?? 1;
    if (weeks <= 0) {
      _showSnackBar("Please enter a valid number of weeks.");
      return;
    }
    // Gather selected students.
    final selectedStudents = _parentStudents
        .where((student) => _selectedStudentIds.contains(student.id))
        .toList();
    if (selectedStudents.isEmpty) {
      _showSnackBar("Please select at least one student.");
      return;
    }
    // Build a list of session counts corresponding to each selected student.
    List<int> sessionsPerStudent = [];
    for (var student in selectedStudents) {
      final controller = _sessionControllers[student.id];
      if (controller == null) continue;
      final sessions = int.tryParse(controller.text) ?? 1;
      if (sessions <= 0) {
        _showSnackBar(
            "Please enter a valid session count for ${student.firstName}.");
        return;
      }
      sessionsPerStudent.add(sessions);
    }

    final invoiceController = context.read<InvoiceController>();
    setState(() {
      _isCreatingInvoice = true;
    });
    try {
      await invoiceController.createInvoice(
        parentId: _selectedParentId!,
        parentName: _selectedParentName,
        parentEmail: _selectedParentEmail,
        students: selectedStudents,
        sessionsPerStudent: sessionsPerStudent,
        weeks: weeks,
        dueDate: _selectedDueDate,
      );
      _showSnackBar("Invoice created successfully!");
    } catch (e) {
      _showSnackBar("Error creating invoice: $e");
    } finally {
      setState(() {
        _isCreatingInvoice = false;
      });
    }
  }

  void _showSnackBar(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final isLoading =
        _isLoadingParents || _isLoadingStudents || _isCreatingInvoice;
    return Scaffold(
      appBar: AppBar(
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text("Create Invoice",
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
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
            _buildParentSearchField(),
            const SizedBox(height: 12),
            if (_selectedParentId != null)
              _buildSelectedParentInfo()
            else
              _buildParentSearchResults(),
            const SizedBox(height: 20),
            if (_selectedParentId != null) _buildStudentMultiSelect(),
            const SizedBox(height: 20),
            _buildWeeksField(),
            const SizedBox(height: 20),
            _buildDueDateField(),
            const SizedBox(height: 30),
            ElevatedButton.icon(
              onPressed: _createInvoice,
              icon: const Icon(Icons.check),
              label: const Text("Create Invoice"),
              style: ElevatedButton.styleFrom(
                padding:
                    const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
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
    if (_searchController.text.isEmpty) {
      return const Text("Start typing to search parents...");
    }
    if (_filteredParents.isEmpty) {
      return const Text("No matching parents found.");
    }
    return Container(
      height: 200,
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
          const Text("Select Students",
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          ..._parentStudents.map((student) {
            final isSelected = _selectedStudentIds.contains(student.id);
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CheckboxListTile(
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
                ),
                // If this student is selected, show a field to enter their sessions per week.
                if (isSelected)
                  Padding(
                    padding: const EdgeInsets.only(left: 48.0, bottom: 8.0),
                    child: TextField(
                      controller: _sessionControllers[student.id],
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(
                        labelText: "Sessions per week for ${student.firstName}",
                        border: const OutlineInputBorder(),
                      ),
                    ),
                  ),
              ],
            );
          }),
        ],
      ),
    );
  }

  Widget _buildWeeksField() {
    return TextField(
      controller: _weeksController,
      keyboardType: TextInputType.number,
      decoration: const InputDecoration(
        labelText: "Number of Weeks",
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
