import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../core/providers/auth_provider.dart';
import '../../../core/models/farmer_model.dart';
import '../../../core/utils/avatar_picker.dart';
import '../../../core/providers/locale_provider.dart';
import '../../../core/constants/app_constants.dart';
import '../../../l10n/app_localizations.dart';
import '../../home/screens/home_screen.dart' show homeDashboardProvider;

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  bool _isUploadingAvatar = false;

  Future<void> _pickAvatar() async {
    try {
      if (_isUploadingAvatar) return;

      final dataUrl = await pickAvatarDataUrl();
      if (dataUrl == null || dataUrl.isEmpty) return;

      setState(() => _isUploadingAvatar = true);
      await ref.read(authProvider.notifier).uploadAvatarDataUrl(dataUrl);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Avatar updated')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())),
      );
    } finally {
      if (mounted && _isUploadingAvatar) {
        setState(() => _isUploadingAvatar = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final farmer = ref.watch(currentFarmerProvider);
    final dashboardAsync = ref.watch(homeDashboardProvider);
    final avatarUrl = (farmer?.avatarUrl ?? '').trim();
    final villageDistrict = [
      farmer?.village?.trim(),
      if ((farmer?.district ?? '').trim().isNotEmpty)
        '${farmer!.district!.trim()} Dist.',
    ].whereType<String>().where((s) => s.isNotEmpty).join(', ');
    final districtState = [
      if ((farmer?.district ?? '').trim().isNotEmpty)
        '${farmer!.district!.trim()} District',
      farmer?.state?.trim(),
    ].whereType<String>().where((s) => s.isNotEmpty).join(', ');
    final hasUpiId = (farmer?.upiId ?? '').trim().isNotEmpty;
    final profileCompleteness = farmer?.profileCompleteness ?? 0;
    final profileHint = hasUpiId
        ? (profileCompleteness >= 100
            ? 'Your profile setup is complete'
            : 'Add more details to complete setup')
        : 'Add UPI ID to complete setup';

    return Scaffold(
      backgroundColor: AppColors.surface,
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: Container(
              color: AppColors.primary,
              padding: EdgeInsets.only(
                top: MediaQuery.of(context).padding.top + 12,
                left: 24,
                right: 24,
                bottom: 28,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Row(
                    children: [
                      InkWell(
                        borderRadius: BorderRadius.circular(20),
                        onTap: () {
                          if (context.canPop()) {
                            context.pop();
                          } else {
                            context.go('/home');
                          }
                        },
                        child: Row(
                          children: [
                            const Icon(
                              Icons.arrow_back,
                              color: AppColors.surface,
                              size: 22,
                            ),
                            const SizedBox(width: 6),
                            Text(
                              'Profile',
                              style: AppTextStyles.h4.copyWith(
                                color: AppColors.surface,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const Spacer(),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Stack(
                    alignment: Alignment.center,
                    children: [
                      GestureDetector(
                        onTap: farmer == null ? null : _pickAvatar,
                        child: Container(
                          width: 72,
                          height: 72,
                          decoration: const BoxDecoration(
                            color: AppColors.surface,
                            shape: BoxShape.circle,
                          ),
                          child: ClipOval(
                            child: avatarUrl.isNotEmpty
                                ? Image.network(
                                    avatarUrl,
                                    width: 72,
                                    height: 72,
                                    fit: BoxFit.cover,
                                    errorBuilder: (_, __, ___) =>
                                        _buildAvatarFallback(farmer),
                                  )
                                : _buildAvatarFallback(farmer),
                          ),
                        ),
                      ),
                      if (farmer != null && !_isUploadingAvatar)
                        Positioned(
                          right: 0,
                          bottom: 0,
                          child: GestureDetector(
                            onTap: _pickAvatar,
                            child: Container(
                              width: 24,
                              height: 24,
                              decoration: BoxDecoration(
                                color: AppColors.primary,
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: AppColors.surface,
                                  width: 1.5,
                                ),
                              ),
                              child: const Icon(
                                Icons.edit,
                                size: 13,
                                color: AppColors.surface,
                              ),
                            ),
                          ),
                        ),
                      if (_isUploadingAvatar)
                        const Positioned.fill(
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: Color(0x66000000),
                              shape: BoxShape.circle,
                            ),
                            child: Center(
                              child: SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: AppColors.surface,
                                ),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Text(
                    farmer?.name ?? 'Farmer',
                    style: AppTextStyles.h3.copyWith(
                      color: AppColors.surface,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  if (districtState.isNotEmpty)
                    Text(
                      districtState,
                      style: AppTextStyles.bodySmall
                          .copyWith(color: AppColors.textOnPrimaryMuted),
                    ),
                ],
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                _ProfileCompletenessCard(
                  percent: profileCompleteness,
                  subtitle: profileHint,
                ),
                const SizedBox(height: 20),
                const _SectionTitle(title: 'Farm Details'),
                const SizedBox(height: 12),
                _ProfileCard(
                  children: [
                    _ProfileInfoRow(
                      icon: Icons.location_on_outlined,
                      label: 'Village / District',
                      value:
                          villageDistrict.isEmpty ? 'Not set' : villageDistrict,
                    ),
                    _ProfileInfoRow(
                      icon: Icons.layers_outlined,
                      label: 'Land Area',
                      value: farmer?.landArea != null
                          ? '${farmer!.landArea!.toStringAsFixed(1)} Acres'
                          : 'Not set',
                    ),
                    _ProfileInfoRow(
                      icon: Icons.spa_outlined,
                      label: 'Crops Grown',
                      value: farmer?.cropsGrown.isNotEmpty == true
                          ? farmer!.cropsGrown.join(', ')
                          : 'Not set',
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                const _SectionTitle(title: 'Your Impact'),
                const SizedBox(height: 12),
                dashboardAsync.when(
                  data: (dashboard) {
                    final stats = dashboard['stats'] as Map<String, dynamic>;
                    final totalSaved = stats['totalSaved'] as int? ?? 0;
                    final ordersPlaced = stats['ordersPlaced'] as int? ?? 0;
                    return Row(
                      children: [
                        Expanded(
                          child: _ImpactCard(
                            backgroundColor: AppColors.primary,
                            valueColor: AppColors.surface,
                            labelColor: AppColors.textOnPrimaryMuted,
                            value:
                                '₹${NumberFormat('#,###').format(totalSaved)}',
                            label: 'Total Savings',
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _ImpactCard(
                            backgroundColor: AppColors.inputBackground,
                            valueColor: AppColors.primary,
                            labelColor: AppColors.primary,
                            value: ordersPlaced.toString(),
                            label: 'Orders Placed',
                          ),
                        ),
                      ],
                    );
                  },
                  loading: () => const Row(
                    children: [
                      Expanded(child: _ImpactCard.loading()),
                      SizedBox(width: 12),
                      Expanded(child: _ImpactCard.loading()),
                    ],
                  ),
                  error: (_, __) => const Row(
                    children: [
                      Expanded(
                        child: _ImpactCard(
                          backgroundColor: AppColors.primary,
                          valueColor: AppColors.surface,
                          labelColor: AppColors.textOnPrimaryMuted,
                          value: '—',
                          label: 'Total Savings',
                        ),
                      ),
                      SizedBox(width: 12),
                      Expanded(
                        child: _ImpactCard(
                          backgroundColor: AppColors.inputBackground,
                          valueColor: AppColors.primary,
                          labelColor: AppColors.primary,
                          value: '—',
                          label: 'Orders Placed',
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                const _SectionTitle(title: 'Payment & Preferences'),
                const SizedBox(height: 12),
                _ProfileCard(
                  children: [
                    _ProfileInfoRow(
                      icon: Icons.account_balance_wallet_outlined,
                      label: 'UPI ID',
                      value: hasUpiId
                          ? '${farmer!.upiId!.trim()}  ✓ Verified'
                          : 'Not set',
                    ),
                    _SettingsRow(
                      icon: Icons.language_outlined,
                      label: AppLocalizations.of(context)!.profileLanguageLabel,
                      onTap: () => _showLanguagePicker(context, ref),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                const _SectionTitle(title: 'Settings'),
                const SizedBox(height: 12),
                const _ProfileCard(
                  children: [
                    _SettingsRow(
                      icon: Icons.notifications_none_outlined,
                      label: 'Notification Settings',
                    ),
                    _SettingsDivider(),
                    _SettingsRow(
                      icon: Icons.location_on_outlined,
                      label: 'Manage Farm Locations',
                    ),
                    _SettingsDivider(),
                    _SettingsRow(
                      icon: Icons.shield_outlined,
                      label: 'Privacy & Data',
                    ),
                    _SettingsDivider(),
                    _SettingsRow(
                      icon: Icons.chat_bubble_outline,
                      label: 'Help & Support',
                    ),
                    _SettingsDivider(),
                    _SettingsRow(
                      icon: Icons.info_outline,
                      label: 'About AgriSetu',
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton.icon(
                    onPressed: () => context.push('/profile/edit'),
                    icon: const Icon(Icons.edit_outlined, size: 18),
                    label: Text(AppLocalizations.of(context)!.profileEditButton),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      shape: const StadiumBorder(),
                      elevation: 0,
                      textStyle: AppTextStyles.buttonSmall.copyWith(
                        color: AppColors.surface,
                        fontSize: 15,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: FilledButton.icon(
                    onPressed: () async {
                      await ref.read(authProvider.notifier).logout();
                      if (context.mounted) context.go('/landing');
                    },
                    icon: const Icon(Icons.logout_outlined, size: 18),
                    label: Text(AppLocalizations.of(context)!.profileLogoutButton),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.inputBackground,
                      foregroundColor: AppColors.error,
                      shape: const StadiumBorder(),
                      elevation: 0,
                      textStyle: AppTextStyles.buttonSmall.copyWith(
                        color: AppColors.error,
                        fontSize: 15,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 90),
              ]),
            ),
          ),
        ],
      ),
    );
  }

  void _showLanguagePicker(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) {
        final currentLocale = ref.watch(localeProvider).languageCode;
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                AppLocalizations.of(context)!.profileLanguageSelect,
                style: AppTextStyles.h4.copyWith(color: AppColors.primary),
              ),
              const SizedBox(height: 24),
              ...AppConstants.supportedLanguages.map((lang) {
                final isSelected = currentLocale == lang['code'];
                return ListTile(
                  title: Text(
                    lang['label']!,
                    style: AppTextStyles.body.copyWith(
                      color: isSelected ? AppColors.primary : AppColors.textPrimary,
                      fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
                    ),
                  ),
                  trailing: isSelected
                      ? const Icon(Icons.check_circle, color: AppColors.primary)
                      : null,
                  onTap: () async {
                    await ref.read(localeProvider.notifier).setLocale(lang['code']!);
                    if (context.mounted) Navigator.pop(context);
                  },
                );
              }).toList(),
            ],
          ),
        );
      },
    );
  }

  Widget _buildAvatarFallback(Farmer? farmer) {
    return Center(
      child: Text(
        (farmer?.name?.isNotEmpty == true)
            ? farmer!.name![0].toUpperCase()
            : 'F',
        style: AppTextStyles.h1.copyWith(color: AppColors.primary),
      ),
    );
  }
}

class _ProfileCompletenessCard extends StatelessWidget {
  final int percent;
  final String subtitle;

  const _ProfileCompletenessCard({
    required this.percent,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.inputBackground,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: const BoxDecoration(
              color: AppColors.primary,
              shape: BoxShape.circle,
            ),
            child: const Center(
              child: Icon(
                Icons.check_circle_outline,
                color: AppColors.surface,
                size: 20,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Profile $percent% Complete',
                  style: AppTextStyles.label.copyWith(
                    color: AppColors.primary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: AppTextStyles.caption.copyWith(
                    color: AppColors.primary,
                    fontWeight: FontWeight.w400,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String title;

  const _SectionTitle({required this.title});

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: AppTextStyles.h5.copyWith(
        color: AppColors.primary,
        fontWeight: FontWeight.w700,
      ),
    );
  }
}

class _ProfileCard extends StatelessWidget {
  final List<Widget> children;

  const _ProfileCard({required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.inputBackground,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(children: children),
    );
  }
}

class _ProfileInfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _ProfileInfoRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: AppColors.primary),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: AppTextStyles.caption.copyWith(
                    color: AppColors.primary,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  value,
                  style: AppTextStyles.body.copyWith(
                    color: AppColors.primary,
                    fontWeight: FontWeight.w600,
                    height: 1.2,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SettingsDivider extends StatelessWidget {
  const _SettingsDivider();

  @override
  Widget build(BuildContext context) {
    return const Divider(
      color: AppColors.divider,
      height: 1,
      thickness: 1,
      indent: 20,
      endIndent: 20,
    );
  }
}

class _SettingsRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  const _SettingsRow({
    required this.icon,
    required this.label,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap ?? () {},
      behavior: HitTestBehavior.opaque,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        child: Row(
          children: [
            Icon(icon, size: 20, color: AppColors.primary),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                label,
                style: AppTextStyles.body.copyWith(
                  color: AppColors.primary,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
            const SizedBox(width: 4),
            const Icon(
              Icons.chevron_right,
              size: 18,
              color: AppColors.textMuted,
            ),
          ],
        ),
      ),
    );
  }
}

class _ImpactCard extends StatelessWidget {
  final Color backgroundColor;
  final Color valueColor;
  final Color labelColor;
  final bool isLoading;
  final String label;
  final String value;

  const _ImpactCard({
    required this.backgroundColor,
    required this.valueColor,
    required this.labelColor,
    required this.value,
    required this.label,
  }) : isLoading = false;

  const _ImpactCard.loading()
      : backgroundColor = AppColors.inputBackground,
        valueColor = AppColors.transparent,
        labelColor = AppColors.transparent,
        value = '',
        label = '',
        isLoading = true;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(20),
      ),
      child: isLoading
          ? const SizedBox(
              height: 48,
              child: Center(
                child: SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.primary,
                  ),
                ),
              ),
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  value,
                  style: AppTextStyles.h2.copyWith(
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                    color: valueColor,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  label,
                  style: AppTextStyles.caption.copyWith(
                    color: labelColor,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
    );
  }
}
