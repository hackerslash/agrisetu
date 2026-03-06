import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/models/app_notification_model.dart';
import '../../../core/providers/notification_provider.dart';
import '../../../shared/theme/app_theme.dart';

class NotificationSettingsScreen extends ConsumerWidget {
  const NotificationSettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final preferencesAsync = ref.watch(notificationPreferencesProvider);
    final notificationsAsync = ref.watch(inAppNotificationsProvider);
    final unreadCount = ref.watch(unreadNotificationCountProvider);
    final preferences =
        preferencesAsync.valueOrNull ?? defaultNotificationPreferences;
    final enabledCount =
        preferences.values.where((isEnabled) => isEnabled).length;

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: const Text('Notification Settings'),
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.surface,
      ),
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: () => ref.read(inAppNotificationsProvider.notifier).refresh(),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 32),
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AppColors.primary,
                borderRadius: BorderRadius.circular(24),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 54,
                    height: 54,
                    decoration: BoxDecoration(
                      color: AppColors.surface.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: const Icon(
                      Icons.notifications_active_outlined,
                      color: AppColors.surface,
                      size: 28,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Choose What Reaches You',
                    style: AppTextStyles.h2.copyWith(
                      color: AppColors.surface,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: [
                      _HeroStatChip(label: 'Unread', value: '$unreadCount'),
                      _HeroStatChip(label: 'Enabled', value: '$enabledCount'),
                      _HeroStatChip(
                        label: 'Available',
                        value: '${defaultNotificationPreferences.length}',
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            _InboxSection(notificationsAsync: notificationsAsync),
            const SizedBox(height: 20),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: () {
                  ref
                      .read(notificationPreferencesProvider.notifier)
                      .resetDefaults();
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Notification preferences reset'),
                    ),
                  );
                },
                icon: const Icon(Icons.refresh_outlined, size: 18),
                label: const Text('Reset to defaults'),
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.primary,
                  textStyle: AppTextStyles.buttonSmall.copyWith(
                    color: AppColors.primary,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            for (final section in notificationPreferenceGroups) ...[
              _NotificationSectionCard(
                section: section,
                values: preferences,
                onChanged: (key, value) {
                  ref
                      .read(notificationPreferencesProvider.notifier)
                      .updatePreference(key, value);
                },
              ),
              if (section != notificationPreferenceGroups.last)
                const SizedBox(height: 14),
            ],
          ],
        ),
      ),
    );
  }
}

class _InboxSection extends ConsumerWidget {
  final AsyncValue<List<AppNotificationItem>> notificationsAsync;

