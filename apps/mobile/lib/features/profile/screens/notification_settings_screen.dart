import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/notification_provider.dart';
import '../../../shared/theme/app_theme.dart';

class NotificationSettingsScreen extends ConsumerWidget {
  const NotificationSettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final preferencesAsync = ref.watch(notificationPreferencesProvider);
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
      body: ListView(
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
    );
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
