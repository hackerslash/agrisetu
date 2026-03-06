import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import 'app_notification_service.dart';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) {
    return;
  }

  await Firebase.initializeApp();
  await AppNotificationService.initialize(headless: true);
}

class PushNotificationService {
  PushNotificationService._();

  static StreamSubscription<RemoteMessage>? _foregroundSubscription;
  static StreamSubscription<RemoteMessage>? _openedSubscription;
  static StreamSubscription<String>? _tokenRefreshSubscription;
  static bool _initialized = false;

  static const Map<String, bool> _defaultPreferences = {
    'cluster_formed': true,
    'voting_started': true,
    'voting_reminders': true,
    'payment_pending': true,
    'payment_reminders': true,
    'payment_confirmed': true,
    'order_status_updates': true,
    'delivery_updates': true,
    'account_updates': true,
    'product_announcements': false,
  };

  static Map<String, bool> _preferences = {
    ..._defaultPreferences,
  };

  static bool get _supportsFcm =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  static Future<void> initialize() async {
    if (_initialized || !_supportsFcm) {
      return;
    }

    await Firebase.initializeApp();
    await AppNotificationService.initialize();

    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
    await FirebaseMessaging.instance.setAutoInitEnabled(true);

    final initialMessage = await FirebaseMessaging.instance.getInitialMessage();
    if (initialMessage != null) {
      AppNotificationService.seedInitialRoute(_routeFromMessage(initialMessage));
    }

    _foregroundSubscription ??=
        FirebaseMessaging.onMessage.listen(_handleForegroundMessage);
    _openedSubscription ??=
        FirebaseMessaging.onMessageOpenedApp.listen((message) {
      AppNotificationService.dispatchRoute(_routeFromMessage(message));
    });
    _tokenRefreshSubscription ??=
        FirebaseMessaging.instance.onTokenRefresh.listen((_) {
      unawaited(syncDeviceRegistration(preferences: _preferences));
    });

    _initialized = true;
  }

  static Future<void> requestPermissions() async {
    if (!_supportsFcm) {
      return;
    }

    await AppNotificationService.requestPermissions();
    await FirebaseMessaging.instance.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );
  }

  static Future<void> syncDeviceRegistration({
    required Map<String, bool> preferences,
  }) async {
    _preferences = {
      ..._defaultPreferences,
      ...preferences,
    };
    if (!_supportsFcm) {
      return;
    }

    final sessionToken = await ApiClient.instance.getToken();
    if (sessionToken == null || sessionToken.isEmpty) {
      return;
    }

    final fcmToken = await FirebaseMessaging.instance.getToken();
    if (fcmToken == null || fcmToken.isEmpty) {
      return;
    }

    try {
      await ApiClient.instance.registerNotificationDevice(
        token: fcmToken,
        preferences: _preferences,
      );
    } on ApiException {
      // Ignore transient sync failures and retry on the next auth or token event.
    }
  }

  static Future<void> unregisterCurrentDevice() async {
    if (!_supportsFcm) {
      return;
    }

    final sessionToken = await ApiClient.instance.getToken();
    if (sessionToken == null || sessionToken.isEmpty) {
      return;
    }

    final fcmToken = await FirebaseMessaging.instance.getToken();
    if (fcmToken == null || fcmToken.isEmpty) {
      return;
    }

    try {
      await ApiClient.instance.unregisterNotificationDevice(token: fcmToken);
    } on ApiException {
      // Best-effort cleanup on logout.
    }
  }

  static Future<void> _handleForegroundMessage(RemoteMessage message) async {
    final preferenceKey = _readDataField(message, 'preferenceKey');
    if (preferenceKey != null && (_preferences[preferenceKey] ?? true) == false) {
      return;
    }

    final title = message.notification?.title ?? _readDataField(message, 'title');
    final body = message.notification?.body ?? _readDataField(message, 'body');
    if (title == null || title.trim().isEmpty || body == null || body.trim().isEmpty) {
      return;
    }

    final type = _readDataField(message, 'type');
    final id = message.messageId?.trim();
    await AppNotificationService.showNotification(
      id: (id != null && id.isNotEmpty)
          ? id
          : '${type ?? 'agrisetu'}-${DateTime.now().microsecondsSinceEpoch}',
      title: title.trim(),
      body: body.trim(),
      route: _routeFromMessage(message),
    );
  }

  static String? _routeFromMessage(RemoteMessage message) {
    final route = _readDataField(message, 'route');
    if (route == null) {
      return null;
    }

    final trimmed = route.trim();
    return trimmed.isEmpty ? null : trimmed;
  }

  static String? _readDataField(RemoteMessage message, String key) {
    final value = message.data[key];
    if (value is! String) {
      return null;
    }

    return value;
  }
}
