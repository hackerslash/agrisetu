import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../shared/widgets/status_badge.dart';
import '../../../shared/widgets/progress_bar.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/order_model.dart';
import '../../../core/providers/auth_provider.dart';

typedef ClusterQuery = ({String? cropName, String? orderId});

final availableClustersProvider = FutureProvider.autoDispose
    .family<List<Cluster>, ClusterQuery>((ref, query) async {
  final timer = Timer.periodic(const Duration(seconds: 8), (_) {
    ref.invalidateSelf();
  });
  ref.onDispose(timer.cancel);

  final api = ref.read(apiClientProvider);
  final clusters = query.orderId != null
      ? (await api.getOrderClusterOptions(query.orderId!))
          .map((e) => Cluster.fromJson(e as Map<String, dynamic>))
          .toList()
      : (await api.getClusters(crop: query.cropName))
          .map((e) => Cluster.fromJson(e as Map<String, dynamic>))
          .toList();

  final seen = <String>{};
  return clusters.where((c) => seen.add(c.id)).toList();
});

class AvailableClustersScreen extends ConsumerStatefulWidget {
  final String? cropName;
  final String? orderId;

  const AvailableClustersScreen({
    super.key,
    this.cropName,
    this.orderId,
  });

  @override
  ConsumerState<AvailableClustersScreen> createState() =>
      _AvailableClustersScreenState();
}

