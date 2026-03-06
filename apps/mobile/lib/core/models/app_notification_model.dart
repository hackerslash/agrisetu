class AppNotificationItem {
  final String id;
  final String type;
  final String preferenceKey;
  final String title;
  final String body;
  final DateTime createdAt;
  final bool isRead;
  final String? route;

  const AppNotificationItem({
    required this.id,
    required this.type,
    required this.preferenceKey,
    required this.title,
    required this.body,
    required this.createdAt,
    this.isRead = false,
    this.route,
  });

  AppNotificationItem copyWith({
    String? id,
    String? type,
    String? preferenceKey,
    String? title,
    String? body,
    DateTime? createdAt,
    bool? isRead,
    String? route,
  }) {
    return AppNotificationItem(
      id: id ?? this.id,
      type: type ?? this.type,
      preferenceKey: preferenceKey ?? this.preferenceKey,
      title: title ?? this.title,
      body: body ?? this.body,
      createdAt: createdAt ?? this.createdAt,
      isRead: isRead ?? this.isRead,
      route: route ?? this.route,
    );
  }
}
