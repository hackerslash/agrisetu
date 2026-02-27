import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../shared/widgets/status_badge.dart';
import '../../../shared/widgets/progress_bar.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/order_model.dart';
import '../../../core/providers/auth_provider.dart';

final availableClustersProvider =
    FutureProvider.family<List<Cluster>, String?>((ref, crop) async {
  final api = ref.read(apiClientProvider);
  final data = await api.getClusters(crop: crop);
  return data.map((e) => Cluster.fromJson(e as Map<String, dynamic>)).toList();
});

class AvailableClustersScreen extends ConsumerWidget {
  final String? cropName;

  const AvailableClustersScreen({super.key, this.cropName});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final farmer = ref.watch(currentFarmerProvider);
    final clustersAsync = ref.watch(availableClustersProvider(cropName));

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Column(
        children: [
          // Header
          Container(
            color: AppColors.primary,
            padding: EdgeInsets.only(
              top: MediaQuery.of(context).padding.top,
              left: 24,
              right: 24,
              bottom: 20,
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const SizedBox(width: 24),
                Text(
                  'Clusters',
                  style: AppTextStyles.h3.copyWith(color: AppColors.surface),
                ),
                const SizedBox(width: 24),
              ],
            ),
          ),

          Expanded(
            child: clustersAsync.when(
              data: (clusters) {
                if (clusters.isEmpty) {
                  return _EmptyState(
                    onCreateOrder: () => context.push('/orders/new'),
                  );
                }

                return RefreshIndicator(
                  color: AppColors.primary,
                  onRefresh: () async => ref.invalidate(availableClustersProvider(cropName)),
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 80),
                    children: [
                      // Location row
                      if (farmer?.district != null)
                        Row(
                          children: [
                            const Icon(Icons.location_on,
                                size: 16, color: AppColors.primary),
                            const SizedBox(width: 4),
                            Text(
                              farmer!.district!,
                              style: AppTextStyles.label
                                  .copyWith(color: AppColors.primary),
                            ),
                          ],
                        ),
                      const SizedBox(height: 4),
                      Text(
                        '${clusters.length} active cluster${clusters.length != 1 ? 's' : ''} in your area',
                        style: AppTextStyles.bodySmall,
                      ),
                      const SizedBox(height: 16),

                      ...clusters
                          .map((c) => Padding(
                                padding: const EdgeInsets.only(bottom: 12),
                                child: _ClusterCard(cluster: c),
                              ))
                          .toList(),

                      // New order button
                      const SizedBox(height: 8),
                      OutlinedButton.icon(
                        onPressed: () => context.push('/orders/new'),
                        icon: const Icon(Icons.add, size: 20),
                        label: const Text('Start a New Order'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.primary,
                          side: const BorderSide(
                              color: AppColors.primary, width: 1.5),
                          shape: const StadiumBorder(),
                          minimumSize: const Size(double.infinity, 52),
                          textStyle: AppTextStyles.buttonSmall
                              .copyWith(color: AppColors.primary),
                        ),
                      ),
                    ],
                  ),
                );
              },
              loading: () => const Center(
                child: CircularProgressIndicator(color: AppColors.primary),
              ),
              error: (e, _) => Center(child: Text(e.toString())),
            ),
          ),
        ],
      ),
    );
  }
}

class _ClusterCard extends StatelessWidget {
  final Cluster cluster;

  const _ClusterCard({required this.cluster});

