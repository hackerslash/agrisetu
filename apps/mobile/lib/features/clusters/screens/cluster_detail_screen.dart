import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../shared/widgets/app_header.dart';
import '../../../shared/widgets/status_badge.dart';
import '../../../shared/widgets/progress_bar.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/order_model.dart';
import '../../../core/providers/auth_provider.dart';

final clusterDetailProvider =
    FutureProvider.family<Cluster, String>((ref, id) async {
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
  String? _votedBidId;

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
          const SnackBar(content: Text('Vote cast successfully!')),
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
        data: (cluster) => _buildContent(context, cluster, farmer),
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
    final canTrackDelivery = cluster.status == ClusterStatus.processing ||
        cluster.status == ClusterStatus.outForDelivery ||
        cluster.status == ClusterStatus.dispatched;
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

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: () async =>
          ref.invalidate(clusterDetailProvider(widget.clusterId)),
      child: CustomScrollView(
        slivers: [
          SliverAppBar(
            backgroundColor: AppColors.primary,
            pinned: true,
            leading: GestureDetector(
              onTap: () => context.pop(),
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
                Container(
                  padding: const EdgeInsets.all(18),
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
                            child: Text(
                              '${cluster.cropName} – Demand',
                              style: AppTextStyles.label,
                            ),
                          ),
                          StatusBadge.fromClusterStatus(cluster.status),
                        ],
                      ),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          _StatsBox(
                              label: 'NEEDED',
                              value: cluster.targetQuantity.toStringAsFixed(0)),
                          const SizedBox(width: 8),
                          _StatsBox(
                              label: 'FILLED',
                              value:
                                  cluster.currentQuantity.toStringAsFixed(0)),
                          const SizedBox(width: 8),
                          _StatsBox(
                              label: 'STILL NEEDED',
                              value: (cluster.targetQuantity -
                                      cluster.currentQuantity)
                                  .clamp(0, cluster.targetQuantity)
                                  .toStringAsFixed(0),
                              highlight: true),
                        ],
                      ),
                      const SizedBox(height: 12),
                      ClusterProgressBar(value: cluster.fillPercent),
                      const SizedBox(height: 6),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            '${cluster.currentQuantity.toStringAsFixed(0)} ${cluster.unit} collected · ${(cluster.fillPercent * 100).toStringAsFixed(0)}% filled',
                            style: AppTextStyles.caption,
                          ),
                          Text(
                            '${(cluster.targetQuantity - cluster.currentQuantity).clamp(0, cluster.targetQuantity).toStringAsFixed(0)} ${cluster.unit} to go',
                            style: AppTextStyles.caption
                                .copyWith(color: AppColors.primary),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),

                // Vendor bids (voting)
                if (isVoting && cluster.bids.isNotEmpty) ...[
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Vote for Vendor', style: AppTextStyles.h5),
                      Text(
                        'Swipe left/right to compare vendors',
                        style: AppTextStyles.caption,
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
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
                if (isPayment) ...[
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
                        label: const Text('Pay Securely'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          shape: const StadiumBorder(),
                          elevation: 0,
                          textStyle: AppTextStyles.button,
                        ),
                      ),
                    ),
                  if (myPaymentDone)
                    SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: OutlinedButton.icon(
                        onPressed: null,
                        icon: const Icon(Icons.check_circle_outline, size: 20),
                        label: const Text('Payment Completed'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.success,
                          side: const BorderSide(
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
                      label: const Text('Track Delivery'),
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
    return Container(
      color: AppColors.primary,
      child: Stack(
        children: [
          // Map placeholder
          Container(
            color: const Color(0xFFE8F5E9),
            child: CustomPaint(
              painter: _MapGridPainter(),
              size: Size.infinite,
            ),
          ),
          // Location label
          Positioned(
            top: 12,
            left: 16,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.primary,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                '${cluster.district ?? 'Your District'}, ${cluster.state ?? ''}',
                style: AppTextStyles.caption.copyWith(
                  color: AppColors.surface,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
          // Cluster pins
          ...List.generate(
            cluster.membersCount.clamp(0, 5),
            (i) => Positioned(
              left: 100.0 + (i % 3) * 80,
              top: 80.0 + (i ~/ 3) * 60,
              child: Container(
                width: i == 0 ? 40 : 30,
                height: i == 0 ? 40 : 30,
                decoration: BoxDecoration(
                  color: AppColors.primary,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.surface, width: 2),
                ),
                child: const Icon(Icons.person,
                    color: AppColors.surface, size: 16),
              ),
            ),
          ),
          // Radius circle
          Center(
            child: Container(
              width: 180,
              height: 180,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: AppColors.primary.withOpacity(0.3),
                  width: 2,
                ),
                color: AppColors.primary.withOpacity(0.08),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MapGridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0xFFBBDDBB)
      ..strokeWidth = 1;

    for (double y = 0; y < size.height; y += 60) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
    for (double x = 0; x < size.width; x += 80) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
  }

  @override
  bool shouldRepaint(_) => false;
}

class _StatsBox extends StatelessWidget {
  final String label;
  final String value;
  final bool highlight;

  const _StatsBox(
      {required this.label, required this.value, this.highlight = false});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
        decoration: BoxDecoration(
          color: highlight
              ? AppColors.primary.withOpacity(0.1)
              : AppColors.surface,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: AppTextStyles.caption.copyWith(
                fontSize: 9,
                letterSpacing: 0.3,
              ),
            ),
            Text(
              value,
              style: AppTextStyles.h5.copyWith(
                color: highlight ? AppColors.primary : AppColors.textPrimary,
                fontSize: 15,
              ),
            ),
          ],
        ),
      ),
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