  const _InboxSection({required this.notificationsAsync});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 10),
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Recent Notifications',
                      style: AppTextStyles.h5.copyWith(
                        color: AppColors.primary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Live in-app alerts based on your clusters, payments, and order activity.',
                      style: AppTextStyles.bodySmall.copyWith(
                        color: AppColors.textSecondary,
                        height: 1.5,
                      ),
                    ),
                  ],
                ),
              ),
              TextButton(
                onPressed: () =>
                    ref.read(inAppNotificationsProvider.notifier).markAllRead(),
                child: const Text('Mark all read'),
              ),
            ],
          ),
          const SizedBox(height: 12),
          notificationsAsync.when(
            data: (items) {
              if (items.isEmpty) {
                return Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: AppColors.inputBackground,
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: Column(
                    children: [
                      const Icon(
                        Icons.notifications_none_outlined,
                        color: AppColors.primary,
                        size: 28,
                      ),
                      const SizedBox(height: 10),
                      Text(
                        'No notifications right now',
                        style: AppTextStyles.body.copyWith(
                          color: AppColors.primary,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'When your clusters, voting, payments, or deliveries change, alerts will appear here.',
                        textAlign: TextAlign.center,
                        style: AppTextStyles.bodySmall.copyWith(
                          color: AppColors.textSecondary,
                          height: 1.5,
                        ),
                      ),
                    ],
                  ),
                );
              }

              final visibleItems = items.take(10).toList();
              return Column(
                children: [
                  for (final item in visibleItems) ...[
                    _NotificationFeedTile(item: item),
                    if (item != visibleItems.last)
                      const Divider(color: AppColors.divider, height: 1),
                  ],
                ],
              );
            },
            loading: () => const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(
                child: CircularProgressIndicator(color: AppColors.primary),
              ),
            ),
            error: (error, _) => Container(
              width: double.infinity,
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: AppColors.errorLight,
                borderRadius: BorderRadius.circular(18),
              ),
              child: Text(
                error.toString(),
                style: AppTextStyles.bodySmall.copyWith(
                  color: AppColors.error,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _NotificationFeedTile extends ConsumerWidget {
  final AppNotificationItem item;

  const _NotificationFeedTile({required this.item});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final icon = _iconForType(item.type);
    final iconBg = item.isRead ? AppColors.inputBackground : AppColors.primary;
    final iconColor = item.isRead ? AppColors.primary : AppColors.surface;

    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: () async {
        await ref.read(inAppNotificationsProvider.notifier).markRead(item.id);
        if (context.mounted && item.route != null) {
          context.push(item.route!);
        }
      },
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: iconBg,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(icon, color: iconColor, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          item.title,
                          style: AppTextStyles.body.copyWith(
                            color: AppColors.textPrimary,
                            fontWeight:
                                item.isRead ? FontWeight.w600 : FontWeight.w700,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        _timeLabel(item.createdAt),
                        style: AppTextStyles.caption.copyWith(
                          color: AppColors.textMuted,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    item.body,
                    style: AppTextStyles.bodySmall.copyWith(
                      color: AppColors.textSecondary,
                      height: 1.5,
                    ),
                  ),
                  if (!item.isRead) ...[
                    const SizedBox(height: 8),
                    Container(
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(
                        color: AppColors.primary,
                        shape: BoxShape.circle,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  IconData _iconForType(String type) {
    switch (type) {
      case 'cluster_formed':
        return Icons.groups_2_outlined;
      case 'voting_started':
      case 'voting_reminder':
        return Icons.how_to_vote_outlined;
      case 'payment_pending':
      case 'payment_reminder':
      case 'payment_confirmed':
        return Icons.account_balance_wallet_outlined;
      case 'delivery_update':
      case 'delivery_completed':
        return Icons.local_shipping_outlined;
      case 'order_processing':
      case 'order_rejected':
      case 'order_failed':
        return Icons.receipt_long_outlined;
      case 'account_update':
        return Icons.manage_accounts_outlined;
      case 'product_announcement':
        return Icons.campaign_outlined;
      default:
        return Icons.notifications_none_outlined;
    }
  }

  String _timeLabel(DateTime createdAt) {
    final diff = DateTime.now().difference(createdAt);
    if (diff.inMinutes < 1) return 'Now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m';
    if (diff.inHours < 24) return '${diff.inHours}h';
    if (diff.inDays < 7) return '${diff.inDays}d';
    return DateFormat('d MMM').format(createdAt);
  }
}

class _HeroStatChip extends StatelessWidget {
  final String label;
  final String value;

  const _HeroStatChip({
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.surface.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            value,
            style: AppTextStyles.h5.copyWith(
              color: AppColors.surface,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(width: 8),
          Text(
            label,
            style: AppTextStyles.caption.copyWith(
              color: AppColors.textOnPrimaryMuted,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _NotificationSectionCard extends StatelessWidget {
  final NotificationPreferenceGroup section;
  final Map<String, bool> values;
  final void Function(String key, bool value) onChanged;

  const _NotificationSectionCard({
    required this.section,
    required this.values,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              section.title,
              style: AppTextStyles.h5.copyWith(
                color: AppColors.primary,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              section.description,
              style: AppTextStyles.bodySmall.copyWith(
                color: AppColors.textSecondary,
                height: 1.55,
              ),
            ),
            const SizedBox(height: 12),
            for (final item in section.items) ...[
              _NotificationToggleTile(
                label: item.label,
                subtitle: item.subtitle,
                value: values[item.keyName] ?? item.defaultEnabled,
                onChanged: (nextValue) => onChanged(item.keyName, nextValue),
              ),
              if (item != section.items.last)
                const Divider(color: AppColors.divider, height: 1),
            ],
          ],
        ),
      ),
    );
  }
}

class _NotificationToggleTile extends StatelessWidget {
  final String label;
  final String subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;

  const _NotificationToggleTile({
    required this.label,
    required this.subtitle,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return SwitchListTile(
      value: value,
      onChanged: onChanged,
      contentPadding: const EdgeInsets.symmetric(vertical: 4),
      activeColor: AppColors.surface,
      activeTrackColor: AppColors.primary,
      inactiveThumbColor: AppColors.surface,
      inactiveTrackColor: AppColors.surfaceDim,
      title: Text(
        label,
        style: AppTextStyles.body.copyWith(
          color: AppColors.textPrimary,
          fontWeight: FontWeight.w600,
        ),
      ),
      subtitle: Text(
        subtitle,
        style: AppTextStyles.bodySmall.copyWith(
          color: AppColors.textSecondary,
          height: 1.45,
        ),
      ),
    );
  }
}
