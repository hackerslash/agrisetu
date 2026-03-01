import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../shared/widgets/app_header.dart';

class ClusterEmptyScreen extends StatelessWidget {
  const ClusterEmptyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const AppHeader(
        title: 'Your Cluster',
        trailing: Icon(Icons.share_outlined, color: AppColors.surface),
      ),
      body: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const SizedBox(height: 16),
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  color: AppColors.inputBackground,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Icon(Icons.people_outline,
                    size: 40, color: AppColors.primary),
              ),
              const SizedBox(height: 20),
              Text(
                'No Cluster Yet!',
                style: AppTextStyles.h2,
              ),
              const SizedBox(height: 12),
              Text(
                'You\'re not part of any cluster. AgriSetu will automatically group you with farmers in your district when you place an order.',
                style: AppTextStyles.body.copyWith(
                  color: AppColors.textSecondary,
                  height: 1.5,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),

              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: AppColors.inputBackground,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('How It Works', style: AppTextStyles.h5),
                    const SizedBox(height: 16),
                    _Step(
                      num: 1,
                      text: 'Place an order for any crop input',
                      icon: Icons.shopping_cart_outlined,
                    ),
                    const Padding(
                      padding: EdgeInsets.only(left: 12),
                      child: SizedBox(
                          height: 12,
                          child: VerticalDivider(
                              color: AppColors.border, thickness: 2)),
                    ),
                    _Step(
                      num: 2,
                      text: 'Get grouped with nearby farmers',
                      icon: Icons.people_outlined,
                    ),
                    const Padding(
                      padding: EdgeInsets.only(left: 12),
                      child: SizedBox(
                          height: 12,
                          child: VerticalDivider(
                              color: AppColors.border, thickness: 2)),
                    ),
                    _Step(
                      num: 3,
                      text: 'Vote on vendor bids & save together',
                      icon: Icons.how_to_vote_outlined,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 28),

              Text(
                'Place an order to join or start a cluster in your district.',
                style: AppTextStyles.body
                    .copyWith(color: AppColors.primary, fontWeight: FontWeight.w500),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),

              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton.icon(
                  onPressed: () => context.push('/voice'),
                  icon: const Icon(Icons.add, size: 20),
                  label: const Text('Place an Order'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    shape: const StadiumBorder(),
                    elevation: 0,
                    textStyle: AppTextStyles.button,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: OutlinedButton.icon(
                  onPressed: () {},
                  icon: const Icon(Icons.share_outlined, size: 18),
                  label: const Text('Invite Nearby Farmers'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.primary,
                    side: const BorderSide(color: AppColors.primary),
                    shape: const StadiumBorder(),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Step extends StatelessWidget {
  final int num;
  final String text;
  final IconData icon;

  const _Step({required this.num, required this.text, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 28,
          height: 28,
          decoration: const BoxDecoration(
            color: AppColors.primary,
            shape: BoxShape.circle,
          ),
          child: Center(
            child: Text(
              num.toString(),
              style: AppTextStyles.caption.copyWith(
                color: AppColors.surface,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Icon(icon, size: 18, color: AppColors.textMuted),
        const SizedBox(width: 8),
        Expanded(child: Text(text, style: AppTextStyles.body)),
      ],
    );
  }
}
