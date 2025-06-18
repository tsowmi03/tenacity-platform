// Example widget to view logs
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class DebugLogScreen extends StatefulWidget {
  const DebugLogScreen({super.key});

  @override
  State<DebugLogScreen> createState() => _DebugLogScreenState();
}

class _DebugLogScreenState extends State<DebugLogScreen> {
  List<String> logs = [];

  @override
  void initState() {
    super.initState();
    _loadLogs();
  }

  Future<void> _loadLogs() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      logs = prefs.getStringList('debug_logs') ?? [];
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Debug Logs')),
      body: Column(
        children: [
          ElevatedButton(
            onPressed: () async {
              final prefs = await SharedPreferences.getInstance();
              await prefs.remove('debug_logs');
              setState(() => logs = []);
            },
            child: const Text('Clear Logs'),
          ),
          Expanded(
            child: ListView(
              children: logs.map((log) => Text(log)).toList(),
            ),
          ),
        ],
      ),
    );
  }
}
