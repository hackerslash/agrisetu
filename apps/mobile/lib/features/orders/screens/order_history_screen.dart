import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../shared/widgets/app_header.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/order_model.dart';
import '../widgets/order_summary_card.dart';

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
        showBack: true,
        onBack: () {
          if (context.canPop()) {
            context.pop();
          } else {
            context.go('/home');
          }
        },
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
                onPressed: () => context.push('/voice'),
                icon: const Icon(Icons.mic, size: 20),
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
                    itemBuilder: (_, i) => OrderSummaryCard(
                      order: orders[i],
                      onTap: () => context.push('/orders/${orders[i].id}'),
                    ),
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
