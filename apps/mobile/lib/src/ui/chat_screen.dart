import 'package:flutter/material.dart';

class MessagesScreen extends StatelessWidget {
  const MessagesScreen({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Messages'),
        centerTitle: true,
      ),
      body: ListView.separated(
        itemCount: 3, // Placeholder number of chats
        separatorBuilder: (context, index) => const Divider(),
        itemBuilder: (context, index) {
          return _buildChatTile(
            name: index == 0 ? 'Tutor John' : 'Parent Lisa',
            lastMessage: index == 0 ? 'See you next class!' : 'Can we reschedule?',
            time: index == 0 ? '3:15 PM' : 'Yesterday',
          );
        },
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {},
        child: const Icon(Icons.add),
        tooltip: 'Start a new chat',
      ),
    );
  }

  Widget _buildChatTile({required String name, required String lastMessage, required String time}) {
    return ListTile(
      leading: CircleAvatar(
        backgroundColor: const Color(0xFF1C71AF),
        child: Text(name[0], style: const TextStyle(color: Colors.white, fontSize: 22)),
      ),
      title: Text(name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
      subtitle: Row(
        children: [
          Expanded(child: Text(lastMessage, style: const TextStyle(color: Colors.grey, fontSize: 14), overflow: TextOverflow.ellipsis)),
          Text(time, style: const TextStyle(color: Colors.grey, fontSize: 12)),
        ],
      ),
      onTap: () {},
    );
  }
}