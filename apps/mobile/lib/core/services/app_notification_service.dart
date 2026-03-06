import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

class _NotificationRouteBus {
  static final StreamController<String> _controller =
      StreamController<String>.broadcast();
  static String? _initialRoute;

  static Stream<String> get stream => _controller.stream;

  static void dispatch(String? route) {
    final trimmed = route?.trim();
    if (trimmed == null || trimmed.isEmpty) {
      return;
    }
    _controller.add(trimmed);
  }

  static void seedInitial(String? route) {
    final trimmed = route?.trim();
    if (trimmed == null || trimmed.isEmpty) {
      return;
    }
    _initialRoute = trimmed;
  }

  static String? consumeInitial() {
    final route = _initialRoute;
    _initialRoute = null;
    return route;
  }
}

class AppNotificationService {
  AppNotificationService._();

  static final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();

  static const String channelId = 'agrisetu_updates';
  static bool _initialized = false;

  static const AndroidNotificationChannel _channel = AndroidNotificationChannel(
    channelId,
    'AgriSetu Updates',
    description: 'Cluster, payment, delivery, and account notifications.',
    importance: Importance.high,
  );

  static bool get _supportsDeviceNotifications =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  static Stream<String> get routeStream => _NotificationRouteBus.stream;

  static String? consumeInitialRoute() => _NotificationRouteBus.consumeInitial();

  static void dispatchRoute(String? route) {
    _NotificationRouteBus.dispatch(route);
  }

  static void seedInitialRoute(String? route) {
    _NotificationRouteBus.seedInitial(route);
  }

  static Future<void> initialize({bool headless = false}) async {
    if (_initialized || !_supportsDeviceNotifications) {
      return;
    }

    const settings = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
    );

    await _plugin.initialize(
      settings,
      onDidReceiveNotificationResponse: (response) {
        _NotificationRouteBus.dispatch(response.payload);
      },
    );

    final androidPlugin = _plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    await androidPlugin?.createNotificationChannel(_channel);

    if (!headless) {
      final launchDetails = await _plugin.getNotificationAppLaunchDetails();
      _NotificationRouteBus.seedInitial(
        launchDetails?.notificationResponse?.payload,
      );
    }

    _initialized = true;
  }

  static Future<void> requestPermissions() async {
    if (!_supportsDeviceNotifications) {
      return;
    }

    final androidPlugin = _plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    await androidPlugin?.requestNotificationsPermission();
  }

  static Future<void> showNotification({
    required String id,
    required String title,
    required String body,
    String? route,
  }) async {
    if (!_supportsDeviceNotifications) {
      return;
    }

    final details = NotificationDetails(
      android: AndroidNotificationDetails(
        _channel.id,
        _channel.name,
        channelDescription: _channel.description,
        importance: Importance.high,
        priority: Priority.high,
        ticker: 'AgriSetu update',
      ),
    );

    await _plugin.show(
      id.hashCode & 0x7fffffff,
      title,
      body,
      details,
      payload: route,
    );
  }
}
