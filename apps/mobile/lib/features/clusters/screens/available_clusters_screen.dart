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
      context.push('/voice');
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
                  onTap: () => Navigator.maybePop(context),
                  child: const Icon(
                    Icons.arrow_back,
                    size: 24,
                    color: AppColors.surface,
                  ),
                ),
                Text(
                  'Available Clusters',
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
                    onCreateOrder: () => context.push('/voice'),
                  );
                }

                return RefreshIndicator(
                  color: AppColors.primary,
                  onRefresh: () async =>
                      ref.invalidate(availableClustersProvider(query)),
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
                            'Available Clusters Near You',
                            style: AppTextStyles.h4
                                .copyWith(color: AppColors.primary),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _subtitleText(clusters),
                        style: AppTextStyles.bodySmall.copyWith(
                          color: AppColors.textMuted,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: 16),
                      ...clusters.asMap().entries.map((entry) {
                        final index = entry.key;
                        final cluster = entry.value;
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: _ClusterCard(
                            cluster: cluster,
                            selectionMode: selectionMode,
                            isPrimaryCard: index == 0,
                            showPrimaryAction: !selectionMode || index == 0,
                            currentFarmerId: farmer?.id,
                            farmerLat: farmer?.latitude,
                            farmerLng: farmer?.longitude,
                            isBusy: _joiningClusterId == cluster.id ||
                                _isCreatingNew,
                            onPrimaryTap: () => _joinCluster(cluster.id),
                          ),
                        );
                      }),
                      const SizedBox(height: 4),
                      SizedBox(
                        width: double.infinity,
                        height: 56,
                        child: OutlinedButton.icon(
                          onPressed: _joiningClusterId != null || _isCreatingNew
                              ? null
                              : selectionMode
                                  ? _createNewCluster
                                  : () => context.push('/voice'),
                          icon: _isCreatingNew
                              ? const SizedBox(
                                  width: 20,
                                  height: 20,
                                  child:
                                      CircularProgressIndicator(strokeWidth: 2),
                                )
                              : const Icon(Icons.add_circle_outline, size: 22),
                          label: Text(
                            selectionMode
                                ? 'Create New Cluster'
                                : 'Start a New Order',
                          ),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: AppColors.primary,
                            side: const BorderSide(
                                color: AppColors.primary, width: 2),
                            shape: const StadiumBorder(),
                            textStyle: AppTextStyles.h5
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

  String _subtitleText(List<Cluster> clusters) {
    final crop = (widget.cropName ?? clusters.first.cropName).trim();
    final minTarget =
        clusters.map((c) => c.targetQuantity).reduce(math.min).round();
    final unit = clusters.first.unit;
    return 'Clusters for $crop (${minTarget.toString()}$unit min)';
  }
}

class _ClusterCard extends StatelessWidget {
  final Cluster cluster;
  final bool selectionMode;
  final bool isPrimaryCard;
  final bool showPrimaryAction;
  final String? currentFarmerId;
  final double? farmerLat;
  final double? farmerLng;
  final bool isBusy;
  final VoidCallback onPrimaryTap;

  const _ClusterCard({
    required this.cluster,
    required this.selectionMode,
    required this.isPrimaryCard,
    required this.showPrimaryAction,
    required this.currentFarmerId,
    required this.farmerLat,
    required this.farmerLng,
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
    final locationText = _locationText(
      cluster: cluster,
      farmerLat: farmerLat,
      farmerLng: farmerLng,
    );

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: selectionMode
            ? onPrimaryTap
            : () => context.push('/clusters/${cluster.id}'),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.inputBackground,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: isPrimaryCard ? AppColors.primary : Colors.transparent,
              width: 2,
            ),
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
                        const Icon(
                          Icons.groups_2_outlined,
                          size: 14,
                          color: AppColors.primary,
                        ),
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
              const SizedBox(height: 6),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    '${cluster.currentQuantity.toStringAsFixed(0)} ${cluster.unit} collected',
                    style: AppTextStyles.caption.copyWith(
                      color: AppColors.textMuted,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  Text(
                    '${(cluster.targetQuantity - cluster.currentQuantity).clamp(0, cluster.targetQuantity).toStringAsFixed(0)} ${cluster.unit} needed',
                    style: AppTextStyles.caption.copyWith(
                      color: const Color(0xFFE69A28),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
              if (showPrimaryAction) ...[
                const SizedBox(height: 14),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton(
                    onPressed: isBusy
                        ? null
                        : selectionMode
                            ? onPrimaryTap
                            : () => context.push('/clusters/${cluster.id}'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(24),
                      ),
                      elevation: 0,
                    ),
                    child: isBusy
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              if (selectionMode) ...[
                                const Icon(
                                  Icons.check_circle_outline,
                                  size: 20,
                                  color: AppColors.surface,
                                ),
                                const SizedBox(width: 8),
                              ],
                              Text(
                                selectionMode
                                    ? 'Join This Cluster'
                                    : isVoting
                                        ? 'Vote for Vendor'
                                        : isPayment
                                            ? (currentFarmerPaid
                                                ? 'Waiting for Others'
                                                : 'Pay Now')
                                            : 'View Cluster',
                                style: AppTextStyles.h5
                                    .copyWith(color: AppColors.surface),
                              ),
                            ],
                          ),
                  ),
                ),
              ],
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
    return '${cluster.cropName} Cluster';
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
          style: AppTextStyles.h3.copyWith(
            fontSize: 20,
            color: valueColor,
          ),
        ),
      ],
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