  @override
  Widget build(BuildContext context) {
    final isVoting = cluster.status == ClusterStatus.voting;
    final isPayment = cluster.status == ClusterStatus.payment;

    return GestureDetector(
      onTap: () => context.push('/clusters/${cluster.id}'),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.inputBackground,
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
                      Text(cluster.cropName, style: AppTextStyles.h5),
                      Text(
                        cluster.district ?? '',
                        style: AppTextStyles.caption,
                      ),
                    ],
                  ),
                ),
                StatusBadge.fromClusterStatus(cluster.status),
              ],
            ),
            const SizedBox(height: 14),

            Row(
              children: [
                _StatPill(
                  label: 'Farmers',
                  value: cluster.membersCount.toString(),
                ),
                const SizedBox(width: 8),
                _StatPill(
                  label: 'Collected',
                  value:
                      '${cluster.currentQuantity.toStringAsFixed(0)} ${cluster.unit}',
                ),
                const SizedBox(width: 8),
                _StatPill(
                  label: 'Target',
                  value:
                      '${cluster.targetQuantity.toStringAsFixed(0)} ${cluster.unit}',
                ),
              ],
            ),
            const SizedBox(height: 12),

            ClusterProgressBar(value: cluster.fillPercent),
            const SizedBox(height: 6),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '${(cluster.fillPercent * 100).toStringAsFixed(0)}% filled',
                  style: AppTextStyles.caption,
                ),
                Text(
                  '${(cluster.targetQuantity - cluster.currentQuantity).clamp(0, cluster.targetQuantity).toStringAsFixed(0)} ${cluster.unit} remaining',
                  style: AppTextStyles.caption.copyWith(color: AppColors.primary),
                ),
              ],
            ),

            const SizedBox(height: 14),

            SizedBox(
              width: double.infinity,
              height: 44,
              child: ElevatedButton(
                onPressed: () => context.push('/clusters/${cluster.id}'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: isVoting || isPayment
                      ? AppColors.primary
                      : AppColors.primary.withOpacity(0.8),
                  shape: const StadiumBorder(),
                  elevation: 0,
                ),
                child: Text(
                  isVoting
                      ? 'Vote for Vendor'
                      : isPayment
                          ? 'Pay Now'
                          : 'View Cluster',
                  style: AppTextStyles.buttonSmall,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatPill extends StatelessWidget {
  final String label;
  final String value;

  const _StatPill({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        children: [
          Text(value,
              style: AppTextStyles.label
                  .copyWith(color: AppColors.primary, fontSize: 13)),
          Text(label, style: AppTextStyles.caption.copyWith(fontSize: 10)),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final VoidCallback onCreateOrder;

  const _EmptyState({required this.onCreateOrder});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              color: AppColors.inputBackground,
              borderRadius: BorderRadius.circular(20),
            ),
            child: const Icon(Icons.people_outline,
                size: 40, color: AppColors.textMuted),
          ),
          const SizedBox(height: 20),
          Text('No clusters yet',
              style: AppTextStyles.h3
                  .copyWith(color: AppColors.textPrimary)),
          const SizedBox(height: 12),
          Text(
            'Place an order first. AgriSetu will automatically group you with nearby farmers who need the same input.',
            style: AppTextStyles.body.copyWith(color: AppColors.textSecondary),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 32),

          // How it works card
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.inputBackground,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('How Clusters Work',
                    style: AppTextStyles.h5),
                const SizedBox(height: 12),
                _Step(
                    num: 1, text: 'You place an order for a crop input'),
                const SizedBox(height: 8),
                _Step(
                    num: 2,
                    text: 'AgriSetu groups you with nearby farmers'),
                const SizedBox(height: 8),
                _Step(
                    num: 3,
                    text: 'You vote on the best vendor bid together'),
              ],
            ),
          ),
          const SizedBox(height: 24),

          SizedBox(
            width: double.infinity,
            height: 52,
            child: ElevatedButton.icon(
              onPressed: onCreateOrder,
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
          GestureDetector(
            onTap: () => context.push('/clusters-empty'),
            child: Text(
              'Learn how clusters work →',
              style: AppTextStyles.bodySmall
                  .copyWith(color: AppColors.primary),
              textAlign: TextAlign.center,
            ),
          ),
        ],
      ),
    );
  }
}

class _Step extends StatelessWidget {
  final int num;
  final String text;

  const _Step({required this.num, required this.text});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 24,
          height: 24,
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
        const SizedBox(width: 10),
        Expanded(child: Text(text, style: AppTextStyles.body)),
      ],
    );
  }
}
