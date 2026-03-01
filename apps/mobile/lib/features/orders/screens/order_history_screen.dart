import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../shared/widgets/app_header.dart';
import '../../../shared/widgets/status_badge.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/order_model.dart';

final allOrdersProvider = FutureProvider.autoDispose<List<Order>>((ref) async {
  final timer = Timer.periodic(const Duration(seconds: 8), (_) {
    ref.invalidateSelf();
  });
  ref.onDispose(timer.cancel);

  final api = ref.read(apiClientProvider);
  final data = await api.getOrders();
  return data.map((e) => Order.fromJson(e as Map<String, dynamic>)).toList();
});

class OrderHistoryScreen extends ConsumerWidget {
  const OrderHistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ordersAsync = ref.watch(allOrdersProvider);
    final headerTrailing = ordersAsync.maybeWhen(
      data: (orders) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
        decoration: BoxDecoration(
          color: AppColors.surface.withOpacity(0.15),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          '${orders.length} total',
          style: AppTextStyles.bodySmall.copyWith(color: AppColors.surface),
        ),
      ),
      orElse: () => const SizedBox.shrink(),
    );

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(
        title: 'My Orders',
        showBack: false,
        trailing: headerTrailing,
      ),
      body: Column(
        children: [
          // New Order FAB
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
            child: SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton.icon(
                onPressed: () => context.push('/orders/new'),
                icon: const Icon(Icons.add, size: 20),
                label: const Text('Place New Order'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  shape: const StadiumBorder(),
                  elevation: 0,
                  textStyle: AppTextStyles.button,
                ),
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Orders list
          Expanded(
            child: ordersAsync.when(
              data: (orders) {
                if (orders.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.receipt_long_outlined,
                            size: 60, color: AppColors.textMuted),
                        const SizedBox(height: 16),
                        Text('No orders yet',
                            style: AppTextStyles.h5
                                .copyWith(color: AppColors.textMuted)),
                        const SizedBox(height: 8),
                        Text('Place your first order to get started',
                            style: AppTextStyles.body
                                .copyWith(color: AppColors.textMuted)),
                      ],
                    ),
                  );
                }

                return RefreshIndicator(
                  color: AppColors.primary,
                  onRefresh: () async => ref.invalidate(allOrdersProvider),
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 80),
                    itemCount: orders.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (_, i) => _OrderCard(order: orders[i]),
                  ),
                );
              },
              loading: () => const Center(
                child: CircularProgressIndicator(color: AppColors.primary),
              ),
              error: (e, _) => Center(
                child: Text(e.toString(),
                    style: AppTextStyles.body
                        .copyWith(color: AppColors.textMuted)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  final Order order;

  const _OrderCard({required this.order});

  @override
  Widget build(BuildContext context) {
    final cluster = order.clusterMember?.cluster;

    return GestureDetector(
      onTap: () => context.push('/orders/${order.id}'),
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
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child:
                      const Icon(Icons.eco, color: AppColors.primary, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(order.cropName, style: AppTextStyles.label),
                      Text(
                        '#${order.id.substring(0, 8).toUpperCase()}',
                        style: AppTextStyles.caption,
                      ),
                    ],
                  ),
                ),
                StatusBadge.fromOrderStatus(order.status),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              '${order.quantity.toStringAsFixed(0)} ${order.unit}',
              style:
                  AppTextStyles.body.copyWith(color: AppColors.textSecondary),
            ),
            const SizedBox(height: 4),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                if (cluster != null)
                  Text(
                    '${cluster.membersCount} farmers · ${cluster.district ?? ''}',
                    style: AppTextStyles.caption,
                  )
                else
                  Text('Looking for cluster…', style: AppTextStyles.caption),
                Row(
                  children: [
                    const Icon(Icons.arrow_forward_ios,
                        size: 12, color: AppColors.textMuted),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
