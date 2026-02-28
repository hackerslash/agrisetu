import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../shared/widgets/app_header.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/order_model.dart';
import '../../clusters/screens/cluster_detail_screen.dart';

final deliveryProvider =
    FutureProvider.autoDispose.family<Delivery, String>((ref, clusterId) async {
  final timer = Timer.periodic(const Duration(seconds: 6), (_) {
    ref.invalidateSelf();
  });
  ref.onDispose(timer.cancel);

  final api = ref.read(apiClientProvider);
  final data = await api.getDelivery(clusterId);
  return Delivery.fromJson(data);
});

class DeliveryTrackingScreen extends ConsumerStatefulWidget {
  final String clusterId;

  const DeliveryTrackingScreen({super.key, required this.clusterId});

  @override
  ConsumerState<DeliveryTrackingScreen> createState() =>
      _DeliveryTrackingScreenState();
}

class _DeliveryTrackingScreenState
    extends ConsumerState<DeliveryTrackingScreen> {
  bool _isConfirming = false;

  Future<void> _confirmDelivery() async {
    setState(() => _isConfirming = true);
    try {
      final api = ref.read(apiClientProvider);
      await api.confirmDelivery(widget.clusterId);
      if (mounted) {
        context.go('/delivered/${widget.clusterId}');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _isConfirming = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final deliveryAsync = ref.watch(deliveryProvider(widget.clusterId));
    final clusterAsync = ref.watch(clusterDetailProvider(widget.clusterId));

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(
        title: 'Track Order',
        trailing: const Icon(Icons.more_vert, color: AppColors.surface),
      ),
      body: deliveryAsync.when(
        data: (delivery) => clusterAsync.when(
          data: (cluster) => _buildContent(context, delivery, cluster),
          loading: () => _buildContent(context, delivery, null),
          error: (_, __) => _buildContent(context, delivery, null),
        ),
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.primary),
        ),
        error: (e, _) => Center(child: Text(e.toString())),
      ),
    );
  }

  Widget _buildContent(
      BuildContext context, Delivery delivery, Cluster? cluster) {
    // currentStep used implicitly by timeline rendering below

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: () async {
        ref.invalidate(deliveryProvider(widget.clusterId));
        ref.invalidate(clusterDetailProvider(widget.clusterId));
      },
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Order status card
            Container(
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
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppColors.surface.withOpacity(0.15),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          'Order #AGS-${delivery.id.substring(0, 8).toUpperCase()}',
                          style: AppTextStyles.caption
                              .copyWith(color: AppColors.surface),
                        ),
                      ),
                      const Spacer(),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppColors.successLight,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          _getStatusLabel(delivery),
                          style: AppTextStyles.caption.copyWith(
                            color: AppColors.success,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    cluster?.cropName ?? 'Your Order',
                    style: AppTextStyles.h3.copyWith(color: AppColors.surface),
                  ),
                  if (cluster?.vendor != null)
                    Text(
                      cluster!.vendor!.businessName,
                      style: AppTextStyles.body
                          .copyWith(color: AppColors.textOnPrimaryMuted),
                    ),
                  const SizedBox(height: 12),
                  if (delivery.trackingSteps.isNotEmpty) ...[
                    Row(
                      children: [
                        const Icon(Icons.location_on,
                            color: AppColors.surface, size: 16),
                        const SizedBox(width: 4),
                        Text(
                          'Arriving Today',
                          style: AppTextStyles.bodySmall
                              .copyWith(color: AppColors.surface),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 20),

            Text('Order Timeline', style: AppTextStyles.h5),
            const SizedBox(height: 12),

            // Timeline
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.cardBackground,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                children: delivery.trackingSteps.asMap().entries.map((entry) {
                  final i = entry.key;
                  final step = entry.value;
                  final isLast = i == delivery.trackingSteps.length - 1;
                  return _TimelineStep(
                    step: step,
                    isLast: isLast,
                  );
                }).toList(),
              ),
            ),
            const SizedBox(height: 20),

            // Confirm delivery button
            if (delivery.confirmedAt == null)
              SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton.icon(
                  onPressed: _isConfirming ? null : _confirmDelivery,
                  icon: _isConfirming
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: AppColors.surface,
                          ),
                        )
                      : const Icon(Icons.check_circle_outline, size: 20),
                  label: Text(
                    _isConfirming ? 'Confirming…' : 'Confirm Delivery Received',
                    style: AppTextStyles.button,
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    shape: const StadiumBorder(),
                    elevation: 0,
                  ),
                ),
              )
            else
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.successLight,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.check_circle,
                        color: AppColors.success, size: 20),
                    const SizedBox(width: 8),
                    Text(
                      'Delivery Confirmed!',
                      style: AppTextStyles.label
                          .copyWith(color: AppColors.success),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 20),

            // Impact card
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AppColors.inputBackground,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Your Impact This Order', style: AppTextStyles.h5),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      _ImpactStat(label: 'Saved', value: '₹800'),
                      _ImpactStat(label: 'CO₂ Saved', value: '12 kg'),
                      _ImpactStat(label: 'Waste', value: '0%'),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Dispute row
            GestureDetector(
              onTap: () {},
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.inputBackground,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.flag_outlined,
                        size: 18, color: AppColors.error),
                    const SizedBox(width: 8),
                    Text(
                      'Raise a dispute',
                      style:
                          AppTextStyles.body.copyWith(color: AppColors.error),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 80),
          ],
        ),
      ),
    );
  }

  String _getStatusLabel(Delivery delivery) {
    final inProgress =
        delivery.trackingSteps.where((s) => s.isInProgress).firstOrNull;
    if (inProgress != null) return inProgress.step;
    if (delivery.confirmedAt != null) return 'Delivered';
    return 'Processing';
  }
}

