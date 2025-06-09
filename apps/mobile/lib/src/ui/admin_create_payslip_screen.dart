import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../controllers/payslip_controller.dart';
import '../controllers/auth_controller.dart';
import '../models/app_user_model.dart';
import '../models/payslip_model.dart';

class AdminCreatePayslipScreen extends StatefulWidget {
  const AdminCreatePayslipScreen({super.key});

  @override
  State<AdminCreatePayslipScreen> createState() =>
      _AdminCreatePayslipScreenState();
}

class _AdminCreatePayslipScreenState extends State<AdminCreatePayslipScreen> {
  // Tutor search.
  final TextEditingController _searchController = TextEditingController();
  List<AppUser> _allTutors = [];
  List<AppUser> _filteredTutors = [];
  String? _selectedTutorId;
  String _selectedTutorName = "";

  // Payslip fields.
  final TextEditingController _grossPayController = TextEditingController();
  final TextEditingController _deductionsController =
      TextEditingController(text: "0");
  final TextEditingController _hoursWorkedController = TextEditingController();
  DateTime _periodStart = DateTime.now().subtract(const Duration(days: 7));
  DateTime _periodEnd = DateTime.now();
  bool _isLoadingTutors = true;
  bool _isCreatingPayslip = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadTutors();
    _searchController.addListener(_onSearchChanged);
    _grossPayController.addListener(_onPayslipFieldChanged);
    _deductionsController.addListener(_onPayslipFieldChanged);
  }

  void _onPayslipFieldChanged() {
    setState(() {}); // Triggers rebuild so net pay updates
  }

  @override
  void dispose() {
    _searchController.removeListener(_onSearchChanged);
    _grossPayController.removeListener(_onPayslipFieldChanged);
    _deductionsController.removeListener(_onPayslipFieldChanged);
    _searchController.dispose();
    _grossPayController.dispose();
    _deductionsController.dispose();
    _hoursWorkedController.dispose();
    super.dispose();
  }

  Future<void> _loadTutors() async {
    try {
      setState(() {
        _isLoadingTutors = true;
        _error = null;
      });
      final authController = context.read<AuthController>();
      final tutorDocs = await authController.fetchAllTutors();
      setState(() {
        _allTutors = tutorDocs;
        _filteredTutors = tutorDocs;
        _isLoadingTutors = false;
      });
    } catch (e) {
      setState(() {
        _isLoadingTutors = false;
        _error = "Failed to load tutors: $e";
      });
    }
  }

  void _onSearchChanged() {
    final query = _searchController.text.trim().toLowerCase();
    setState(() {
      _filteredTutors = _allTutors.where((tutor) {
        final fullName = "${tutor.firstName} ${tutor.lastName}".toLowerCase();
        return fullName.contains(query);
      }).toList();
    });
  }

  Future<void> _selectTutor(AppUser tutor) async {
    _searchController.clear();
    FocusScope.of(context).unfocus();
    setState(() {
      _selectedTutorId = tutor.uid;
      _selectedTutorName = "${tutor.firstName} ${tutor.lastName}";
    });
  }

  Future<void> _pickPeriodStart() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _periodStart,
      firstDate: DateTime.now().subtract(const Duration(days: 365 * 3)),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked != null) {
      setState(() {
        _periodStart = picked;
        if (_periodEnd.isBefore(_periodStart)) {
          _periodEnd = _periodStart;
        }
      });
    }
  }

  Future<void> _pickPeriodEnd() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _periodEnd,
      firstDate: _periodStart,
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked != null) {
      setState(() {
        _periodEnd = picked;
      });
    }
  }

  Future<void> _createPayslip() async {
    if (_selectedTutorId == null) {
      _showSnackBar("Please select a tutor.");
      return;
    }
    final grossPay = double.tryParse(_grossPayController.text) ?? 0.0;
    final deductions = double.tryParse(_deductionsController.text) ?? 0.0;
    final hoursWorked = double.tryParse(_hoursWorkedController.text) ?? 0.0;
    if (grossPay <= 0) {
      _showSnackBar("Please enter a valid gross pay.");
      return;
    }
    if (hoursWorked <= 0) {
      _showSnackBar("Please enter valid hours worked.");
      return;
    }
    final netPay = grossPay - deductions;
    final payslip = Payslip(
      id: UniqueKey().toString(),
      tutorId: _selectedTutorId!,
      tutorName: _selectedTutorName,
      periodStart: _periodStart,
      periodEnd: _periodEnd,
      grossPay: grossPay,
      deductions: deductions,
      netPay: netPay,
      createdAt: DateTime.now(),
      hoursWorked: hoursWorked,
    );
    final payslipController = context.read<PayslipController>();
    setState(() {
      _isCreatingPayslip = true;
    });
    try {
      await payslipController.createPayslip(payslip);
      _showSnackBar("Payslip created successfully!");
      // Reset all fields after creation
      setState(() {
        _selectedTutorId = null;
        _selectedTutorName = "";
        _grossPayController.clear();
        _deductionsController.text = "0";
        _hoursWorkedController.clear();
        _periodStart = DateTime.now().subtract(const Duration(days: 7));
        _periodEnd = DateTime.now();
      });
    } catch (e) {
      _showSnackBar("Error creating payslip: $e");
    } finally {
      setState(() {
        _isCreatingPayslip = false;
      });
    }
  }

  void _showSnackBar(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final isLoading = _isLoadingTutors || _isCreatingPayslip;
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: const Text(
          "Create Payslip",
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
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
            _buildTutorSearchField(),
            const SizedBox(height: 12),
            if (_selectedTutorId != null)
              _buildSelectedTutorInfo()
            else
              _buildTutorSearchResults(),
            const SizedBox(height: 20),
            if (_selectedTutorId != null) _buildPayslipFields(),
            const SizedBox(height: 30),
            ElevatedButton.icon(
              onPressed: _createPayslip,
              icon: const Icon(Icons.check),
              label: const Text("Create Payslip"),
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

  Widget _buildTutorSearchField() {
    return TextField(
      controller: _searchController,
      decoration: const InputDecoration(
        labelText: "Search Tutor by name...",
        border: OutlineInputBorder(),
      ),
    );
  }

  Widget _buildTutorSearchResults() {
    if (_searchController.text.isEmpty) {
      return const Text("Start typing to search tutors...");
    }
    if (_filteredTutors.isEmpty) {
      return const Text("No matching tutors found.");
    }
    return Container(
      height: 200,
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade400),
        borderRadius: BorderRadius.circular(8),
      ),
      child: ListView.builder(
        itemCount: _filteredTutors.length,
        itemBuilder: (context, index) {
          final tutor = _filteredTutors[index];
          return ListTile(
            title: Text("${tutor.firstName} ${tutor.lastName}"),
            onTap: () => _selectTutor(tutor),
          );
        },
      ),
    );
  }

  Widget _buildSelectedTutorInfo() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
      decoration: BoxDecoration(
        color: Colors.blue.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.blue.shade200),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            "Selected tutor: $_selectedTutorName",
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          ),
          IconButton(
            icon: const Icon(Icons.close, color: Colors.red),
            tooltip: "Unselect tutor",
            onPressed: () {
              setState(() {
                _selectedTutorId = null;
                _selectedTutorName = "";
              });
            },
          ),
        ],
      ),
    );
  }

  Widget _buildPayslipFields() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: InkWell(
                onTap: _pickPeriodStart,
                child: InputDecorator(
                  decoration: const InputDecoration(
                    labelText: "Period Start",
                    border: OutlineInputBorder(),
                  ),
                  child: Text(
                    DateFormat('dd MMM yyyy').format(_periodStart),
                    style: const TextStyle(fontSize: 16),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: InkWell(
                onTap: _pickPeriodEnd,
                child: InputDecorator(
                  decoration: const InputDecoration(
                    labelText: "Period End",
                    border: OutlineInputBorder(),
                  ),
                  child: Text(
                    DateFormat('dd MMM yyyy').format(_periodEnd),
                    style: const TextStyle(fontSize: 16),
                  ),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _hoursWorkedController,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
            labelText: "Hours Worked",
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _grossPayController,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
            labelText: "Gross Pay",
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _deductionsController,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
            labelText: "Deductions",
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 16),
        // Net pay is calculated automatically
        Builder(
          builder: (context) {
            final gross = double.tryParse(_grossPayController.text) ?? 0.0;
            final deductions =
                double.tryParse(_deductionsController.text) ?? 0.0;
            final net = gross - deductions;
            return Text(
              "Net Pay: \$${net.toStringAsFixed(2)}",
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            );
          },
        ),
      ],
    );
  }
}
