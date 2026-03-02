import 'dart:async';

import 'package:flutter/material.dart';
import '../../../../l10n/app_localizations.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../shared/widgets/app_header.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/order_model.dart';
import '../../../core/providers/auth_provider.dart';

final clusterDetailProvider =
    FutureProvider.autoDispose.family<Cluster, String>((ref, id) async {
  final timer = Timer.periodic(Duration(seconds: 6), (_) {
    ref.invalidateSelf();
  });
  ref.onDispose(timer.cancel);

  final api = ref.read(apiClientProvider);
  final data = await api.getCluster(id);
  return Cluster.fromJson(data);
});

class ClusterDetailScreen extends ConsumerStatefulWidget {
  final String clusterId;

  const ClusterDetailScreen({super.key, required this.clusterId});

  @override
  ConsumerState<ClusterDetailScreen> createState() =>
      _ClusterDetailScreenState();
}

class _ClusterDetailScreenState extends ConsumerState<ClusterDetailScreen> {
  bool _isVoting = false;
  bool _navigatedToFailed = false;
  String? _votedBidId;
  Timer? _clockTimer;
  DateTime _now = DateTime.now();

  @override
  void initState() {
    super.initState();
    _clockTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _now = DateTime.now());
    });
  }

  @override
  void dispose() {
    _clockTimer?.cancel();
    super.dispose();
  }

  bool _isPaymentTimedOut(Cluster cluster) {
    if (cluster.status == ClusterStatus.failed) return true;
    if (cluster.status != ClusterStatus.payment) return false;
    final deadline = cluster.paymentDeadlineAt;
    return deadline != null && !deadline.isAfter(_now);
  }

  String _formatDuration(num totalSeconds) {
    final seconds = totalSeconds.toInt();
    final safeSeconds = seconds < 0 ? 0 : seconds;
    final h = safeSeconds ~/ 3600;
    final m = (safeSeconds % 3600) ~/ 60;
    final s = safeSeconds % 60;
    return '${h.toString().padLeft(2, '0')} : ${m.toString().padLeft(2, '0')} : ${s.toString().padLeft(2, '0')}';
  }

  void _goToFailedScreen() {
    if (!mounted || _navigatedToFailed) return;
    _navigatedToFailed = true;
    context.go('/payment-failed/${widget.clusterId}');
  }

  Future<void> _vote(String bidId) async {
    if (_isVoting) return;
    setState(() {
      _isVoting = true;
      _votedBidId = bidId;
    });
    try {
      final api = ref.read(apiClientProvider);
      await api.voteOnBid(widget.clusterId, bidId);
      ref.invalidate(clusterDetailProvider(widget.clusterId));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppLocalizations.of(context)!.voteCastSuccessfully)),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _isVoting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final clusterAsync = ref.watch(clusterDetailProvider(widget.clusterId));
    final farmer = ref.watch(currentFarmerProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: clusterAsync.when(
        data: (cluster) {
          if (_isPaymentTimedOut(cluster)) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              _goToFailedScreen();
            });
            return const SizedBox.shrink();
          }
          return _buildContent(context, cluster, farmer);
        },
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.primary),
        ),
        error: (e, _) => Scaffold(
          appBar: AppHeader(title: 'Cluster'),
          body: Center(child: Text(e.toString())),
        ),
      ),
    );
  }

  Widget _buildContent(BuildContext context, Cluster cluster, farmer) {
    final isVoting = cluster.status == ClusterStatus.voting;
    final isPayment = cluster.status == ClusterStatus.payment;
    final myMembers =
        (cluster.members).where((m) => m.farmerId == farmer?.id).toList();
    final myPaymentDone =
        myMembers.isNotEmpty && myMembers.every((m) => m.hasPaid);
    final paidByFarmer = <String, bool>{};
    for (final member in cluster.members) {
      final current = paidByFarmer[member.farmerId] ?? false;
      paidByFarmer[member.farmerId] = current || member.hasPaid;
    }
    final paidFarmers = paidByFarmer.values.where((paid) => paid).length;
    final totalFarmers = paidByFarmer.length;
    final allFarmersPaid = totalFarmers > 0 && paidFarmers == totalFarmers;
    final deadline = cluster.paymentDeadlineAt;
    final secondsLeft = deadline == null
        ? 0
        : deadline.difference(_now).inSeconds.clamp(0, 10 * 24 * 3600);
    final canTrackDelivery = cluster.status == ClusterStatus.processing ||
        cluster.status == ClusterStatus.outForDelivery ||
        cluster.status == ClusterStatus.dispatched ||
        (isPayment && allFarmersPaid);
    final showPaymentAction = isPayment && !canTrackDelivery;

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: () async =>
          ref.invalidate(clusterDetailProvider(widget.clusterId)),
      child: CustomScrollView(
        slivers: [
          SliverAppBar(
            backgroundColor: AppColors.primary,
            pinned: true,
            toolbarHeight: 72,
            leading: GestureDetector(
              onTap: () {
                if (context.canPop()) {
                  context.pop();
                } else {
                  context.go('/clusters');
                }
              },
              child: const Icon(Icons.arrow_back, color: AppColors.surface),
            ),
            title: Text(
              'Your Cluster',
              style: AppTextStyles.h3.copyWith(color: AppColors.surface),
            ),
            actions: [
              IconButton(
                icon: const Icon(Icons.share, color: AppColors.surface),
                onPressed: () {},
              ),
            ],
            expandedHeight: 280,
            flexibleSpace: FlexibleSpaceBar(
              background: _MapSection(cluster: cluster),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.all(20),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                // Cluster banner
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: AppColors.primary,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: AppColors.surface.withOpacity(0.2),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(Icons.people,
                            color: AppColors.surface, size: 22),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'You + ${cluster.membersCount - 1} farmers in ${cluster.district ?? 'your area'}',
                              style: AppTextStyles.label
                                  .copyWith(color: AppColors.surface),
                            ),
                            Text(
                              'need ${cluster.targetQuantity.toStringAsFixed(0)} ${cluster.unit} ${cluster.cropName}',
                              style: AppTextStyles.bodySmall.copyWith(
                                  color: AppColors.textOnPrimaryMuted),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Progress card
                _DemandCard(cluster: cluster),
                const SizedBox(height: 20),

                // Vendor bids (voting)
                if (isVoting && cluster.bids.isNotEmpty) ...[
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(AppLocalizations.of(context)!.voteForVendor, style: AppTextStyles.h5),
                      Text(
                        'Swipe left/right to compare vendors',
                        style: AppTextStyles.caption,
                      ),
                    ],
                  ),
                  SizedBox(height: 12),
                  ...cluster.bids.asMap().entries.map((entry) {
                    final i = entry.key;
                    final bid = entry.value;
                    return _VendorBidCard(
                      bid: bid,
                      rank: i + 1,
                      onVote: () => _vote(bid.id),
                      isVoting: _isVoting && _votedBidId == bid.id,
                    );
                  }),
                  const SizedBox(height: 20),
                ],

                // Payment action
                if (showPaymentAction) ...[
                  if (deadline != null) ...[
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.primary.withOpacity(0.08),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.timer_outlined,
                              color: AppColors.primary, size: 18),
                          const SizedBox(width: 8),
                          Text(
                            'Payment timer: ${_formatDuration(secondsLeft)}',
                            style: AppTextStyles.bodySmall.copyWith(
                              color: AppColors.primary,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: myPaymentDone
                          ? AppColors.infoLight
                          : AppColors.successLight,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          myPaymentDone
                              ? Icons.hourglass_top
                              : Icons.check_circle,
                          color: myPaymentDone
                              ? AppColors.info
                              : AppColors.success,
                          size: 20,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            myPaymentDone
                                ? 'Your payment is done. Waiting for other farmers.'
                                : 'Vendor selected! Proceed to payment.',
                            style: AppTextStyles.body.copyWith(
                              color: myPaymentDone
                                  ? AppColors.info
                                  : AppColors.success,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.inputBackground,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.people_outline,
                            color: AppColors.primary, size: 18),
                        const SizedBox(width: 8),
                        Text(
                          '$paidFarmers of $totalFarmers farmers paid',
                          style: AppTextStyles.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (!myPaymentDone)
                    SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: ElevatedButton.icon(
                        onPressed: () => context.push('/payment/${cluster.id}'),
                        icon: const Icon(Icons.lock_outline, size: 20),
                        label: Text(AppLocalizations.of(context)!.paySecurely),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          shape: StadiumBorder(),
                          elevation: 0,
                          textStyle: AppTextStyles.button,
                        ),
                      ),
                    ),
                  if (myPaymentDone && !allFarmersPaid)
                    SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: OutlinedButton.icon(
                        onPressed: null,
                        icon: const Icon(Icons.check_circle_outline, size: 20),
                        label: Text(AppLocalizations.of(context)!.paymentCompleted),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.success,
                          side: BorderSide(
                            color: AppColors.success,
                            width: 1.3,
                          ),
                          shape: const StadiumBorder(),
                          textStyle: AppTextStyles.button,
                        ),
                      ),
                    ),
                  const SizedBox(height: 20),
                ],

                if (canTrackDelivery) ...[
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: ElevatedButton.icon(
                      onPressed: () => context.push('/delivery/${cluster.id}'),
                      icon: const Icon(Icons.local_shipping_outlined, size: 20),
                      label: Text(AppLocalizations.of(context)!.trackDelivery),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        shape: const StadiumBorder(),
                        elevation: 0,
                        textStyle: AppTextStyles.button,
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                ],

                // Not voting yet – locked
                if (!isVoting &&
                    !isPayment &&
                    !canTrackDelivery &&
                    cluster.status != ClusterStatus.completed &&
                    cluster.status != ClusterStatus.failed)
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 20, vertical: 14),
                    decoration: BoxDecoration(
                      color: AppColors.inputBackground,
                      borderRadius: BorderRadius.circular(26),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.lock_outline,
                            size: 18, color: AppColors.textMuted),
                        const SizedBox(width: 8),
                        Text(
                          'Payment unlocks after requirement is complete',
                          style: AppTextStyles.bodySmall,
                        ),
                      ],
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

class _MapSection extends StatelessWidget {
  final Cluster cluster;

  const _MapSection({required this.cluster});

  @override
  Widget build(BuildContext context) {
    final topBarHeight = MediaQuery.paddingOf(context).top + 72;
    final addressTopOffset = topBarHeight + 8;
    final farmerPoints = cluster.members
        .where(
          (member) =>
              member.farmer?.latitude != null &&
              member.farmer?.longitude != null,
        )
        .map((member) =>
            LatLng(member.farmer!.latitude!, member.farmer!.longitude!))
        .toList();

    LatLng center;
    if (cluster.latitude != null && cluster.longitude != null) {
      center = LatLng(cluster.latitude!, cluster.longitude!);
    } else if (farmerPoints.isNotEmpty) {
      final avgLat =
          farmerPoints.fold<double>(0, (sum, point) => sum + point.latitude) /
              farmerPoints.length;
      final avgLng =
          farmerPoints.fold<double>(0, (sum, point) => sum + point.longitude) /
              farmerPoints.length;
      center = LatLng(avgLat, avgLng);
    } else {
      center = const LatLng(20.5937, 78.9629);
    }

    final locationLabel = cluster.locationAddress ??
        [cluster.district, cluster.state]
            .whereType<String>()
            .where((value) => value.trim().isNotEmpty)
            .join(', ');

    return Stack(
      children: [
        FlutterMap(
          options: MapOptions(
            initialCenter: center,
            initialZoom: farmerPoints.isNotEmpty ? 12.5 : 5.0,
            interactionOptions:
                const InteractionOptions(flags: InteractiveFlag.all),
          ),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'com.example.agrisetu_app',
            ),
            CircleLayer(
              circles: [
                CircleMarker(
                  point: center,
                  radius: 2000,
                  useRadiusInMeter: true,
                  color: AppColors.primary.withOpacity(0.1),
                  borderColor: AppColors.primary.withOpacity(0.35),
                  borderStrokeWidth: 1.3,
                ),
              ],
            ),
            MarkerLayer(
              markers: [
                Marker(
                  width: 44,
                  height: 44,
                  point: center,
                  child: const Icon(
                    Icons.location_on,
                    color: AppColors.primary,
                    size: 38,
                  ),
                ),
                ...farmerPoints.map(
                  (point) => Marker(
                    width: 30,
                    height: 30,
                    point: point,
                    child: Container(
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        shape: BoxShape.circle,
                        border:
                            Border.all(color: AppColors.primary, width: 1.5),
                      ),
                      child: const Icon(
                        Icons.person,
                        size: 16,
                        color: AppColors.primary,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
        // Keep the toolbar readable over the map.
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          child: IgnorePointer(
            child: Container(
              height: topBarHeight,
              color: AppColors.primary,
            ),
          ),
        ),
        Positioned(
          top: addressTopOffset,
          left: 16,
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.sizeOf(context).width * 0.7,
            ),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
              decoration: BoxDecoration(
                color: AppColors.primary,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.location_on,
                      size: 14, color: AppColors.surface),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(
                      locationLabel.isNotEmpty
                          ? locationLabel
                          : 'Location unavailable',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTextStyles.caption.copyWith(
                        color: AppColors.surface,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _DemandCard extends StatelessWidget {
  static const Color _warningAccent = Color(0xFFE69A28);

  final Cluster cluster;

  const _DemandCard({required this.cluster});

  @override
  Widget build(BuildContext context) {
    final needed = cluster.targetQuantity.toStringAsFixed(0);
    final filled = cluster.currentQuantity.toStringAsFixed(0);
    final remaining = (cluster.targetQuantity - cluster.currentQuantity)
        .clamp(0, cluster.targetQuantity)
        .toStringAsFixed(0);
    final percent = (cluster.fillPercent * 100).toStringAsFixed(0);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
      decoration: BoxDecoration(
        color: AppColors.inputBackground,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.spa, color: AppColors.primary, size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  '${cluster.cropName} — Demand',
                  style: AppTextStyles.h5.copyWith(
                    color: AppColors.primary,
                    fontSize: 14,
                  ),
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
                    Container(
                      width: 7,
                      height: 7,
                      decoration: const BoxDecoration(
                        color: AppColors.primary,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 5),
                    Text(
                      cluster.status.displayLabel,
                      style: AppTextStyles.caption.copyWith(
                        color: AppColors.primary,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: _DemandStat(
                  label: 'REQUIRED',
                  value: '$needed ${cluster.unit}',
                  valueColor: AppColors.primary,
                ),
              ),
              Container(
                width: 1,
                height: 44,
                color: AppColors.primary.withOpacity(0.18),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(left: 14),
                  child: _DemandStat(
                    label: 'FILLED',
                    value: '$filled ${cluster.unit}',
                    valueColor: AppColors.primary,
                  ),
                ),
              ),
              Container(
                width: 1,
                height: 44,
                color: AppColors.primary.withOpacity(0.18),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(left: 14),
                  child: _DemandStat(
                    label: 'STILL NEEDED',
                    value: '$remaining ${cluster.unit}',
                    valueColor: _warningAccent,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: SizedBox(
              height: 12,
              child: Stack(
                children: [
                  Container(color: const Color(0xFFC8C2B5)),
                  FractionallySizedBox(
                    widthFactor: cluster.fillPercent.clamp(0, 1),
                    alignment: Alignment.centerLeft,
                    child: Container(color: AppColors.primary),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  '$filled ${cluster.unit} collected  ·  $percent% filled',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTextStyles.caption.copyWith(
                    color: AppColors.primary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.access_time_filled_rounded,
                    size: 13,
                    color: _warningAccent,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    '$remaining ${cluster.unit} to go',
                    style: AppTextStyles.caption.copyWith(
                      color: _warningAccent,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DemandStat extends StatelessWidget {
  final String label;
  final String value;
  final Color valueColor;

  const _DemandStat({
    required this.label,
    required this.value,
    required this.valueColor,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: AppTextStyles.caption.copyWith(
            fontSize: 10,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.2,
          ),
        ),
        const SizedBox(height: 3),
        Text(
          value,
          style: AppTextStyles.h2.copyWith(
            color: valueColor,
            fontSize: 22,
          ),
        ),
      ],
    );
  }
}

class _VendorBidCard extends StatelessWidget {
  final VendorBid bid;
  final int rank;
  final VoidCallback onVote;
  final bool isVoting;

  const _VendorBidCard({
    required this.bid,
    required this.rank,
    required this.onVote,
    required this.isVoting,
  });

  @override
  Widget build(BuildContext context) {
    final isRecommended = rank == 1;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.inputBackground,
        borderRadius: BorderRadius.circular(20),
        border: isRecommended
            ? Border.all(color: AppColors.primary, width: 1.5)
            : null,
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.primary.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  '#$rank',
                  style: AppTextStyles.caption.copyWith(
                    color: AppColors.primary,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              if (isRecommended)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.successLight,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    'Recommended',
                    style: AppTextStyles.caption.copyWith(
                      color: AppColors.success,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AppColors.primary.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child:
                    const Icon(Icons.store, color: AppColors.primary, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      bid.vendor?.businessName ?? 'Vendor',
                      style: AppTextStyles.label,
                    ),
                    Text(
                      bid.vendor?.state ?? '',
                      style: AppTextStyles.caption,
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '₹${bid.pricePerUnit.toStringAsFixed(0)}/kg',
                    style: AppTextStyles.priceSmall,
                  ),
                  Text(
                    '${bid.votes} votes',
                    style: AppTextStyles.caption,
                  ),
                ],
              ),
            ],
          ),
          if (bid.note != null) ...[
            const SizedBox(height: 8),
            Text(
              bid.note!,
              style: AppTextStyles.caption.copyWith(color: AppColors.textMuted),
            ),
          ],
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            height: 44,
            child: ElevatedButton.icon(
              onPressed: isVoting ? null : onVote,
              icon: isVoting
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.surface,
                      ),
                    )
                  : const Icon(Icons.how_to_vote, size: 18),
              label: Text(
                isVoting ? 'Voting…' : 'Vote for this Vendor',
                style: AppTextStyles.buttonSmall,
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                shape: const StadiumBorder(),
                elevation: 0,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