class _TimelineStep extends StatelessWidget {
  final TrackingStep step;
  final bool isLast;

  const _TimelineStep({required this.step, required this.isLast});

  @override
  Widget build(BuildContext context) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 32,
            child: Column(
              children: [
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    color: step.isCompleted
                        ? AppColors.primary
                        : step.isInProgress
                            ? AppColors.primary.withOpacity(0.3)
                            : AppColors.border,
                    shape: BoxShape.circle,
                  ),
                  child: step.isCompleted
                      ? const Icon(Icons.check,
                          color: AppColors.surface, size: 16)
                      : step.isInProgress
                          ? Container(
                              margin: const EdgeInsets.all(5),
                              decoration: const BoxDecoration(
                                color: AppColors.primary,
                                shape: BoxShape.circle,
                              ),
                            )
                          : null,
                ),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 2,
                      color: step.isCompleted
                          ? AppColors.primary
                          : AppColors.border,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    step.step,
                    style: AppTextStyles.label.copyWith(
                      color: step.isCompleted || step.isInProgress
                          ? AppColors.textPrimary
                          : AppColors.textMuted,
                    ),
                  ),
                  if (step.timestamp != null)
                    Text(
                      _formatTimestamp(step.timestamp!),
                      style: AppTextStyles.caption,
                    )
                  else if (step.isInProgress)
                    Text(
                      'In progress',
                      style: AppTextStyles.caption
                          .copyWith(color: AppColors.primary),
                    )
                  else
                    Text(
                      'Pending',
                      style: AppTextStyles.caption,
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _formatTimestamp(DateTime dt) {
    final months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    final h = dt.hour > 12 ? dt.hour - 12 : dt.hour;
    final ampm = dt.hour >= 12 ? 'PM' : 'AM';
    return '${months[dt.month - 1]} ${dt.day} · $h:${dt.minute.toString().padLeft(2, '0')} $ampm';
  }
}

class _ImpactStat extends StatelessWidget {
  final String label;
  final String value;

  const _ImpactStat({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: AppTextStyles.h5.copyWith(color: AppColors.primary),
          ),
          Text(label, style: AppTextStyles.caption),
        ],
      ),
    );
  }
}
