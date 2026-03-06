import 'dart:ui';

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
import '../../features/profile/screens/help_support_screen.dart';
import '../../features/profile/screens/notification_settings_screen.dart';
import '../../features/profile/screens/profile_screen.dart';
import '../../features/profile/screens/settings_info_screen.dart';
import '../../features/voice/screens/voice_order_screen.dart';
import '../providers/auth_provider.dart';
import '../../shared/widgets/main_scaffold.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'root');
final _shellNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'shell');

CustomTransitionPage<void> _smoothDissolvePage({
  required GoRouterState state,
  required Widget child,
}) {
  return CustomTransitionPage<void>(
    key: state.pageKey,
    transitionDuration: const Duration(milliseconds: 360),
    reverseTransitionDuration: const Duration(milliseconds: 260),
    child: child,
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      final dissolve = CurvedAnimation(
        parent: animation,
        curve: Curves.easeOutCubic,
        reverseCurve: Curves.easeInCubic,
      );
      final opacity = CurvedAnimation(
        parent: dissolve,
        curve: const Interval(0.12, 1.0),
        reverseCurve: const Interval(0.0, 0.88),
      );

      return AnimatedBuilder(
        animation: dissolve,
        child: FadeTransition(opacity: opacity, child: child),
        builder: (context, fadeChild) {
          final sigma = (1.0 - dissolve.value) * 8.0;
          return ImageFiltered(
            imageFilter: ImageFilter.blur(sigmaX: sigma, sigmaY: sigma),
            child: fadeChild,
          );
        },
      );
    },
  );
}

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
      GoRoute(
        path: '/landing',
        pageBuilder: (_, state) =>
            _smoothDissolvePage(state: state, child: const LandingScreen()),
      ),
      GoRoute(
        path: '/login',
        pageBuilder: (_, state) {
          final phone = state.extra as String?;
          return _smoothDissolvePage(
            state: state,
            child: PhoneLoginScreen(initialPhone: phone),
          );
        },
      ),
      GoRoute(
        path: '/otp',
        pageBuilder: (_, state) {
          final phone = state.extra as String? ?? '';
          return _smoothDissolvePage(
            state: state,
            child: OtpVerifyScreen(phone: phone),
          );
        },
      ),
      GoRoute(
        path: '/onboarding',
        pageBuilder: (_, state) => _smoothDissolvePage(
          state: state,
          child: const OnboardingScreen(),
        ),
      ),
      GoRoute(
        path: '/profile/edit',
        pageBuilder: (_, state) => _smoothDissolvePage(
          state: state,
          child: const OnboardingScreen(isEditMode: true),
        ),
      ),
      ShellRoute(
        navigatorKey: _shellNavigatorKey,
        builder: (context, state, child) => MainScaffold(child: child),
        routes: [
          GoRoute(
            path: '/home',
            pageBuilder: (_, state) => _smoothDissolvePage(
              state: state,
              child: const HomeScreen(),
            ),
          ),
          GoRoute(
            path: '/orders',
            pageBuilder: (_, state) => _smoothDissolvePage(
              state: state,
              child: const OrderHistoryScreen(),
            ),
          ),
          GoRoute(
            path: '/orders/:id',
            pageBuilder: (_, state) {
              final prefill = state.extra as Map<String, dynamic>?;
              return _smoothDissolvePage(
                state: state,
                child: OrderDetailsScreen(
                  orderId: state.pathParameters['id']!,
                  prefill: prefill,
                ),
              );
            },
          ),
          GoRoute(
            path: '/clusters',
            pageBuilder: (_, state) {
              final extra = state.extra;
              if (extra is Map<String, dynamic>) {
                return _smoothDissolvePage(
                  state: state,
                  child: AvailableClustersScreen(
                    product: extra['product'] as String?,
                    orderId: extra['orderId'] as String?,
                    matchedGigId: extra['matchedGigId'] as String?,
                  ),
                );
              }
              final product = extra as String?;
              return _smoothDissolvePage(
                state: state,
                child: AvailableClustersScreen(product: product),
              );
            },
          ),
          GoRoute(
            path: '/clusters/:id',
            pageBuilder: (_, state) => _smoothDissolvePage(
              state: state,
              child: ClusterDetailScreen(
                clusterId: state.pathParameters['id']!,
              ),
            ),
          ),
          GoRoute(
            path: '/clusters-empty',
            pageBuilder: (_, state) => _smoothDissolvePage(
              state: state,
              child: const ClusterEmptyScreen(),
            ),
          ),
          GoRoute(
            path: '/payment/:clusterId',
            pageBuilder: (_, state) => _smoothDissolvePage(
              state: state,
              child: PaymentScreen(
                clusterId: state.pathParameters['clusterId']!,
              ),
            ),
          ),
          GoRoute(
            path: '/payment-confirmed/:clusterId',
            pageBuilder: (_, state) {
              final extra = state.extra as Map<String, dynamic>?;
              return _smoothDissolvePage(
                state: state,
                child: PaymentConfirmedScreen(
                  clusterId: state.pathParameters['clusterId']!,
                  allPaid: extra?['allPaid'] as bool? ?? false,
                ),
              );
            },
          ),
          GoRoute(
            path: '/payment-failed/:clusterId',
            pageBuilder: (_, state) => _smoothDissolvePage(
              state: state,
              child: PaymentFailedScreen(
                clusterId: state.pathParameters['clusterId']!,
              ),
            ),
          ),
          GoRoute(
            path: '/delivery/:clusterId',
            pageBuilder: (_, state) => _smoothDissolvePage(
              state: state,
              child: DeliveryTrackingScreen(
                clusterId: state.pathParameters['clusterId']!,
              ),
            ),
          ),
          GoRoute(
            path: '/delivered/:clusterId',
            pageBuilder: (_, state) => _smoothDissolvePage(
              state: state,
              child: OrderDeliveredScreen(
                clusterId: state.pathParameters['clusterId']!,
              ),
            ),
          ),
          GoRoute(
            path: '/profile',
            pageBuilder: (_, state) => _smoothDissolvePage(
              state: state,
              child: const ProfileScreen(),
            ),
          ),
          GoRoute(
            path: '/profile/notifications',
            pageBuilder: (_, state) => _smoothDissolvePage(
              state: state,
              child: const NotificationSettingsScreen(),
            ),
          ),
          GoRoute(
            path: '/profile/privacy-data',
            pageBuilder: (_, state) => _smoothDissolvePage(
              state: state,
              child: const SettingsInfoScreen(
                title: 'Privacy & Data',
                heroIcon: Icons.shield_outlined,
                summary:
                    'We are committed to keeping your personal details, farm profile, and transaction records safe while giving you control over how your information is used inside AgriSetu.',
                highlights: [
                  'Your account, profile, and payment-related information are stored securely.',
                  'Sensitive data is protected during transmission and while it is stored in our systems.',
                  'We only use your data to operate AgriSetu features such as onboarding, orders, payments, support, and service improvements.',
                ],
                sections: [
                  SettingsInfoSection(
                    title: 'How We Protect Your Data',
                    body:
                        'AgriSetu uses standard safeguards to help protect your information from unauthorized access, misuse, or accidental loss. We continuously review our systems and access controls so that only approved processes and personnel can handle sensitive user data.',
                  ),
                  SettingsInfoSection(
                    title: 'What We Collect',
                    body:
                        'We may collect details such as your name, phone number, farm location, crop preferences, language preference, order history, payment references, and support requests. This information helps us personalize the app and deliver core services reliably.',
                  ),
                  SettingsInfoSection(
                    title: 'How Your Data Is Used',
                    body:
                        'Your data is used to create and manage your account, process orders, coordinate delivery and payment flows, improve product recommendations, and offer customer support. We do not display private information publicly unless it is required for a transaction or a feature you initiate.',
                  ),
                  SettingsInfoSection(
                    title: 'Your Control',
                    body:
                        'You can review and update your profile details from the app. If you need help with account access, corrections, or other privacy-related concerns, you can contact support and our team will assist you.',
                  ),
                ],
                footer:
                    'This page provides a general overview of AgriSetu privacy practices and product safeguards. It can be expanded later into a full legal privacy policy if needed.',
              ),
            ),
          ),
          GoRoute(
            path: '/profile/help-support',
            pageBuilder: (_, state) => _smoothDissolvePage(
              state: state,
              child: const HelpSupportScreen(),
            ),
          ),
          GoRoute(
            path: '/profile/about',
            pageBuilder: (_, state) => _smoothDissolvePage(
              state: state,
              child: const SettingsInfoScreen(
                title: 'About AgriSetu',
                heroIcon: Icons.info_outline,
                summary:
                    'AgriSetu is designed to help farmers access transparent agri-commerce workflows, connect with trusted vendors, and manage ordering, clustering, delivery, and payments in one place.',
                highlights: [
                  'Built to simplify agricultural buying and selling journeys.',
                  'Supports better price visibility, group ordering, and coordinated fulfilment.',
                  'Focused on practical digital tools for real farmer and vendor workflows.',
                ],
                sections: [
                  SettingsInfoSection(
                    title: 'What AgriSetu Does',
                    body:
                        'AgriSetu brings farmers and vendors onto a shared platform where they can discover products, place orders, form clusters, coordinate payments, and track delivery progress. The goal is to reduce friction and make agricultural commerce easier to manage from a mobile device.',
                  ),
                  SettingsInfoSection(
                    title: 'Why It Matters',
                    body:
                        'Many farming communities still face fragmented buying processes, unclear pricing, and limited visibility into order status. AgriSetu aims to address those gaps by making information easier to access and by helping participants coordinate demand and supply more efficiently.',
                  ),
                  SettingsInfoSection(
                    title: 'Experience Principles',
                    body:
                        'The product is being shaped around accessibility, trust, local relevance, and simplicity. Features like profile management, multilingual support, voice-assisted flows, and status tracking are intended to keep the experience practical for day-to-day agricultural use.',
                  ),
                ],
                footer:
                    'AgriSetu will continue evolving as more support, transparency, and service features are added for both farmers and vendors.',
              ),
            ),
          ),
          GoRoute(
            path: '/voice',
            pageBuilder: (_, state) => _smoothDissolvePage(
              state: state,
              child: const VoiceOrderScreen(),
            ),
          ),
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
