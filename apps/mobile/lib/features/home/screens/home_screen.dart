import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../shared/widgets/progress_bar.dart';
import '../../../core/providers/auth_provider.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/order_model.dart';

// Providers — backed by real API endpoints

final homeDashboardProvider =
    FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final timer = Timer.periodic(const Duration(seconds: 8), (_) {
    ref.invalidateSelf();
  });
  ref.onDispose(timer.cancel);

  final api = ref.read(apiClientProvider);
  return api.getDashboard();
});

final homeMandiPricesProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final timer = Timer.periodic(const Duration(seconds: 30), (_) {
    ref.invalidateSelf();
  });
  ref.onDispose(timer.cancel);

  final api = ref.read(apiClientProvider);
  final data = await api.getMandiPrices();
  final prices = data['prices'] as List<dynamic>;
  return prices
      .map((p) => {
            'name': p['commodity'] as String,
            'price': p['modalPrice'] as int,
            'change': (p['changePercent'] as num).toDouble(),
            'unit': p['unit'] == 'quintal' ? 'q' : p['unit'] as String,
          })
      .toList();
});

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  String _greeting() {
    final hour = DateTime.now().toLocal().hour;
    if (hour < 12) return 'Good morning 🌾';
    if (hour < 17) return 'Good afternoon ☀️';
    return 'Good evening 🌙';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final farmer = ref.watch(currentFarmerProvider);
    final dashboardAsync = ref.watch(homeDashboardProvider);
    final pricesAsync = ref.watch(homeMandiPricesProvider);
    final locationLabel = [
      farmer?.village,
      if ((farmer?.district ?? '').trim().isNotEmpty)
        '${farmer!.district!.trim()} Dist.'
    ].whereType<String>().where((s) => s.trim().isNotEmpty).join(', ');

    // Derive orders and clusters from dashboard payload
    final ordersAsync = dashboardAsync.whenData(
      (d) => (d['orders'] as List<dynamic>)
          .map((e) => Order.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
    final clustersAsync = dashboardAsync.whenData(
      (d) {
        final clusters = (d['clusters'] as List<dynamic>)
            .map((e) => Cluster.fromJson(e as Map<String, dynamic>))
            .toList();
        final seen = <String>{};
        return clusters.where((c) => seen.add(c.id)).toList();
      },
    );

    return Scaffold(
      backgroundColor: AppColors.surface,
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: () async {
          ref.invalidate(homeDashboardProvider);
          ref.invalidate(homeMandiPricesProvider);
        },
        child: CustomScrollView(
          slivers: [
            // Hero header
            SliverToBoxAdapter(
              child: Container(
                color: AppColors.primary,
                padding: EdgeInsets.only(
                  top: MediaQuery.of(context).padding.top + 24,
                  left: 24,
                  right: 24,
                  bottom: 24,
                ),
                child: Column(
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 32,
                          height: 32,
                          decoration: BoxDecoration(
                            color: AppColors.surface.withOpacity(0.15),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.eco,
                            color: AppColors.surface,
                            size: 18,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          'AgriSetu',
                          style: AppTextStyles.h5.copyWith(
                            color: AppColors.surface,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    // Top row
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                _greeting(),
                                style: AppTextStyles.bodySmall.copyWith(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w500,
                                  color: AppColors.textOnPrimaryMuted,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                farmer?.name ?? 'Farmer',
                                style: AppTextStyles.h2.copyWith(
                                  fontSize: 24,
                                  color: AppColors.surface,
                                ),
                              ),
                              if (locationLabel.isNotEmpty)
                                Text(
                                  locationLabel,
                                  style: AppTextStyles.caption.copyWith(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w500,
                                    color: AppColors.textOnPrimaryMuted,
                                  ),
                                ),
                            ],
                          ),
                        ),
                        GestureDetector(
                          onTap: () => context.push('/profile'),
                          child: Container(
                            width: 48,
                            height: 48,
                            decoration: BoxDecoration(
                              color: AppColors.surface.withOpacity(0.2),
                              shape: BoxShape.circle,
                            ),
                            child: ClipOval(
                              child: (farmer?.avatarUrl ?? '').isNotEmpty
                                  ? Image.network(
                                      farmer!.avatarUrl!,
                                      fit: BoxFit.cover,
                                      errorBuilder: (_, __, ___) =>
                                          const _HomeAvatarFallback(),
                                    )
                                  : const _HomeAvatarFallback(),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),

                    // Stats row — from /farmer/dashboard
                    dashboardAsync.when(
                      data: (dashboard) {
                        final stats =
                            dashboard['stats'] as Map<String, dynamic>;
                        final totalSaved = stats['totalSaved'] as int? ?? 0;
                        final ordersPlaced = stats['ordersPlaced'] as int? ?? 0;
                        final delivered = stats['delivered'] as int? ?? 0;
                        final co2Saved = stats['co2Saved'] as int? ?? 0;
                        return Row(
                          children: [
                            _StatCard(
                              label: 'TOTAL SAVINGS',
                              value:
                                  '₹${NumberFormat('#,###').format(totalSaved)}',
                              sub: 'from bulk orders',
                            ),
                            const SizedBox(width: 12),
                            _StatCard(
                              label: 'ORDERS PLACED',
                              value: ordersPlaced.toString(),
                              sub: delivered > 0
                                  ? '$delivered delivered'
                                  : 'this season',
                            ),
                            const SizedBox(width: 12),
                            _StatCard(
                              label: 'CO₂ SAVED',
                              value: '$co2Saved kg',
                              sub: 'vs solo ordering',
                              valueColor: const Color(0xFF4CAF50),
                              valueFontSize: 18,
                            ),
                          ],
                        );
                      },
                      loading: () => const SizedBox(height: 72),
                      error: (_, __) => const SizedBox(height: 72),
                    ),
                  ],
                ),
              ),
            ),

            SliverPadding(
              padding: const EdgeInsets.all(20),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  // Active Order
                  ordersAsync.when(
                    data: (orders) {
                      final activeOrders = orders
                          .where((o) =>
                              o.status != OrderStatus.delivered &&
                              o.status != OrderStatus.rejected &&
                              o.status != OrderStatus.failed)
                          .toList();

                      if (activeOrders.isEmpty) return const SizedBox.shrink();

                      return Column(
                        children: [
                          _SectionHeader(
                            title: 'Active Order',
                            linkText: 'View all →',
                            onTap: () => context.push('/orders'),
                            linkColor: AppColors.textMuted,
                          ),
                          const SizedBox(height: 12),
                          _ActiveOrderCard(order: activeOrders.first),
                          const SizedBox(height: 20),
                        ],
                      );
                    },
                    loading: () => _shimmerCard(),
                    error: (_, __) => const SizedBox.shrink(),
                  ),

                  // Your Cluster
                  clustersAsync.when(
                    data: (clusters) {
                      if (clusters.isEmpty) return const SizedBox.shrink();
                      final myCluster = clusters.first;
                      return Column(
                        children: [
                          _ClusterCard(
                            cluster: myCluster,
                            onViewTap: () =>
                                context.push('/clusters/${myCluster.id}'),
                          ),
                          const SizedBox(height: 20),
                        ],
                      );
                    },
                    loading: () => _shimmerCard(),
                    error: (_, __) => const SizedBox.shrink(),
                  ),

                  // Mandi Prices Today — from /farmer/mandi-prices
                  pricesAsync.when(
                    data: (prices) => _MandiPricesCard(prices: prices),
                    loading: () => _shimmerCard(),
                    error: (_, __) => const SizedBox.shrink(),
                  ),
                  const SizedBox(height: 20),

                  // Recent Activity
                  ordersAsync.when(
                    data: (orders) {
                      if (orders.isEmpty) return const SizedBox.shrink();
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Recent Activity',
                            style: AppTextStyles.h5
                                .copyWith(color: AppColors.primary),
                          ),
                          const SizedBox(height: 12),
                          ...orders
                              .take(2)
                              .map((order) => _ActivityItem(order: order)),
                        ],
                      );
                    },
                    loading: () => const SizedBox.shrink(),
                    error: (_, __) => const SizedBox.shrink(),
                  ),

                  const SizedBox(height: 80),
                ]),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _shimmerCard() {
    return Container(
      height: 120,
      margin: const EdgeInsets.only(bottom: 20),
      decoration: BoxDecoration(
        color: AppColors.shimmerBase,
        borderRadius: BorderRadius.circular(20),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final String sub;
  final Color valueColor;
  final double valueFontSize;

  const _StatCard({
    required this.label,
    required this.value,
    required this.sub,
    this.valueColor = AppColors.surface,
    this.valueFontSize = 22,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: SizedBox(
        height: 102,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.surface.withOpacity(0.15),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTextStyles.caption.copyWith(
                  color: AppColors.textOnPrimaryMuted,
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.5,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTextStyles.h2.copyWith(
                  color: valueColor,
                  fontSize: valueFontSize,
                ),
              ),
              Text(
                sub,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTextStyles.caption.copyWith(
                  color: AppColors.textOnPrimaryMuted,
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  final String? linkText;
  final VoidCallback? onTap;
  final Color linkColor;

  const _SectionHeader({
    required this.title,
    this.linkText,
    required this.onTap,
    this.linkColor = AppColors.textMuted,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          title,
          style: AppTextStyles.h5.copyWith(
            fontSize: 16,
            color: AppColors.primary,
          ),
        ),
        if (linkText != null)
          GestureDetector(
            onTap: onTap,
            child: Text(
              linkText!,
              style: AppTextStyles.bodySmall.copyWith(
                color: linkColor,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
      ],
    );
  }
}

class _ActiveOrderCard extends StatelessWidget {
  final Order order;

  const _ActiveOrderCard({required this.order});

  @override
  Widget build(BuildContext context) {
    final cluster = order.clusterMember?.cluster;
    final totalAmount = (cluster != null && cluster.bids.isNotEmpty)
        ? cluster.bids.first.totalPrice
        : 0;
    final amountText = totalAmount > 0
        ? '₹${NumberFormat('#,###').format(totalAmount.round())}'
        : '₹${NumberFormat('#,###').format((order.quantity * 840).round())}';
    final progress = _progressForStatus(order.status);
    final rightEta = _etaLabel(order.deliveryDate);

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.primary,
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
                    Text(
                      order.cropName,
                      style:
                          AppTextStyles.h5.copyWith(color: AppColors.surface),
                    ),
                    Text(
                      '${order.quantity.toStringAsFixed(0)} ${order.unit}  ·  ${cluster?.vendor?.businessName ?? 'AgroMart Supplies'}',
                      style: AppTextStyles.bodySmall.copyWith(
                        color: AppColors.textOnPrimaryMuted,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.circle,
                      size: 7,
                      color: Color(0xFFE69A28),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      _statusLabel(order.status),
                      style: AppTextStyles.caption.copyWith(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppColors.surface,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          ClusterProgressBar(
            value: progress,
            backgroundColor: Colors.white.withOpacity(0.14),
            foregroundColor: AppColors.surface,
            height: 8,
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                _progressLeftText(order.status),
                style: AppTextStyles.caption.copyWith(
                  color: AppColors.textOnPrimaryMuted,
                  fontWeight: FontWeight.w500,
                ),
              ),
              Row(
                children: [
                  const Icon(
                    Icons.location_on_outlined,
                    size: 13,
                    color: Color(0xFFE69A28),
                  ),
                  const SizedBox(width: 4),
                  Text(
                    rightEta,
                    style: AppTextStyles.caption.copyWith(
                      color: const Color(0xFFE69A28),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'YOUR TOTAL',
                    style: AppTextStyles.caption.copyWith(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textOnPrimaryMuted,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    amountText,
                    style: AppTextStyles.h2.copyWith(
                      color: AppColors.surface,
                      fontSize: 20,
                    ),
                  ),
                ],
              ),
              GestureDetector(
                onTap: () {
                  if (cluster != null) {
                    context.push('/clusters/${cluster.id}');
                  } else {
                    context.push('/orders');
                  }
                },
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.location_on_outlined,
                        size: 14,
                        color: AppColors.surface,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        'Track Order',
                        style: AppTextStyles.bodySmall.copyWith(
                          color: AppColors.surface,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  static double _progressForStatus(OrderStatus status) {
    switch (status) {
      case OrderStatus.pending:
        return 0.2;
      case OrderStatus.clustered:
        return 0.4;
      case OrderStatus.paymentPending:
      case OrderStatus.paid:
        return 0.6;
      case OrderStatus.processing:
        return 0.7;
      case OrderStatus.outForDelivery:
      case OrderStatus.dispatched:
      case OrderStatus.delivered:
        return 0.82;
      case OrderStatus.rejected:
      case OrderStatus.failed:
        return 0.2;
    }
  }

  static String _statusLabel(OrderStatus status) {
    switch (status) {
      case OrderStatus.pending:
      case OrderStatus.clustered:
        return 'In Progress';
      case OrderStatus.paymentPending:
        return 'Payment Due';
      case OrderStatus.paid:
      case OrderStatus.processing:
        return 'Processing';
      case OrderStatus.outForDelivery:
      case OrderStatus.dispatched:
        return 'In Transit';
      case OrderStatus.delivered:
        return 'Delivered';
      case OrderStatus.rejected:
      case OrderStatus.failed:
        return 'Issue';
    }
  }

  static String _progressLeftText(OrderStatus status) {
    switch (status) {
      case OrderStatus.pending:
      case OrderStatus.clustered:
        return 'Order received';
      case OrderStatus.paymentPending:
        return 'Waiting for payment';
      case OrderStatus.paid:
      case OrderStatus.processing:
        return 'Preparing dispatch';
      case OrderStatus.outForDelivery:
      case OrderStatus.dispatched:
        return 'Dispatched from vendor';
      case OrderStatus.delivered:
        return 'Delivered successfully';
      case OrderStatus.rejected:
      case OrderStatus.failed:
        return 'Order needs attention';
    }
  }

  static String _etaLabel(DateTime? eta) {
    if (eta == null) return 'Today, 4–6 PM';
    final now = DateTime.now();
    if (eta.year == now.year && eta.month == now.month && eta.day == now.day) {
      return 'Today, ${DateFormat('h:mm a').format(eta)}';
    }
    return DateFormat('d MMM, h:mm a').format(eta);
  }
}

class _ClusterCard extends StatelessWidget {
  final Cluster cluster;
  final VoidCallback? onViewTap;

  const _ClusterCard({required this.cluster, this.onViewTap});

  @override
  Widget build(BuildContext context) {
    final visibleFarmers = math.min(cluster.membersCount, 3);
    final remainingFarmers = math.max(0, cluster.membersCount - visibleFarmers);
    final targetFarmers = math.max(10, cluster.membersCount);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
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
                child: Row(
                  children: [
                    const Icon(
                      Icons.groups_2_outlined,
                      size: 16,
                      color: AppColors.primary,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'Your Cluster · ${cluster.district ?? 'Your Area'}',
                      style: AppTextStyles.h5.copyWith(
                        fontSize: 14,
                        color: AppColors.primary,
                      ),
                    ),
                  ],
                ),
              ),
              GestureDetector(
                onTap: onViewTap,
                child: Text(
                  'View →',
                  style: AppTextStyles.bodySmall.copyWith(
                    color: AppColors.textMuted,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              ...List.generate(
                visibleFarmers,
                (_) => Container(
                  margin: const EdgeInsets.only(right: 4),
                  child: const _ClusterFarmerAvatar(),
                ),
              ),
              if (remainingFarmers > 0)
                Container(
                  width: 28,
                  height: 28,
                  margin: const EdgeInsets.only(right: 8),
                  decoration: BoxDecoration(
                    color: const Color(0xFFD0CBB8),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Center(
                    child: Text(
                      '+$remainingFarmers',
                      style: AppTextStyles.caption.copyWith(
                        color: AppColors.primary,
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
              Text(
                '${cluster.membersCount} of $targetFarmers farmers joined',
                style: AppTextStyles.caption.copyWith(
                  color: AppColors.textMuted,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ClusterProgressBar(
            value: cluster.fillPercent,
            backgroundColor: const Color(0xFFC8C2B5),
            foregroundColor: AppColors.primary,
            height: 8,
          ),
          const SizedBox(height: 6),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '${(cluster.fillPercent * 100).toStringAsFixed(0)}% demand filled',
                style: AppTextStyles.caption.copyWith(
                  color: AppColors.primary,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Text(
                '${(cluster.targetQuantity - cluster.currentQuantity).clamp(0, cluster.targetQuantity).toStringAsFixed(0)} ${cluster.unit} to go',
                style: AppTextStyles.caption.copyWith(
                  color: const Color(0xFFE69A28),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ClusterFarmerAvatar extends StatelessWidget {
  const _ClusterFarmerAvatar();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 28,
      height: 28,
      decoration: BoxDecoration(
        color: AppColors.primary,
        borderRadius: BorderRadius.circular(14),
      ),
      child: const Center(
        child: Icon(
          Icons.person_outline,
          size: 13,
          color: AppColors.surface,
        ),
      ),
    );
  }
}

class _HomeAvatarFallback extends StatelessWidget {
  const _HomeAvatarFallback();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Icon(
        Icons.person_outline,
        size: 24,
        color: AppColors.surface,
      ),
    );
  }
}

class _MandiPricesCard extends StatelessWidget {
  final List<Map<String, dynamic>> prices;

  const _MandiPricesCard({required this.prices});

  @override
  Widget build(BuildContext context) {
    final visiblePrices = prices.take(3).toList();
    if (visiblePrices.isEmpty) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      decoration: BoxDecoration(
        color: AppColors.primary,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(
                    Icons.trending_up,
                    size: 16,
                    color: AppColors.surface,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'Mandi Prices Today',
                    style: AppTextStyles.h5.copyWith(
                      fontSize: 14,
                      color: AppColors.surface,
                    ),
                  ),
                ],
              ),
              Text(
                'Live · Mandya',
                style: AppTextStyles.caption.copyWith(
                  color: AppColors.textOnPrimaryMuted,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              ...visiblePrices.asMap().entries.expand((entry) {
                final index = entry.key;
                final price = entry.value;
                return [
                  Expanded(child: _MandiPriceTile(price: price)),
                  if (index < visiblePrices.length - 1)
                    const SizedBox(width: 10),
                ];
              }),
            ],
          ),
        ],
      ),
    );
  }
}

class _MandiPriceTile extends StatelessWidget {
  final Map<String, dynamic> price;

  const _MandiPriceTile({required this.price});

  @override
  Widget build(BuildContext context) {
    final change = (price['change'] as num).toDouble();
    final isUp = change > 0;
    final isDown = change < 0;
    final changeColor = isUp
        ? const Color(0xFF4CAF50)
        : isDown
            ? const Color(0xFFE57373)
            : AppColors.textOnPrimaryMuted;
    final changeIcon = isUp
        ? Icons.trending_up
        : isDown
            ? Icons.trending_down
            : Icons.remove;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.surface.withOpacity(0.15),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            price['name'] as String,
            style: AppTextStyles.caption.copyWith(
              color: AppColors.textOnPrimaryMuted,
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '₹${price['price']}',
            style: AppTextStyles.h4.copyWith(
              color: AppColors.surface,
              fontSize: 18,
            ),
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              Icon(changeIcon, size: 12, color: changeColor),
              const SizedBox(width: 3),
              Text(
                '${isUp ? '+' : ''}${change.toStringAsFixed(1)}%',
                style: AppTextStyles.caption.copyWith(
                  color: changeColor,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ActivityItem extends StatelessWidget {
  final Order order;

  const _ActivityItem({required this.order});

  @override
  Widget build(BuildContext context) {
    final isPayment = order.status == OrderStatus.paid ||
        order.status == OrderStatus.paymentPending;
    final isCluster = order.status == OrderStatus.clustered;
    final title = isPayment
        ? 'Payment confirmed'
        : isCluster
            ? 'Joined ${order.clusterMember?.cluster?.district ?? 'Cluster'} Cluster'
            : order.status == OrderStatus.dispatched ||
                    order.status == OrderStatus.outForDelivery
                ? 'Order dispatched'
                : 'Order placed';
    final subtitle = isCluster
        ? '${order.clusterMember?.cluster?.membersCount ?? 0} farmers  ·  ${order.clusterMember?.cluster?.targetQuantity.toStringAsFixed(0) ?? '0'}${order.clusterMember?.cluster?.unit ?? order.unit} target'
        : '${order.cropName} · ₹${NumberFormat('#,###').format((order.quantity * 840).round())}';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: AppColors.inputBackground,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: AppColors.primary.withOpacity(0.1),
              borderRadius: BorderRadius.circular(19),
            ),
            child: Icon(
              isPayment
                  ? Icons.check_circle_outline
                  : isCluster
                      ? Icons.groups_2_outlined
                      : Icons.local_shipping_outlined,
              color: AppColors.primary,
              size: 18,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTextStyles.body.copyWith(
                    color: AppColors.primary,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTextStyles.caption.copyWith(
                    color: AppColors.textMuted,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
          Text(
            _timeAgo(order.createdAt),
            style: AppTextStyles.caption.copyWith(
              color: AppColors.textMuted,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  String _timeAgo(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inDays >= 1 && diff.inDays < 2) return 'Yesterday';
    if (diff.inDays > 1) return '${diff.inDays}d ago';
    if (diff.inHours > 0) return '${diff.inHours}h ago';
    return '${diff.inMinutes}m ago';
  }
}
