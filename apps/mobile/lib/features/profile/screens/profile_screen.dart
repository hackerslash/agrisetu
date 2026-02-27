import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../core/providers/auth_provider.dart';
import '../../../core/models/farmer_model.dart';
import '../../home/screens/home_screen.dart' show homeDashboardProvider;

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final farmer = ref.watch(currentFarmerProvider);
    final dashboardAsync = ref.watch(homeDashboardProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: Container(
              color: AppColors.primary,
              padding: EdgeInsets.only(
                top: MediaQuery.of(context).padding.top + 16,
                left: 24,
                right: 24,
                bottom: 32,
              ),
              child: Column(
                children: [
                  Row(
                    children: [
                      GestureDetector(
                        onTap: () => context.pop(),
                        child: const Icon(Icons.arrow_back,
                            color: AppColors.surface),
                      ),
                      const Spacer(),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Container(
                    width: 72,
                    height: 72,
                    decoration: const BoxDecoration(
                      color: AppColors.surface,
                      shape: BoxShape.circle,
                    ),
                    child: Center(
                      child: Text(
                        (farmer?.name?.isNotEmpty == true)
                            ? farmer!.name![0].toUpperCase()
                            : 'F',
                        style: AppTextStyles.h1
                            .copyWith(color: AppColors.primary),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    farmer?.name ?? 'Farmer',
                    style:
                        AppTextStyles.h3.copyWith(color: AppColors.surface),
                  ),
                  if (farmer?.district != null)
                    Text(
                      '${farmer!.district} District, ${farmer.state ?? ''}',
                      style: AppTextStyles.bodySmall.copyWith(
                          color: AppColors.textOnPrimaryMuted),
                    ),
                ],
              ),
            ),
          ),

          SliverPadding(
            padding: const EdgeInsets.all(20),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                // Profile completeness
                if (farmer != null) ...[
                  _ProfileCompletenessCard(farmer: farmer),
                  const SizedBox(height: 16),
                ],

                // Farm Details
                _SectionCard(
                  title: 'Farm Details',
                  children: [
                    _InfoRow(
                      icon: Icons.landscape_outlined,
                      label: 'Land Area',
                      value: farmer?.landArea != null
                          ? '${farmer!.landArea!.toStringAsFixed(1)} acres'
                          : 'Not set',
                    ),
                    const Divider(height: 1),
                    _InfoRow(
                      icon: Icons.eco_outlined,
                      label: 'Crops Grown',
                      value: farmer?.cropsGrown.isNotEmpty == true
                          ? farmer!.cropsGrown.join(', ')
                          : 'Not set',
                    ),
                    const Divider(height: 1),
                    _InfoRow(
                      icon: Icons.location_on_outlined,
                      label: 'Village',
                      value: farmer?.village ?? 'Not set',
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // Savings — from /farmer/dashboard
                _SectionCard(
                  title: 'Savings',
                  children: [
                    dashboardAsync.when(
                      data: (d) {
                        final stats =
                            d['stats'] as Map<String, dynamic>;
                        final totalSaved = stats['totalSaved'] as int? ?? 0;
                        final ordersPlaced =
                            stats['ordersPlaced'] as int? ?? 0;
                        final co2Saved = stats['co2Saved'] as int? ?? 0;
                        return Row(
                          children: [
                            _SavingsStat(
                              label: 'Total Saved',
                              value:
                                  '₹${NumberFormat('#,###').format(totalSaved)}',
                            ),
                            _SavingsStat(
                                label: 'Orders',
                                value: ordersPlaced.toString()),
                            _SavingsStat(
                                label: 'CO₂ Saved',
                                value: '${co2Saved}kg'),
                          ],
                        );
                      },
                      loading: () => const Padding(
                        padding: EdgeInsets.all(16),
                        child: Center(
                          child: SizedBox(
                            height: 16,
                            width: 16,
                            child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: AppColors.primary),
                          ),
                        ),
                      ),
                      error: (_, __) => Row(
                        children: const [
                          _SavingsStat(label: 'Total Saved', value: '—'),
                          _SavingsStat(label: 'Orders', value: '—'),
                          _SavingsStat(label: 'CO₂ Saved', value: '—'),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // Payment
                _SectionCard(
                  title: 'Payment',
                  children: [
                    _InfoRow(
                      icon: Icons.account_balance_wallet_outlined,
                      label: 'UPI ID',
                      value: farmer?.upiId ?? 'Not set',
                    ),
                    const Divider(height: 1),
                    _InfoRow(
                      icon: Icons.phone_android_outlined,
                      label: 'Phone',
                      value: farmer?.phone ?? '',
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // Settings
                _SectionCard(
                  title: 'Settings',
                  children: [
                    _ActionRow(
                      icon: Icons.language_outlined,
                      label: 'Language',
                      value: farmer?.language.toUpperCase() ?? 'EN',
                      onTap: () {},
                    ),
                    const Divider(height: 1),
                    _ActionRow(
                      icon: Icons.notifications_outlined,
                      label: 'Notifications',
                      onTap: () {},
                    ),
                    const Divider(height: 1),
                    _ActionRow(
                      icon: Icons.help_outline,
                      label: 'Help & Support',
                      onTap: () {},
                    ),
                  ],
                ),
                const SizedBox(height: 24),

                // Edit profile button
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton.icon(
                    onPressed: () => context.push('/onboarding'),
                    icon: const Icon(Icons.edit_outlined, size: 18),
                    label: const Text('Edit Profile'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      shape: const StadiumBorder(),
                      elevation: 0,
                      textStyle: AppTextStyles.button,
                    ),
                  ),
                ),
                const SizedBox(height: 12),

                // Logout button
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: OutlinedButton.icon(
                    onPressed: () async {
                      await ref.read(authProvider.notifier).logout();
                      if (context.mounted) context.go('/landing');
                    },
                    icon: const Icon(Icons.logout_outlined, size: 18),
                    label: const Text('Log Out'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.textSecondary,
                      side: const BorderSide(
                          color: AppColors.inputBackground, width: 1.5),
                      shape: const StadiumBorder(),
                    ),
                  ),
                ),
                const SizedBox(height: 80),
              ]),
            ),
          ),
        ],
      ),
    );
  }
}

class _ProfileCompletenessCard extends StatelessWidget {
  final Farmer farmer;

  const _ProfileCompletenessCard({required this.farmer});

  @override
  Widget build(BuildContext context) {
    final pct = farmer.profileCompleteness;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.inputBackground,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: AppColors.primary.withOpacity(0.12),
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Text(
                '$pct%',
                style: AppTextStyles.caption.copyWith(
                  color: AppColors.primary,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  pct >= 80 ? 'Profile Complete' : 'Complete your profile',
                  style: AppTextStyles.label,
                ),
                const SizedBox(height: 6),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: pct / 100,
                    backgroundColor: AppColors.border,
                    valueColor: const AlwaysStoppedAnimation(AppColors.primary),
                    minHeight: 6,
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

class _SectionCard extends StatelessWidget {
  final String title;
  final List<Widget> children;

  const _SectionCard({required this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: AppTextStyles.h5),
        const SizedBox(height: 10),
        Container(
          decoration: BoxDecoration(
            color: AppColors.cardBackground,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(children: children),
        ),
      ],
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _InfoRow(
      {required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Icon(icon, size: 20, color: AppColors.primary),
          const SizedBox(width: 12),
          Expanded(
              child: Text(label, style: AppTextStyles.body)),
          Text(value,
              style: AppTextStyles.body
                  .copyWith(color: AppColors.textMuted)),
        ],
      ),
    );
  }
}

class _ActionRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String? value;
  final VoidCallback onTap;

  const _ActionRow({
    required this.icon,
    required this.label,
    this.value,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Icon(icon, size: 20, color: AppColors.primary),
            const SizedBox(width: 12),
            Expanded(child: Text(label, style: AppTextStyles.body)),
            if (value != null)
              Text(value!,
                  style: AppTextStyles.body
                      .copyWith(color: AppColors.textMuted)),
            const SizedBox(width: 4),
            const Icon(Icons.chevron_right,
                size: 18, color: AppColors.textMuted),
          ],
        ),
      ),
    );
  }
}

class _SavingsStat extends StatelessWidget {
  final String label;
  final String value;

  const _SavingsStat({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: AppTextStyles.h5.copyWith(color: AppColors.primary),
          ),
          Text(label, style: AppTextStyles.caption),
        ],
      ),
    );
  }
}
