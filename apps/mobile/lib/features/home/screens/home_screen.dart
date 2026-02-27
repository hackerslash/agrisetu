import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../shared/widgets/status_badge.dart';
import '../../../shared/widgets/progress_bar.dart';
import '../../../core/providers/auth_provider.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/order_model.dart';

// Providers — backed by real API endpoints

final homeDashboardProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  final api = ref.read(apiClientProvider);
  return api.getDashboard();
});

final homeMandiPricesProvider =
    FutureProvider<List<Map<String, dynamic>>>((ref) async {
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
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good morning 🌱';
    if (hour < 17) return 'Good afternoon ☀️';
    return 'Good evening 🌙';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final farmer = ref.watch(currentFarmerProvider);
    final dashboardAsync = ref.watch(homeDashboardProvider);
    final pricesAsync = ref.watch(homeMandiPricesProvider);

    // Derive orders and clusters from dashboard payload
    final ordersAsync = dashboardAsync.whenData(
      (d) => (d['orders'] as List<dynamic>)
          .map((e) => Order.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
    final clustersAsync = dashboardAsync.whenData(
      (d) => (d['clusters'] as List<dynamic>)
          .map((e) => Cluster.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

    return Scaffold(
      backgroundColor: AppColors.background,
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
                  top: MediaQuery.of(context).padding.top + 16,
                  left: 24,
                  right: 24,
                  bottom: 24,
                ),
                child: Column(
                  children: [
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
                                style: AppTextStyles.body.copyWith(
                                  color: AppColors.textOnPrimaryMuted,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                farmer?.name ?? 'Farmer',
                                style: AppTextStyles.h2.copyWith(
                                  color: AppColors.surface,
                                ),
                              ),
                              if (farmer?.village != null)
                                Text(
                                  '${farmer!.village}, ${farmer.district ?? ''}',
                                  style: AppTextStyles.bodySmall.copyWith(
                                    color: AppColors.textOnPrimaryMuted,
                                  ),
                                ),
                            ],
                          ),
                        ),
                        GestureDetector(
                          onTap: () => context.push('/profile'),
                          child: Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(
                              color: AppColors.surface.withOpacity(0.2),
                              shape: BoxShape.circle,
                            ),
                            child: Center(
                              child: Text(
                                (farmer?.name?.isNotEmpty == true)
                                    ? farmer!.name![0].toUpperCase()
                                    : 'F',
                                style: AppTextStyles.h4.copyWith(
                                  color: AppColors.surface,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),

                    // Stats row — from /farmer/dashboard
                    dashboardAsync.when(
                      data: (dashboard) {
                        final stats =
                            dashboard['stats'] as Map<String, dynamic>;
                        final totalSaved = stats['totalSaved'] as int? ?? 0;
                        final ordersPlaced =
                            stats['ordersPlaced'] as int? ?? 0;
                        final delivered = stats['delivered'] as int? ?? 0;
                        final co2Saved = stats['co2Saved'] as int? ?? 0;
                        return Row(
                          children: [
                            _StatCard(
                              label: 'TOTAL SAVED',
                              value:
                                  '₹${NumberFormat('#,###').format(totalSaved)}',
                              sub: 'from bulk orders',
                            ),
                            const SizedBox(width: 12),
                            _StatCard(
                              label: 'ORDERS PLACED',
                              value: ordersPlaced.toString(),
                              sub: '$delivered delivered',
                            ),
                            const SizedBox(width: 12),
                            _StatCard(
                              label: 'CO₂ SAVED',
                              value: '$co2Saved kg',
                              sub: 'via joint ordering',
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
                          _SectionHeader(
                            title: '🌾 Your Cluster · ${myCluster.district ?? 'District'}',
                            linkText: 'View →',
                            onTap: () =>
                                context.push('/clusters/${myCluster.id}'),
                          ),
                          const SizedBox(height: 12),
                          _ClusterCard(cluster: myCluster),
                          const SizedBox(height: 20),
                        ],
                      );
                    },
                    loading: () => _shimmerCard(),
                    error: (_, __) => const SizedBox.shrink(),
                  ),

                  // Mandi Prices Today — from /farmer/mandi-prices
                  _SectionHeader(
                    title: '📈 Mandi Prices Today',
                    linkText: 'Live prices',
                    onTap: null,
                  ),
                  const SizedBox(height: 12),
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
                          Text('Recent Activity', style: AppTextStyles.h5),
                          const SizedBox(height: 12),
                          ...orders.take(3).map((order) => _ActivityItem(order: order)),
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

  const _StatCard(
      {required this.label, required this.value, required this.sub});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.surface.withOpacity(0.12),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: AppTextStyles.caption.copyWith(
                color: AppColors.textOnPrimaryMuted,
                fontSize: 9,
                letterSpacing: 0.5,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              value,
              style: AppTextStyles.h5.copyWith(
                color: AppColors.surface,
                fontSize: 14,
              ),
            ),
            Text(
              sub,
              style: AppTextStyles.caption.copyWith(
                color: AppColors.textOnPrimaryMuted,
                fontSize: 10,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  final String? linkText;
  final VoidCallback? onTap;

  const _SectionHeader(
      {required this.title, this.linkText, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(title, style: AppTextStyles.h5),
        if (linkText != null)
          GestureDetector(
            onTap: onTap,
            child: Text(
              linkText!,
              style: AppTextStyles.bodySmall.copyWith(color: AppColors.primary),
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
    final statusSteps = ['Ordered', 'Clustered', 'Payment', 'In Transit'];
    final stepIndex = () {
      switch (order.status) {
        case OrderStatus.pending:
          return 0;
        case OrderStatus.clustered:
          return 1;
        case OrderStatus.paymentPending:
        case OrderStatus.paid:
          return 2;
        case OrderStatus.dispatched:
          return 3;
        default:
          return 3;
      }
    }();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(20),
        boxShadow: const [
          BoxShadow(
            color: Color(0x08000000),
            blurRadius: 8,
            offset: Offset(0, 2),
          ),
        ],
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
                    Text(order.cropName, style: AppTextStyles.h5),
                    Text(
                      '${order.quantity.toStringAsFixed(0)} ${order.unit}',
                      style: AppTextStyles.bodySmall,
                    ),
                  ],
                ),
              ),
              StatusBadge.fromOrderStatus(order.status),
            ],
          ),
          const SizedBox(height: 16),

          // Progress track
          Row(
            children: List.generate(statusSteps.length, (i) {
              final isCompleted = i <= stepIndex;
              return Expanded(
                child: Row(
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: isCompleted ? AppColors.primary : AppColors.border,
                        shape: BoxShape.circle,
                      ),
                    ),
                    if (i < statusSteps.length - 1)
                      Expanded(
                        child: Container(
                          height: 2,
                          color: i < stepIndex ? AppColors.primary : AppColors.border,
                        ),
                      ),
                  ],
                ),
              );
            }),
          ),
          const SizedBox(height: 8),
          Row(
            children: statusSteps
                .map((s) => Expanded(
                      child: Text(
                        s,
                        style: AppTextStyles.caption.copyWith(fontSize: 10),
                      ),
                    ))
                .toList(),
          ),

          if (cluster != null) ...[
            const SizedBox(height: 16),
            const Divider(height: 1),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                if (cluster.vendor != null)
                  Text(
                    cluster.vendor!.businessName,
                    style: AppTextStyles.bodySmall.copyWith(
                      color: AppColors.primary,
                      fontWeight: FontWeight.w600,
                    ),
                  )
                else
                  Text('Finding vendor…', style: AppTextStyles.bodySmall),
                GestureDetector(
                  onTap: () => context.push('/clusters/${cluster.id}'),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: AppColors.inputBackground,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      'Track Order',
                      style: AppTextStyles.caption.copyWith(
                        color: AppColors.primary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],

          if (order.status == OrderStatus.paymentPending && cluster != null)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: SizedBox(
                width: double.infinity,
                height: 44,
                child: ElevatedButton(
                  onPressed: () => context.push('/payment/${cluster.id}'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    shape: const StadiumBorder(),
                    elevation: 0,
                  ),
                  child: Text('Pay Now', style: AppTextStyles.buttonSmall),
                ),
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
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(20),
        boxShadow: const [
          BoxShadow(
            color: Color(0x08000000),
            blurRadius: 8,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppColors.primary.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.people, color: AppColors.primary, size: 18),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(cluster.cropName, style: AppTextStyles.label),
                    Text(
                      '${cluster.membersCount} farmers joined',
                      style: AppTextStyles.caption,
                    ),
                  ],
                ),
              ),
              StatusBadge.fromClusterStatus(cluster.status),
            ],
          ),
          const SizedBox(height: 14),

          // Member avatars
          Row(
            children: [
              ...List.generate(
                cluster.membersCount.clamp(0, 4),
                (i) => Container(
                  width: 28,
                  height: 28,
                  margin: const EdgeInsets.only(right: 4),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.15 + i * 0.1),
                    shape: BoxShape.circle,
                    border: Border.all(color: AppColors.surface, width: 2),
                  ),
                  child: Center(
                    child: Text(
                      String.fromCharCode(65 + i),
                      style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: AppColors.primary),
                    ),
                  ),
                ),
              ),
              const Spacer(),
              Text(
                '${(cluster.fillPercent * 100).toStringAsFixed(0)}% demand filled',
                style: AppTextStyles.caption.copyWith(color: AppColors.primary),
              ),
            ],
          ),
          const SizedBox(height: 10),

          ClusterProgressBar(value: cluster.fillPercent),
          const SizedBox(height: 6),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '${cluster.currentQuantity.toStringAsFixed(0)} ${cluster.unit} collected',
                style: AppTextStyles.caption,
              ),
              Text(
                '${(cluster.targetQuantity - cluster.currentQuantity).toStringAsFixed(0)} ${cluster.unit} to go',
                style: AppTextStyles.caption.copyWith(color: AppColors.primary),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MandiPricesCard extends StatelessWidget {
  final List<Map<String, dynamic>> prices;

  const _MandiPricesCard({required this.prices});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(20),
        boxShadow: const [
          BoxShadow(
            color: Color(0x08000000),
            blurRadius: 8,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        children: prices.asMap().entries.map((entry) {
          final i = entry.key;
          final p = entry.value;
          final change = (p['change'] as num).toDouble();
          final isUp = change > 0;
          final isFlat = change == 0;

          return Column(
            children: [
              if (i > 0) const Divider(height: 16),
              Row(
                children: [
                  Expanded(
                    child: Text(p['name'] as String, style: AppTextStyles.label),
                  ),
                  Text(
                    '₹${p['price']}/${p['unit']}',
                    style: AppTextStyles.price.copyWith(fontSize: 16),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: isFlat
                          ? AppColors.inputBackground
                          : isUp
                              ? AppColors.successLight
                              : AppColors.errorLight,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      isFlat
                          ? '—'
                          : '${isUp ? '+' : ''}${change.toStringAsFixed(1)}%',
                      style: AppTextStyles.caption.copyWith(
                        color: isFlat
                            ? AppColors.textMuted
                            : isUp
                                ? AppColors.success
                                : AppColors.error,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          );
        }).toList(),
      ),
    );
  }
}

class _ActivityItem extends StatelessWidget {
  final Order order;

  const _ActivityItem({required this.order});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppColors.primary.withOpacity(0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.eco, color: AppColors.primary, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  order.status == OrderStatus.dispatched
                      ? 'Order Dispatched'
                      : order.status == OrderStatus.clustered
                          ? 'Joined Cluster'
                          : 'Order Placed',
                  style: AppTextStyles.label,
                ),
                Text(
                  '${order.cropName} · ${order.quantity.toStringAsFixed(0)} ${order.unit}',
                  style: AppTextStyles.caption,
                ),
              ],
            ),
          ),
          Text(
            _timeAgo(order.createdAt),
            style: AppTextStyles.caption,
          ),
        ],
      ),
    );
  }

  String _timeAgo(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inDays > 0) return '${diff.inDays}d ago';
    if (diff.inHours > 0) return '${diff.inHours}h ago';
    return '${diff.inMinutes}m ago';
  }
}
