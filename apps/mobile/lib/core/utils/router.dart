import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../features/auth/screens/landing_screen.dart';
import '../../features/auth/screens/phone_login_screen.dart';
import '../../features/auth/screens/otp_verify_screen.dart';
import '../../features/auth/screens/onboarding_screen.dart';
import '../../features/home/screens/home_screen.dart';
import '../../features/orders/screens/order_details_screen.dart';
import '../../features/orders/screens/order_history_screen.dart';
import '../../features/clusters/screens/available_clusters_screen.dart';
import '../../features/clusters/screens/cluster_detail_screen.dart';
import '../../features/clusters/screens/cluster_empty_screen.dart';
import '../../features/payment/screens/payment_screen.dart';
import '../../features/payment/screens/payment_confirmed_screen.dart';
import '../../features/payment/screens/payment_failed_screen.dart';
import '../../features/delivery/screens/delivery_tracking_screen.dart';
import '../../features/delivery/screens/order_delivered_screen.dart';
import '../../features/profile/screens/profile_screen.dart';
import '../../features/voice/screens/voice_order_screen.dart';
import '../providers/auth_provider.dart';
import '../../shared/widgets/main_scaffold.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'root');
final _shellNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'shell');

final routerProvider = Provider<GoRouter>((ref) {
  final router = GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/landing',
    errorBuilder: (context, state) => Scaffold(
      body: SafeArea(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Unable to open this page'),
              const SizedBox(height: 12),
              ElevatedButton(
                onPressed: () => context.go('/home'),
                child: const Text('Go to Home'),
              ),
            ],
          ),
        ),
      ),
    ),
    redirect: (context, state) {
      final authState = ref.read(authProvider);
      final authVal = authState.valueOrNull;
      final isLoading = authState.isLoading;
      final isAuth = authVal?.isAuthenticated ?? false;
      final needsProfile = authVal?.needsProfile ?? false;

      var loc = state.uri.path;
      if (loc.length > 1 && loc.endsWith('/')) {
        loc = loc.substring(0, loc.length - 1);
      }

      // Root location can appear on web reload and otherwise renders blank shell.
      if (loc == '/') {
        if (isLoading) return '/landing';
        if (!isAuth || authVal == null || authState.hasError) return '/landing';
        return needsProfile ? '/onboarding' : '/home';
      }

      if (isLoading) return null;

      // Failed auth state should recover to landing.
      if (authState.hasError || authVal == null) {
        if (loc == '/landing' || loc == '/login' || loc == '/otp') return null;
        return '/landing';
      }

      // Not authenticated → auth screens
      if (!isAuth) {
        if (loc == '/landing' || loc == '/login' || loc == '/otp') return null;
        return '/landing';
      }

      // Needs profile → onboarding, but allow profile screens so users can
      // edit/verify details without being bounced unexpectedly.
      if (needsProfile &&
          loc != '/onboarding' &&
          loc != '/profile' &&
          loc != '/profile/edit') {
        return '/onboarding';
      }
      if (!needsProfile && loc == '/onboarding') return '/home';

      // Already authed → skip auth screens
      if (loc == '/landing' || loc == '/login' || loc == '/otp') return '/home';

      return null;
    },
    routes: [
      GoRoute(path: '/landing', builder: (_, __) => const LandingScreen()),
      GoRoute(
          path: '/login',
          builder: (_, state) {
            final phone = state.extra as String?;
            return PhoneLoginScreen(initialPhone: phone);
          }),
      GoRoute(
          path: '/otp',
          builder: (_, state) {
            final phone = state.extra as String? ?? '';
            return OtpVerifyScreen(phone: phone);
          }),
      GoRoute(
          path: '/onboarding', builder: (_, __) => const OnboardingScreen()),
      GoRoute(
        path: '/profile/edit',
        builder: (_, __) => const OnboardingScreen(isEditMode: true),
      ),
      ShellRoute(
        navigatorKey: _shellNavigatorKey,
        builder: (context, state, child) => MainScaffold(child: child),
        routes: [
          GoRoute(path: '/home', builder: (_, __) => const HomeScreen()),
          GoRoute(
              path: '/orders', builder: (_, __) => const OrderHistoryScreen()),
          GoRoute(
            path: '/orders/:id',
            builder: (_, state) {
              final prefill = state.extra as Map<String, dynamic>?;
              return OrderDetailsScreen(
                orderId: state.pathParameters['id']!,
                prefill: prefill,
              );
            },
          ),
          GoRoute(
            path: '/clusters',
            builder: (_, state) {
              final extra = state.extra;
              if (extra is Map<String, dynamic>) {
                return AvailableClustersScreen(
                  cropName: extra['cropName'] as String?,
                  orderId: extra['orderId'] as String?,
                );
              }
              final cropName = extra as String?;
              return AvailableClustersScreen(cropName: cropName);
            },
          ),
          GoRoute(
            path: '/clusters/:id',
            builder: (_, state) => ClusterDetailScreen(
              clusterId: state.pathParameters['id']!,
            ),
          ),
          GoRoute(
              path: '/clusters-empty',
              builder: (_, __) => const ClusterEmptyScreen()),
          GoRoute(
            path: '/payment/:clusterId',
            builder: (_, state) => PaymentScreen(
              clusterId: state.pathParameters['clusterId']!,
            ),
          ),
          GoRoute(
            path: '/payment-confirmed/:clusterId',
            builder: (_, state) {
              final extra = state.extra as Map<String, dynamic>?;
              return PaymentConfirmedScreen(
                clusterId: state.pathParameters['clusterId']!,
                allPaid: extra?['allPaid'] as bool? ?? false,
              );
            },
          ),
          GoRoute(
            path: '/payment-failed/:clusterId',
            builder: (_, state) => PaymentFailedScreen(
              clusterId: state.pathParameters['clusterId']!,
            ),
          ),
          GoRoute(
            path: '/delivery/:clusterId',
            builder: (_, state) => DeliveryTrackingScreen(
              clusterId: state.pathParameters['clusterId']!,
            ),
          ),
          GoRoute(
            path: '/delivered/:clusterId',
            builder: (_, state) => OrderDeliveredScreen(
              clusterId: state.pathParameters['clusterId']!,
            ),
          ),
          GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
          GoRoute(path: '/voice', builder: (_, __) => const VoiceOrderScreen()),
        ],
      ),
    ],
  );

  ref.listen(authProvider, (_, __) {
    router.refresh();
  });
  ref.onDispose(router.dispose);

  return router;
});
