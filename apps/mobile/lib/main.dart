import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/providers/auth_provider.dart';
import 'core/providers/notification_provider.dart';
import 'core/services/app_notification_service.dart';
import 'core/services/push_notification_service.dart';
import 'core/utils/router.dart';
import 'shared/theme/app_theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.dark,
  ));

  await AppNotificationService.initialize();
  await PushNotificationService.initialize();

  runApp(
    const ProviderScope(
      child: AgriSetuApp(),
    ),
  );
}

class AgriSetuApp extends ConsumerStatefulWidget {
  const AgriSetuApp({super.key});

  @override
  ConsumerState<AgriSetuApp> createState() => _AgriSetuAppState();
}

class _AgriSetuAppState extends ConsumerState<AgriSetuApp> {
  StreamSubscription<String>? _notificationRouteSubscription;
  ProviderSubscription<AsyncValue<AuthState>>? _authSubscription;
  ProviderSubscription<AsyncValue<Map<String, bool>>>?
      _notificationPreferenceSubscription;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await PushNotificationService.requestPermissions();
      await _syncNotificationRegistration();

      if (!mounted) {
        return;
      }

      final router = ref.read(routerProvider);
      final initialRoute = AppNotificationService.consumeInitialRoute();
      if (initialRoute != null) {
        router.push(initialRoute);
      }

      _notificationRouteSubscription ??=
          AppNotificationService.routeStream.listen((route) {
        router.push(route);
      });

      _authSubscription ??= ref.listenManual(authProvider, (previous, next) {
        final authState = next.valueOrNull;
        if (!(authState?.isAuthenticated ?? false)) {
          return;
        }

        final preferences =
            ref.read(notificationPreferencesProvider).valueOrNull ??
                defaultNotificationPreferences;
        unawaited(
          PushNotificationService.syncDeviceRegistration(
            preferences: preferences,
          ),
        );
      });

      _notificationPreferenceSubscription ??=
          ref.listenManual(notificationPreferencesProvider, (previous, next) {
        final authState = ref.read(authProvider).valueOrNull;
        if (!(authState?.isAuthenticated ?? false)) {
          return;
        }

        final preferences = next.valueOrNull ?? defaultNotificationPreferences;
        unawaited(
          PushNotificationService.syncDeviceRegistration(
            preferences: preferences,
          ),
        );
      });
    });
  }

  Future<void> _syncNotificationRegistration() async {
    final authState = ref.read(authProvider).valueOrNull;
    if (!(authState?.isAuthenticated ?? false)) {
      return;
    }

    final preferences =
        ref.read(notificationPreferencesProvider).valueOrNull ??
            defaultNotificationPreferences;
    await PushNotificationService.syncDeviceRegistration(
      preferences: preferences,
    );
  }

  @override
  void dispose() {
    _notificationRouteSubscription?.cancel();
    _authSubscription?.close();
    _notificationPreferenceSubscription?.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      title: 'AgriSetu',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      routerConfig: router,
    );
  }
}
