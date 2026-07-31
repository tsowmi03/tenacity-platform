class AnnouncementDraft {
  final String title;
  final String body;
  final String audience;
  final bool archived;

  const AnnouncementDraft({
    required this.title,
    required this.body,
    required this.audience,
    required this.archived,
  });
}

const announcementAudiences = <String, String>{
  'all': 'All',
  'parent': 'Parents',
  'tutor': 'Tutors',
  'admin': 'Admins',
};

String? validateAnnouncementTitle(String? value) {
  final title = value?.trim() ?? '';
  if (title.isEmpty) return 'Enter a title.';
  if (title.length > 120) return 'Keep the title to 120 characters.';
  return null;
}

String? validateAnnouncementBody(String? value) {
  final body = value?.trim() ?? '';
  if (body.isEmpty) return 'Enter the announcement.';
  if (body.length > 5000) {
    return 'Keep the announcement to 5,000 characters.';
  }
  return null;
}
