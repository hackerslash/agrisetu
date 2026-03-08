import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../shared/widgets/progress_bar.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/order_model.dart';
import '../../../core/providers/auth_provider.dart';

final myClustersProvider =
    FutureProvider.autoDispose<List<Cluster>>((ref) async {
  final timer = Timer.periodic(const Duration(seconds: 8), (_) {
    ref.invalidateSelf();
  });
  ref.onDispose(timer.cancel);

  final api = ref.read(apiClientProvider);
  final clusters = await api.getClusters();
  final seen = <String>{};
  return clusters
      .map((e) => Cluster.fromJson(e as Map<String, dynamic>))
      .where((c) => seen.add(c.id))
      .toList();
});

class AvailableClustersScreen extends ConsumerWidget {
  const AvailableClustersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final farmer = ref.watch(currentFarmerProvider);
    final clustersAsync = ref.watch(myClustersProvider);

    return Scaffold(
      backgroundColor: AppColors.surface,
      body: Column(
        children: [
          Container(
            color: AppColors.primary,
            padding: EdgeInsets.only(
              top: MediaQuery.of(context).padding.top + 16,
              left: 24,
              right: 24,
              bottom: 16,
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                GestureDetector(
                  onTap: () => context.canPop()
                      ? context.pop()
                      : context.go('/home'),
                  child: const Icon(
                    Icons.arrow_back,
                    size: 24,
                    color: AppColors.surface,
                  ),
                ),
                Text(
                  'Your Active Clusters',
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
                    onPlaceOrder: () => context.push('/voice'),
                  );
                }

                return RefreshIndicator(
                  color: AppColors.primary,
                  onRefresh: () async => ref.invalidate(myClustersProvider),
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(20, 20, 20, 100),
                    children: [
                      Row(
                        children: [
                          const Icon(
                            Icons.location_on_outlined,
                            size: 18,
                            color: AppColors.primary,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'Your clusters near you',
                            style: AppTextStyles.h4
                                .copyWith(color: AppColors.primary),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      ...clusters.map(
                        (cluster) => Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: _ClusterCard(
                            cluster: cluster,
                            currentFarmerId: farmer?.id,
                            farmerLat: farmer?.latitude,
                            farmerLng: farmer?.longitude,
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
  final String? currentFarmerId;
  final double? farmerLat;
  final double? farmerLng;

  const _ClusterCard({
    required this.cluster,
    required this.currentFarmerId,
    required this.farmerLat,
    required this.farmerLng,
  });

  @override
  Widget build(BuildContext context) {
    final isVoting = cluster.status == ClusterStatus.voting;
    final isPayment = cluster.status == ClusterStatus.payment;
    final isTrackingPhase = cluster.status == ClusterStatus.processing ||
        cluster.status == ClusterStatus.outForDelivery ||
        cluster.status == ClusterStatus.dispatched;
    final currentFarmerRows =
        cluster.members.where((m) => m.farmerId == currentFarmerId).toList();
    final currentFarmerPaid = currentFarmerRows.isNotEmpty &&
        currentFarmerRows.every((m) => m.hasPaid);
    final paidByFarmer = <String, bool>{};
    for (final member in cluster.members) {
      final current = paidByFarmer[member.farmerId] ?? false;
      paidByFarmer[member.farmerId] = current || member.hasPaid;
    }
    final allFarmersPaid = paidByFarmer.isNotEmpty &&
        paidByFarmer.values.every((paid) => paid);
    final canTrackDelivery = isTrackingPhase || (isPayment && allFarmersPaid);
    final locationText = _locationText(
      cluster: cluster,
      farmerLat: farmerLat,
      farmerLng: farmerLng,
    );

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
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
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _clusterTitle(cluster),
                          style: AppTextStyles.h5
                              .copyWith(color: AppColors.primary),
                        ),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            const Icon(
                              Icons.location_on_outlined,
                              size: 12,
                              color: AppColors.textMuted,
                            ),
                            const SizedBox(width: 4),
                            Expanded(
                              child: Text(
                                locationText,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: AppTextStyles.caption.copyWith(
                                  color: AppColors.textMuted,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.groups_2_outlined,
                            size: 14, color: AppColors.primary),
                        const SizedBox(width: 6),
                        Text(
                          '${cluster.membersCount} Farmers',
                          style: AppTextStyles.caption.copyWith(
                            color: AppColors.primary,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: _StatBlock(
                      label: 'COLLECTED',
                      value:
                          '${cluster.currentQuantity.toStringAsFixed(0)} ${cluster.unit}',
                    ),
                  ),
                  Expanded(
                    child: _StatBlock(
                      label: 'TARGET',
                      value:
                          '${cluster.targetQuantity.toStringAsFixed(0)} ${cluster.unit}',
                    ),
                  ),
                  Expanded(
                    child: _StatBlock(
                      label: 'FILLED',
                      value:
                          '${(cluster.fillPercent * 100).toStringAsFixed(0)}%',
                      valueColor: const Color(0xFFE69A28),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              ClusterProgressBar(
                value: cluster.fillPercent,
                backgroundColor: const Color(0xFFD0CBB8),
                foregroundColor: AppColors.primary,
                height: 10,
              ),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  onPressed: () => canTrackDelivery
                      ? context.push('/delivery/${cluster.id}')
                      : context.push('/clusters/${cluster.id}'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(24),
                    ),
                    elevation: 0,
                  ),
                  child: Text(
                    canTrackDelivery
                        ? 'Track Delivery'
                        : isVoting
                            ? (cluster.myVote != null
                                ? 'Change Vote'
                                : 'Vote for Vendor')
                            : isPayment
                                ? (currentFarmerPaid
                                    ? 'Waiting for Others'
                                    : 'Pay Now')
                                : 'View Cluster',
                    style: AppTextStyles.h5.copyWith(color: AppColors.surface),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static String _clusterTitle(Cluster cluster) {
    if ((cluster.district ?? '').trim().isNotEmpty) {
      return '${cluster.district!.trim()} Cluster';
    }
    return '${cluster.product} Cluster';
  }

  static String _locationText({
    required Cluster cluster,
    required double? farmerLat,
    required double? farmerLng,
  }) {
    final location = (cluster.locationAddress ?? '').trim().isNotEmpty
        ? cluster.locationAddress!.trim()
        : [cluster.district, cluster.state]
            .whereType<String>()
            .map((e) => e.trim())
            .where((e) => e.isNotEmpty)
            .join(', ');
    final fallbackLocation = location.isEmpty ? 'your area' : location;
    final clusterLat = cluster.latitude;
    final clusterLng = cluster.longitude;
    if (farmerLat == null ||
        farmerLng == null ||
        clusterLat == null ||
        clusterLng == null) {
      return fallbackLocation;
    }

    final km = _distanceInKm(
      lat1: farmerLat,
      lng1: farmerLng,
      lat2: clusterLat,
      lng2: clusterLng,
    );
    return '${km.toStringAsFixed(1)} km away • $fallbackLocation';
  }

  static double _distanceInKm({
    required double lat1,
    required double lng1,
    required double lat2,
    required double lng2,
  }) {
    const radiusKm = 6371.0;
    final dLat = _toRadians(lat2 - lat1);
    final dLng = _toRadians(lng2 - lng1);
    final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(_toRadians(lat1)) *
            math.cos(_toRadians(lat2)) *
            math.sin(dLng / 2) *
            math.sin(dLng / 2);
    final c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
    return radiusKm * c;
  }

  static double _toRadians(double value) => value * (math.pi / 180);
}

class _StatBlock extends StatelessWidget {
  final String label;
  final String value;
  final Color valueColor;

  const _StatBlock({
    required this.label,
    required this.value,
    this.valueColor = AppColors.primary,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: AppTextStyles.caption.copyWith(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.2,
            color: AppColors.textMuted,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: AppTextStyles.h3.copyWith(fontSize: 20, color: valueColor),
        ),
      ],
    );
  }
}

class _EmptyState extends StatelessWidget {
  final VoidCallback onPlaceOrder;

  const _EmptyState({required this.onPlaceOrder});

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
          Text('No active clusters',
              style: AppTextStyles.h3.copyWith(color: AppColors.textPrimary)),
          const SizedBox(height: 12),
          Text(
            'Place an order and AgriSetu will automatically assign you to the best matching cluster.',
            style: AppTextStyles.body.copyWith(color: AppColors.textSecondary),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 32),
          SizedBox(
            width: double.infinity,
            height: 52,
            child: ElevatedButton.icon(
              onPressed: onPlaceOrder,
              icon: const Icon(Icons.mic, size: 20),
              label: const Text('Place an Order'),
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
