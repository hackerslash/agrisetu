import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_client.dart';
import '../models/app_notification_model.dart';
import '../models/order_model.dart';
import 'auth_provider.dart';

class NotificationPreferenceDefinition {
  final String keyName;
  final String label;
  final String subtitle;
  final bool defaultEnabled;

  const NotificationPreferenceDefinition({
    required this.keyName,
    required this.label,
    required this.subtitle,
    required this.defaultEnabled,
  });
}

class NotificationPreferenceGroup {
  final String title;
  final String description;
  final List<NotificationPreferenceDefinition> items;

  const NotificationPreferenceGroup({
    required this.title,
    required this.description,
    required this.items,
  });
}

const List<NotificationPreferenceGroup> notificationPreferenceGroups = [
  NotificationPreferenceGroup(
    title: 'Cluster Activity',
    description:
        'Stay updated when your order moves into group-buying and vendor selection stages.',
    items: [
      NotificationPreferenceDefinition(
        keyName: 'cluster_formed',
        label: 'Cluster formed',
        subtitle: 'Get notified when your order joins a cluster successfully.',
        defaultEnabled: true,
      ),
      NotificationPreferenceDefinition(
        keyName: 'voting_started',
        label: 'Voting started',
        subtitle:
            'Know when vendor voting opens so you can review and vote on time.',
        defaultEnabled: true,
      ),
      NotificationPreferenceDefinition(
        keyName: 'voting_reminders',
        label: 'Voting reminders',
        subtitle: 'Receive reminders before voting windows close.',
        defaultEnabled: true,
      ),
    ],
  ),
  NotificationPreferenceGroup(
    title: 'Payments',
    description:
        'Manage alerts related to pending payments, reminders, and confirmations.',
    items: [
      NotificationPreferenceDefinition(
        keyName: 'payment_pending',
        label: 'Payment pending',
        subtitle:
            'See when a cluster is waiting for your payment to move forward.',
        defaultEnabled: true,
      ),
      NotificationPreferenceDefinition(
        keyName: 'payment_reminders',
        label: 'Payment reminders',
        subtitle: 'Receive reminder nudges before payment deadlines expire.',
        defaultEnabled: true,
      ),
      NotificationPreferenceDefinition(
        keyName: 'payment_confirmed',
        label: 'Payment confirmed',
        subtitle: 'Get confirmation after your payment is successfully recorded.',
        defaultEnabled: true,
      ),
    ],
  ),
  NotificationPreferenceGroup(
    title: 'Orders & Delivery',
    description:
        'Track order progress after vendor selection and during fulfillment.',
    items: [
      NotificationPreferenceDefinition(
        keyName: 'order_status_updates',
        label: 'Order status updates',
        subtitle:
            'Alerts for processing, dispatch, completion, and other status changes.',
        defaultEnabled: true,
      ),
      NotificationPreferenceDefinition(
        keyName: 'delivery_updates',
        label: 'Delivery updates',
        subtitle: 'Important delivery movement and confirmation updates.',
        defaultEnabled: true,
      ),
    ],
  ),
  NotificationPreferenceGroup(
    title: 'Account & Product',
    description:
        'Control non-transactional app notifications and service messages.',
    items: [
      NotificationPreferenceDefinition(
        keyName: 'account_updates',
        label: 'Account updates',
        subtitle: 'Security, profile, or service notices related to your account.',
        defaultEnabled: true,
      ),
      NotificationPreferenceDefinition(
        keyName: 'product_announcements',
        label: 'Product announcements',
        subtitle: 'Optional news about new features, launches, and improvements.',
        defaultEnabled: false,
      ),
    ],
  ),
];

final Map<String, bool> defaultNotificationPreferences = {
  for (final group in notificationPreferenceGroups)
    for (final item in group.items) item.keyName: item.defaultEnabled,
};

String _notificationPreferenceStorageKey(String key) => 'notification_pref_$key';

String _notificationReadIdsStorageKey(String farmerId) =>
    'notification_read_ids_$farmerId';

class NotificationPreferencesNotifier extends AsyncNotifier<Map<String, bool>> {
  @override
  Future<Map<String, bool>> build() async {
    final prefs = await SharedPreferences.getInstance();
    return {
      for (final entry in defaultNotificationPreferences.entries)
        entry.key:
            prefs.getBool(_notificationPreferenceStorageKey(entry.key)) ??
                entry.value,
    };
  }

