import 'package:flutter/material.dart';

class TimetableScreen extends StatelessWidget {
  const TimetableScreen({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Timetable')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                IconButton(icon: const Icon(Icons.arrow_back), onPressed: () {}),
                const Text(
                  'Week 3 (12/02 - 18/02)',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                IconButton(icon: const Icon(Icons.arrow_forward), onPressed: () {}),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              children: [
                _buildClassTile('Monday 4:00 PM', 'Maths - Year 10', 2),
                _buildClassTile('Tuesday 5:30 PM', 'English - Year 9', 0),
                _buildClassTile('Wednesday 6:00 PM', 'Science - Year 11', 1),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildClassTile(String time, String subject, int spots) {
    Color classColor = spots > 1 ? Colors.green : (spots == 1 ? Colors.amber : Colors.red);

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: ListTile(
        leading: Container(
          width: 8,
          decoration: BoxDecoration(
            color: classColor,
            borderRadius: const BorderRadius.only(
              topLeft: Radius.circular(10),
              bottomLeft: Radius.circular(10),
            ),
          ),
        ),
        title: Text(subject, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        subtitle: Text('Time: $time | Available Spots: $spots'),
        trailing: const Icon(Icons.arrow_forward_ios, size: 16, color: Colors.grey),
      ),
    );
  }
}