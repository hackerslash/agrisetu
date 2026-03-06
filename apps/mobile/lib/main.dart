import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/services/app_notification_service.dart';
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
  await AppNotificationService.registerBackgroundSync();

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

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await AppNotificationService.requestPermissions();
      await AppNotificationService.startForegroundSync();

      if (!mounted) return;
      final router = ref.read(routerProvider);
      final initialRoute = AppNotificationService.consumeInitialRoute();
      if (initialRoute != null) {
        router.push(initialRoute);
      }

      _notificationRouteSubscription ??=
          AppNotificationService.routeStream.listen((route) {
        router.push(route);
      });
    });
  }

  @override
  void dispose() {
    _notificationRouteSubscription?.cancel();
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