class _AvailableClustersScreenState
    extends ConsumerState<AvailableClustersScreen> {
  String? _joiningClusterId;
  bool _isCreatingNew = false;

  Future<void> _joinCluster(String clusterId) async {
    final orderId = widget.orderId;
    if (orderId == null) {
      context.push('/clusters/$clusterId');
      return;
    }

    setState(() => _joiningClusterId = clusterId);
    try {
      final api = ref.read(apiClientProvider);
      final assigned =
          await api.assignOrderToCluster(orderId, clusterId: clusterId);
      final resolvedClusterId =
          ((assigned['clusterMember'] as Map<String, dynamic>?)?['cluster']
              as Map<String, dynamic>?)?['id'] as String?;

      if (!mounted) return;
      if (resolvedClusterId != null) {
        context.go('/clusters/$resolvedClusterId');
      } else {
        context.go('/clusters/$clusterId');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _joiningClusterId = null);
    }
  }

  Future<void> _createNewCluster() async {
    final orderId = widget.orderId;
    if (orderId == null) {
      context.push('/orders/new');
      return;
    }

    setState(() => _isCreatingNew = true);
    try {
      final api = ref.read(apiClientProvider);
      final assigned = await api.assignOrderToCluster(orderId, createNew: true);
      final clusterId =
          ((assigned['clusterMember'] as Map<String, dynamic>?)?['cluster']
              as Map<String, dynamic>?)?['id'] as String?;
      if (!mounted) return;
      if (clusterId != null) {
        context.go('/clusters/$clusterId');
      } else {
        context.go('/clusters');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _isCreatingNew = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final farmer = ref.watch(currentFarmerProvider);
    final query = (cropName: widget.cropName, orderId: widget.orderId);
    final clustersAsync = ref.watch(availableClustersProvider(query));
    final selectionMode = widget.orderId != null;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Column(
        children: [
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
                  selectionMode ? 'Choose Cluster' : 'Clusters',
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
                  if (selectionMode) {
                    return _SelectionEmptyState(
                      onCreateNew: _createNewCluster,
                      isCreating: _isCreatingNew,
                    );
                  }
                  return _EmptyState(
                    onCreateOrder: () => context.push('/orders/new'),
                  );
                }

                return RefreshIndicator(
                  color: AppColors.primary,
                  onRefresh: () async =>
                      ref.invalidate(availableClustersProvider(query)),
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 80),
                    children: [
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
                        selectionMode
                            ? 'Choose one of ${clusters.length} matching cluster${clusters.length != 1 ? 's' : ''}'
                            : '${clusters.length} active cluster${clusters.length != 1 ? 's' : ''} in your area',
                        style: AppTextStyles.bodySmall,
                      ),
                      const SizedBox(height: 16),
                      ...clusters
                          .map(
                            (c) => Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: _ClusterCard(
                                cluster: c,
                                selectionMode: selectionMode,
                                currentFarmerId: farmer?.id,
                                isBusy:
                                    _joiningClusterId == c.id || _isCreatingNew,
                                onPrimaryTap: () => _joinCluster(c.id),
                              ),
                            ),
                          )
                          .toList(),
                      const SizedBox(height: 8),
                      SizedBox(
                        width: double.infinity,
                        height: 52,
                        child: OutlinedButton.icon(
                          onPressed: _joiningClusterId != null || _isCreatingNew
                              ? null
                              : selectionMode
                                  ? _createNewCluster
                                  : () => context.push('/orders/new'),
                          icon: _isCreatingNew
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child:
                                      CircularProgressIndicator(strokeWidth: 2),
                                )
                              : const Icon(Icons.add, size: 20),
                          label: Text(
                            selectionMode
                                ? 'Create New Cluster'
                                : 'Start a New Order',
                          ),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: AppColors.primary,
                            side: const BorderSide(
                                color: AppColors.primary, width: 1.5),
                            shape: const StadiumBorder(),
                            textStyle: AppTextStyles.buttonSmall
                                .copyWith(color: AppColors.primary),
                          ),
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
  final bool selectionMode;
  final String? currentFarmerId;
  final bool isBusy;
  final VoidCallback onPrimaryTap;

  const _ClusterCard({
    required this.cluster,
    required this.selectionMode,
    required this.currentFarmerId,
    required this.isBusy,
    required this.onPrimaryTap,
  });

  @override
  Widget build(BuildContext context) {
    final isVoting = cluster.status == ClusterStatus.voting;
    final isPayment = cluster.status == ClusterStatus.payment;
    final currentFarmerRows =
        cluster.members.where((m) => m.farmerId == currentFarmerId).toList();
    final currentFarmerPaid = currentFarmerRows.isNotEmpty &&
        currentFarmerRows.every((m) => m.hasPaid);

    return GestureDetector(
      onTap:
          selectionMode ? null : () => context.push('/clusters/${cluster.id}'),
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
                  style:
                      AppTextStyles.caption.copyWith(color: AppColors.primary),
                ),
              ],
            ),
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              height: 44,
              child: ElevatedButton(
                onPressed: isBusy
                    ? null
                    : selectionMode
                        ? onPrimaryTap
                        : () => context.push('/clusters/${cluster.id}'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: isVoting || isPayment
                      ? AppColors.primary
                      : AppColors.primary.withOpacity(0.8),
                  shape: const StadiumBorder(),
                  elevation: 0,
                ),
                child: isBusy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : Text(
                        selectionMode
                            ? 'Join This Cluster'
                            : isVoting
                                ? 'Vote for Vendor'
                                : isPayment
                                    ? (currentFarmerPaid
                                        ? 'Waiting for Others'
                                        : 'Pay Now')
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

class _SelectionEmptyState extends StatelessWidget {
  final VoidCallback onCreateNew;
  final bool isCreating;

  const _SelectionEmptyState({
    required this.onCreateNew,
    required this.isCreating,
  });

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
            child: const Icon(Icons.hub_outlined,
                size: 40, color: AppColors.textMuted),
          ),
          const SizedBox(height: 20),
          Text('No matching cluster found',
              style: AppTextStyles.h3.copyWith(color: AppColors.textPrimary)),
          const SizedBox(height: 10),
          Text(
            'No active FORMING/VOTING cluster matches your order right now. Create a new cluster to get started.',
            style: AppTextStyles.body.copyWith(color: AppColors.textSecondary),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            height: 52,
            child: ElevatedButton.icon(
              onPressed: isCreating ? null : onCreateNew,
              icon: isCreating
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.add, size: 20),
              label: Text(isCreating ? 'Creating…' : 'Create New Cluster'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                shape: const StadiumBorder(),
                elevation: 0,
                textStyle: AppTextStyles.button,
              ),
            ),
          ),
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
              style: AppTextStyles.h3.copyWith(color: AppColors.textPrimary)),
          const SizedBox(height: 12),
          Text(
            'Place an order first. AgriSetu will help you join nearby farmers with similar demand.',
            style: AppTextStyles.body.copyWith(color: AppColors.textSecondary),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 32),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.inputBackground,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('How Clusters Work', style: AppTextStyles.h5),
                const SizedBox(height: 12),
                _Step(num: 1, text: 'You place an order for a crop input'),
                const SizedBox(height: 8),
                _Step(num: 2, text: 'You choose to join an active cluster'),
                const SizedBox(height: 8),
                _Step(num: 3, text: 'Farmers vote on the best vendor bid'),
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
              style: AppTextStyles.bodySmall.copyWith(color: AppColors.primary),
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