  Future<void> updatePreference(String key, bool value) async {
    final current = state.valueOrNull ?? defaultNotificationPreferences;
    state = AsyncValue.data({
      ...current,
      key: value,
    });
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_notificationPreferenceStorageKey(key), value);
  }

  Future<void> resetDefaults() async {
    final prefs = await SharedPreferences.getInstance();
    for (final entry in defaultNotificationPreferences.entries) {
      await prefs.setBool(
        _notificationPreferenceStorageKey(entry.key),
        entry.value,
      );
    }
    state = AsyncValue.data({...defaultNotificationPreferences});
  }
}

final notificationPreferencesProvider = AsyncNotifierProvider<
    NotificationPreferencesNotifier, Map<String, bool>>(
  NotificationPreferencesNotifier.new,
);

class InAppNotificationsNotifier
    extends AutoDisposeAsyncNotifier<List<AppNotificationItem>> {
  Timer? _pollTimer;

  ApiClient get _api => ref.read(apiClientProvider);

  @override
  Future<List<AppNotificationItem>> build() async {
    final farmer = ref.watch(currentFarmerProvider);
    final preferences =
        ref.read(notificationPreferencesProvider).valueOrNull ??
            defaultNotificationPreferences;

    if (farmer == null) {
      _pollTimer?.cancel();
      _pollTimer = null;
      return const [];
    }

    _pollTimer ??= Timer.periodic(
      const Duration(seconds: 20),
      (_) => ref.invalidateSelf(),
    );
    ref.onDispose(() {
      _pollTimer?.cancel();
      _pollTimer = null;
    });

    final readIds = await _loadReadIds(farmer.id);
    final dashboard = await _api.getDashboard();
    final paymentRows = await _api.getPayments();

    final orders = (dashboard['orders'] as List<dynamic>? ?? [])
        .map((row) => Order.fromJson(row as Map<String, dynamic>))
        .toList();
    final clusters = (dashboard['clusters'] as List<dynamic>? ?? [])
        .map((row) => Cluster.fromJson(row as Map<String, dynamic>))
        .toList();
    final payments = paymentRows
        .map((row) => Payment.fromJson(row as Map<String, dynamic>))
        .toList();

    return _deriveNotifications(
      farmerId: farmer.id,
      profileCompleteness: farmer.profileCompleteness,
      hasUpiId: (farmer.upiId ?? '').trim().isNotEmpty,
      orders: orders,
      clusters: clusters,
      payments: payments,
      preferences: preferences,
      readIds: readIds,
    );
  }

  Future<void> refresh() async {
    ref.invalidateSelf();
    await future;
  }

  Future<void> markRead(String notificationId) async {
    final farmer = ref.read(currentFarmerProvider);
    if (farmer == null) return;

    final current = state.valueOrNull ?? const <AppNotificationItem>[];
    state = AsyncValue.data([
      for (final item in current)
        item.id == notificationId ? item.copyWith(isRead: true) : item,
    ]);

    final readIds = await _loadReadIds(farmer.id);
    readIds.add(notificationId);
    await _persistReadIds(farmer.id, readIds);
  }

  Future<void> markAllRead() async {
    final farmer = ref.read(currentFarmerProvider);
    if (farmer == null) return;

    final current = state.valueOrNull ?? const <AppNotificationItem>[];
    state = AsyncValue.data([
      for (final item in current) item.copyWith(isRead: true),
    ]);

    final readIds = {
      ...await _loadReadIds(farmer.id),
      ...current.map((item) => item.id),
    };
    await _persistReadIds(farmer.id, readIds);
  }

  Future<Set<String>> _loadReadIds(String farmerId) async {
    final prefs = await SharedPreferences.getInstance();
    return (prefs.getStringList(_notificationReadIdsStorageKey(farmerId)) ?? [])
        .toSet();
  }

  Future<void> _persistReadIds(String farmerId, Set<String> readIds) async {
    final prefs = await SharedPreferences.getInstance();
    final trimmed = readIds.toList()..sort();
    if (trimmed.length > 200) {
      trimmed.removeRange(0, trimmed.length - 200);
    }
    await prefs.setStringList(_notificationReadIdsStorageKey(farmerId), trimmed);
  }

  List<AppNotificationItem> _deriveNotifications({
    required String farmerId,
    required int profileCompleteness,
    required bool hasUpiId,
    required List<Order> orders,
    required List<Cluster> clusters,
    required List<Payment> payments,
    required Map<String, bool> preferences,
    required Set<String> readIds,
  }) {
    final clusterById = <String, Cluster>{};
    for (final cluster in clusters) {
      clusterById[cluster.id] = cluster;
    }
    for (final order in orders) {
      final cluster = order.clusterMember?.cluster;
      if (cluster != null) {
        clusterById.putIfAbsent(cluster.id, () => cluster);
      }
    }

    final byId = <String, AppNotificationItem>{};

    void addNotification(AppNotificationItem item) {
      if (!(preferences[item.preferenceKey] ?? false)) return;
      byId[item.id] = item.copyWith(isRead: readIds.contains(item.id));
    }

    if ((preferences['account_updates'] ?? false) && profileCompleteness < 100) {
      addNotification(
        AppNotificationItem(
          id: 'account-profile-incomplete',
          type: 'account_update',
          preferenceKey: 'account_updates',
          title: 'Complete your profile',
          body: hasUpiId
              ? 'Add a few more farm details to improve matching and cluster recommendations.'
              : 'Add your UPI ID and remaining farm details to complete your AgriSetu profile.',
          createdAt: DateTime.now(),
          route: '/profile/edit',
        ),
      );
    }

    if (preferences['product_announcements'] ?? false) {
      addNotification(
        AppNotificationItem(
          id: 'product-voice-ordering',
          type: 'product_announcement',
          preferenceKey: 'product_announcements',
          title: 'Try voice ordering',
          body:
              'You can place orders faster with the AgriSetu voice ordering flow from the mic button.',
          createdAt: DateTime.now().subtract(const Duration(minutes: 5)),
          route: '/voice',
        ),
      );
    }

    for (final cluster in clusterById.values) {
      ClusterMember? currentMember;
      for (final member in cluster.members) {
        if (member.farmerId == farmerId) {
          currentMember = member;
          break;
        }
      }

      final hasVoted = cluster.bids.any((bid) => bid.currentFarmerVoted);
      final latestBidAt = cluster.bids.isEmpty
          ? cluster.createdAt
          : cluster.bids
              .map((bid) => bid.createdAt)
              .reduce((a, b) => a.isAfter(b) ? a : b);

      if (currentMember != null) {
        addNotification(
          AppNotificationItem(
            id: 'cluster-formed-${cluster.id}-${currentMember.orderId}',
            type: 'cluster_formed',
            preferenceKey: 'cluster_formed',
            title: 'Cluster formed for ${cluster.product}',
            body:
                '${cluster.membersCount} farmers are now grouped${_locationSuffix(cluster)} for ${cluster.product}.',
            createdAt: cluster.createdAt,
            route: '/clusters/${cluster.id}',
          ),
        );
      }

      if (cluster.status == ClusterStatus.voting &&
          currentMember != null &&
          !hasVoted) {
        addNotification(
          AppNotificationItem(
            id: 'voting-started-${cluster.id}',
            type: 'voting_started',
            preferenceKey: 'voting_started',
            title: 'Voting has started',
            body:
                'Vendor bids are ready for ${cluster.product}. Review the options and cast your vote.',
            createdAt: latestBidAt,
            route: '/clusters/${cluster.id}',
          ),
        );

        if (DateTime.now().difference(latestBidAt).inHours >= 6) {
          addNotification(
            AppNotificationItem(
              id: 'voting-reminder-${cluster.id}',
              type: 'voting_reminder',
              preferenceKey: 'voting_reminders',
              title: 'Vote pending in your cluster',
              body:
                  'You still have a pending vote for ${cluster.product}. Your selection helps decide the final vendor.',
              createdAt: latestBidAt.add(const Duration(minutes: 1)),
              route: '/clusters/${cluster.id}',
            ),
          );
        }
      }

      if (cluster.status == ClusterStatus.payment &&
          currentMember != null &&
          !currentMember.hasPaid) {
        final amount = (cluster.bids.isNotEmpty)
            ? cluster.bids.first.totalPrice
            : 0.0;

        addNotification(
          AppNotificationItem(
            id: 'payment-pending-${cluster.id}',
            type: 'payment_pending',
            preferenceKey: 'payment_pending',
            title: 'Payment pending for ${cluster.product}',
            body: amount > 0
                ? 'Pay Rs ${amount.toStringAsFixed(0)} to confirm your participation in this cluster.'
                : 'Your cluster is waiting for payment confirmation.',
            createdAt: cluster.paymentDeadlineAt ?? cluster.createdAt,
            route: '/payment/${cluster.id}',
          ),
        );

        final deadline = cluster.paymentDeadlineAt;
        if (deadline != null && deadline.isAfter(DateTime.now())) {
          final hoursLeft = deadline.difference(DateTime.now()).inHours;
          if (hoursLeft <= 24) {
            addNotification(
              AppNotificationItem(
                id: 'payment-reminder-${cluster.id}-${deadline.toIso8601String()}',
                type: 'payment_reminder',
                preferenceKey: 'payment_reminders',
                title: 'Payment reminder',
                body:
                    'Complete payment for ${cluster.product} before ${DateFormat('d MMM, h:mm a').format(deadline)}.',
                createdAt: deadline.subtract(const Duration(hours: 2)),
                route: '/payment/${cluster.id}',
              ),
            );
          }
        }
      }
    }

    for (final payment in payments) {
      if (payment.status != PaymentStatus.success) continue;
      final cluster = clusterById[payment.clusterId];
      addNotification(
        AppNotificationItem(
          id: 'payment-confirmed-${payment.id}',
          type: 'payment_confirmed',
          preferenceKey: 'payment_confirmed',
          title: 'Payment confirmed',
          body: cluster != null
              ? 'Your payment for ${cluster.product} was received successfully.'
              : 'Your payment was received successfully.',
          createdAt: payment.createdAt,
          route: cluster != null ? '/clusters/${cluster.id}' : null,
        ),
      );
    }

    for (final order in orders) {
      final cluster =
          clusterById[order.clusterMember?.clusterId ?? ''] ??
              order.clusterMember?.cluster;

      switch (order.status) {
        case OrderStatus.processing:
          addNotification(
            AppNotificationItem(
              id: 'order-processing-${order.id}',
              type: 'order_processing',
              preferenceKey: 'order_status_updates',
              title: 'Order is being processed',
              body:
                  '${order.product} is now being prepared by the selected vendor.',
              createdAt: order.createdAt,
              route: '/orders/${order.id}',
            ),
          );
          break;
        case OrderStatus.rejected:
          addNotification(
            AppNotificationItem(
              id: 'order-rejected-${order.id}',
              type: 'order_rejected',
              preferenceKey: 'order_status_updates',
              title: 'Order rejected',
              body:
                  'There was an issue with your ${order.product} order. Open the order for details.',
              createdAt: order.createdAt,
              route: '/orders/${order.id}',
            ),
          );
          break;
        case OrderStatus.failed:
          addNotification(
            AppNotificationItem(
              id: 'order-failed-${order.id}',
              type: 'order_failed',
              preferenceKey: 'order_status_updates',
              title: 'Order needs attention',
              body:
                  '${order.product} could not proceed. Please review the order status.',
              createdAt: order.createdAt,
              route: '/orders/${order.id}',
            ),
          );
          break;
        case OrderStatus.outForDelivery:
        case OrderStatus.dispatched:
          addNotification(
            AppNotificationItem(
              id: 'delivery-moving-${order.id}-${order.status.name}',
              type: 'delivery_update',
              preferenceKey: 'delivery_updates',
              title: order.status == OrderStatus.outForDelivery
                  ? 'Delivery is on the way'
                  : 'Order dispatched',
              body: cluster != null
                  ? '${order.product} is moving through delivery for your ${cluster.district ?? 'cluster'} order.'
                  : '${order.product} has been dispatched.',
              createdAt: order.createdAt,
              route: cluster != null
                  ? '/delivery/${cluster.id}'
                  : '/orders/${order.id}',
            ),
          );
          break;
        case OrderStatus.delivered:
          addNotification(
            AppNotificationItem(
              id: 'delivery-completed-${order.id}',
              type: 'delivery_completed',
              preferenceKey: 'delivery_updates',
              title: 'Order delivered',
              body:
                  '${order.product} has been marked as delivered successfully.',
              createdAt: order.createdAt,
              route: cluster != null
                  ? '/delivered/${cluster.id}'
                  : '/orders/${order.id}',
            ),
          );
          break;
        case OrderStatus.pending:
        case OrderStatus.clustered:
        case OrderStatus.paymentPending:
        case OrderStatus.paid:
        case OrderStatus.cancelled:
          break;
      }
    }

    final result = byId.values.toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return result;
  }

  String _locationSuffix(Cluster cluster) {
    if ((cluster.district ?? '').trim().isNotEmpty) {
      return ' in ${cluster.district!.trim()}';
    }
    if ((cluster.state ?? '').trim().isNotEmpty) {
      return ' in ${cluster.state!.trim()}';
    }
    return '';
  }
}

final inAppNotificationsProvider = AsyncNotifierProvider.autoDispose<
    InAppNotificationsNotifier, List<AppNotificationItem>>(
  InAppNotificationsNotifier.new,
);

final unreadNotificationCountProvider = Provider.autoDispose<int>((ref) {
  final items = ref.watch(inAppNotificationsProvider).valueOrNull ?? const [];
  return items.where((item) => !item.isRead).length;
});
