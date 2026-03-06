import 'dart:async';
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:workmanager/workmanager.dart';

import '../models/app_notification_model.dart';
import '../providers/auth_provider.dart';
import '../providers/notification_provider.dart';

const String _notificationSyncTask = 'agrisetu_notification_sync';
const String _notificationChannelId = 'agrisetu_updates';
const String _deliveredNotificationIdsPrefix = 'delivered_notification_ids_';

@pragma('vm:entry-point')
void agrisetuNotificationBackgroundDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    WidgetsFlutterBinding.ensureInitialized();
    DartPluginRegistrant.ensureInitialized();

    await AppNotificationService.initialize(headless: true);
    await AppNotificationService.syncAndShowNotifications();
    return Future.value(true);
  });
}

class _NotificationRouteBus {
  static final StreamController<String> _controller =
      StreamController<String>.broadcast();
  static String? _initialRoute;

  static Stream<String> get stream => _controller.stream;

  static void dispatch(String? route) {
    final trimmed = route?.trim();
    if (trimmed == null || trimmed.isEmpty) return;
    _controller.add(trimmed);
  }

  static void seedInitial(String? route) {
    final trimmed = route?.trim();
    if (trimmed == null || trimmed.isEmpty) return;
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
  static Timer? _foregroundSyncTimer;
  static bool _initialized = false;

  static const AndroidNotificationChannel _channel = AndroidNotificationChannel(
    _notificationChannelId,
    'AgriSetu Updates',
    description: 'Cluster, payment, delivery, and account notifications.',
    importance: Importance.high,
  );

  static bool get _supportsDeviceNotifications =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS);

  static Stream<String> get routeStream => _NotificationRouteBus.stream;

  static String? consumeInitialRoute() => _NotificationRouteBus.consumeInitial();

  static Future<void> initialize({bool headless = false}) async {
    if (_initialized || !_supportsDeviceNotifications) return;

    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings();
    const settings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
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
    if (!_supportsDeviceNotifications) return;

    final androidPlugin = _plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    await androidPlugin?.requestNotificationsPermission();

    final iosPlugin = _plugin
        .resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>();
    await iosPlugin?.requestPermissions(
      alert: true,
      badge: true,
      sound: true,
    );
  }

  static Future<void> registerBackgroundSync() async {
    if (!_supportsDeviceNotifications) return;

    await Workmanager().initialize(
      agrisetuNotificationBackgroundDispatcher,
      isInDebugMode: false,
    );

    await Workmanager().registerPeriodicTask(
      _notificationSyncTask,
      _notificationSyncTask,
      frequency: const Duration(minutes: 15),
      existingWorkPolicy: ExistingWorkPolicy.keep,
      constraints: Constraints(
        networkType: NetworkType.connected,
      ),
    );
  }

  static Future<void> startForegroundSync() async {
    if (!_supportsDeviceNotifications) return;

    await syncAndShowNotifications();

    _foregroundSyncTimer ??= Timer.periodic(
      const Duration(minutes: 1),
      (_) => syncAndShowNotifications(),
    );
  }

  static Future<void> syncAndShowNotifications() async {
    if (!_supportsDeviceNotifications) return;

    final container = ProviderContainer();

    try {
      final authState = await container.read(authProvider.future);
      final farmer = authState.farmer;
      if (!authState.isAuthenticated || farmer == null) return;

      final notifications =
          await container.read(inAppNotificationsProvider.future);
      final deliveredIds = await _loadDeliveredIds(farmer.id);

      final pending = notifications
          .where((item) => !item.isRead && !deliveredIds.contains(item.id))
          .take(5)
          .toList()
          .reversed
          .toList();

      for (final item in pending) {
        await _showNotification(item);
        deliveredIds.add(item.id);
      }

      await _persistDeliveredIds(farmer.id, deliveredIds);
    } finally {
      container.dispose();
    }
  }

  static Future<void> _showNotification(AppNotificationItem item) async {
    if (!_supportsDeviceNotifications) return;

    final details = NotificationDetails(
      android: AndroidNotificationDetails(
        _channel.id,
        _channel.name,
        channelDescription: _channel.description,
        importance: Importance.high,
        priority: Priority.high,
        ticker: 'AgriSetu update',
      ),
      iOS: const DarwinNotificationDetails(),
    );

    await _plugin.show(
      item.id.hashCode & 0x7fffffff,
      item.title,
      item.body,
      details,
      payload: item.route,
    );
  }

  static Future<Set<String>> _loadDeliveredIds(String farmerId) async {
    final prefs = await SharedPreferences.getInstance();
    return (prefs.getStringList('$_deliveredNotificationIdsPrefix$farmerId') ??
            const <String>[])
        .toSet();
  }

  static Future<void> _persistDeliveredIds(
    String farmerId,
    Set<String> deliveredIds,
  ) async {
    final prefs = await SharedPreferences.getInstance();
    final trimmed = deliveredIds.toList()..sort();
    if (trimmed.length > 200) {
      trimmed.removeRange(0, trimmed.length - 200);
    }
    await prefs.setStringList(
      '$_deliveredNotificationIdsPrefix$farmerId',
      trimmed,
    );
  }
}
