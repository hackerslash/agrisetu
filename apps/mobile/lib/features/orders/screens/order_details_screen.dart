import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../shared/widgets/app_header.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/order_model.dart';
import '../../home/screens/home_screen.dart';

final orderDetailProvider =
    FutureProvider.autoDispose.family<Order, String>((ref, id) async {
  final timer = Timer.periodic(const Duration(seconds: 6), (_) {
    ref.invalidateSelf();
  });
  ref.onDispose(timer.cancel);

  final api = ref.read(apiClientProvider);
  final data = await api.getOrder(id);
  return Order.fromJson(data);
});

class OrderDetailsScreen extends ConsumerStatefulWidget {
  final String orderId;
  final Map<String, dynamic>? prefill;

  const OrderDetailsScreen({
    super.key,
    required this.orderId,
    this.prefill,
  });

  @override
  ConsumerState<OrderDetailsScreen> createState() => _OrderDetailsScreenState();
}

class _OrderDetailsScreenState extends ConsumerState<OrderDetailsScreen> {
  final _cropCtrl = TextEditingController();
  final _quantityCtrl = TextEditingController();
  final _unitCtrl = TextEditingController();
  String? _voiceTranscript;
  double? _voiceConfidence;
  String? _matchedGigLabel;
  String? _extractionSource;
  bool _isCreating = false;
  bool _voting = false;

  @override
  void initState() {
    super.initState();
    if (widget.orderId == 'new') {
      _cropCtrl.text = widget.prefill?['crop'] as String? ?? '';
      _quantityCtrl.text = widget.prefill?['quantity']?.toString() ?? '';
      _unitCtrl.text = widget.prefill?['unit'] as String? ?? 'kg';
      _voiceTranscript = widget.prefill?['transcript'] as String?;
      _voiceConfidence = (widget.prefill?['confidence'] as num?)?.toDouble();
      _matchedGigLabel = widget.prefill?['matchedGigLabel'] as String?;
      _extractionSource = widget.prefill?['extractionSource'] as String?;
    }
  }

  @override
  void dispose() {
    _cropCtrl.dispose();
    _quantityCtrl.dispose();
    _unitCtrl.dispose();
    super.dispose();
  }

  Future<void> _createOrder() async {
    if (_cropCtrl.text.isEmpty || _quantityCtrl.text.isEmpty) return;
    setState(() => _isCreating = true);
    try {
      final api = ref.read(apiClientProvider);
      final createRes = await api.createOrder({
        'cropName': _cropCtrl.text.trim(),
        'quantity': double.parse(_quantityCtrl.text),
        'unit': _unitCtrl.text.trim(),
      });

      final orderData = (createRes['order'] is Map<String, dynamic>)
          ? createRes['order'] as Map<String, dynamic>
          : createRes;
      final orderId = orderData['id'] as String?;
      if (orderId == null) {
        throw FormatException('Order creation failed: missing order ID');
      }

      final options = await api.getOrderClusterOptions(orderId);
      if (options.isEmpty) {
        final assigned =
            await api.assignOrderToCluster(orderId, createNew: true);
        ref.invalidate(homeDashboardProvider);
        final clusterId = (assigned['clusterMember']
            as Map<String, dynamic>?)?['cluster']?['id'] as String?;
        if (mounted) {
          if (clusterId != null) {
            context.go('/clusters/$clusterId');
          } else {
            context.go('/clusters');
          }
        }
        return;
      }

      ref.invalidate(homeDashboardProvider);
      if (mounted) {
        context.go('/clusters', extra: {
          'orderId': orderId,
          'cropName': orderData['cropName'] as String? ?? _cropCtrl.text.trim(),
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _isCreating = false);
    }
  }

  Future<void> _vote(String clusterId, String bidId) async {
    setState(() => _voting = true);
    try {
      await ref.read(apiClientProvider).voteOnBid(clusterId, bidId);
      ref.invalidate(orderDetailProvider(widget.orderId));
      ref.invalidate(homeDashboardProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _voting = false);
    }
  }

  void _showRatingSheet(
      BuildContext context, String clusterId, String vendorId) {
    int score = 0;
    final List<String> selectedTags = [];
    final commentCtrl = TextEditingController();
    bool submitting = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.background,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: EdgeInsets.only(
            left: 24,
            right: 24,
            top: 20,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 32,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.divider,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Text('Rate Your Experience', style: AppTextStyles.h4),
              const SizedBox(height: 4),
              Text('How was your vendor?', style: AppTextStyles.caption),
              const SizedBox(height: 20),
              // Stars
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                    5,
                    (i) => GestureDetector(
                          onTap: () => setSheetState(() => score = i + 1),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 4),
                            child: Icon(
                              i < score
                                  ? Icons.star_rounded
                                  : Icons.star_outline_rounded,
                              color: i < score
                                  ? const Color(0xFFE69A28)
                                  : AppColors.textMuted,
                              size: 42,
                            ),
                          ),
                        )),
              ),
              const SizedBox(height: 20),
              Text('Quick tags', style: AppTextStyles.labelSmall),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  'Good Quality',
                  'On Time',
                  'Fair Price',
                  'Recommended',
                  'Fresh',
                ].map((tag) {
                  final selected = selectedTags.contains(tag);
                  return GestureDetector(
                    onTap: () => setSheetState(() => selected
                        ? selectedTags.remove(tag)
                        : selectedTags.add(tag)),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 8),
                      decoration: BoxDecoration(
                        color: selected
                            ? AppColors.primary
                            : AppColors.inputBackground,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        tag,
                        style: AppTextStyles.bodySmall.copyWith(
                          color:
                              selected ? Colors.white : AppColors.textSecondary,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: commentCtrl,
                decoration: const InputDecoration(
                  hintText: 'Add a comment (optional)',
                ),
                maxLines: 3,
                style: AppTextStyles.body,
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  onPressed: score == 0 || submitting
                      ? null
                      : () async {
                          setSheetState(() => submitting = true);
                          try {
                            await ref.read(apiClientProvider).submitRating({
                              'vendorId': vendorId,
                              'clusterId': clusterId,
                              'score': score,
                              'tags': selectedTags,
                              'comment': commentCtrl.text.trim().isEmpty
                                  ? null
                                  : commentCtrl.text.trim(),
                            });
                            if (!context.mounted) return;
                            if (ctx.mounted) Navigator.pop(ctx);
                            ref.invalidate(orderDetailProvider(widget.orderId));
                            ref.invalidate(homeDashboardProvider);
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                  content: Text('Thank you for your rating!')),
                            );
                          } catch (e) {
                            setSheetState(() => submitting = false);
                            if (ctx.mounted) {
                              ScaffoldMessenger.of(ctx).showSnackBar(
                                  SnackBar(content: Text(e.toString())));
                            }
                          }
                        },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    shape: const StadiumBorder(),
                    elevation: 0,
                  ),
                  child: submitting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                              color: Colors.white, strokeWidth: 2),
                        )
                      : Text('Submit Rating', style: AppTextStyles.button),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (widget.orderId == 'new') {
      return _buildNewOrderForm(context);
    }

    final orderAsync = ref.watch(orderDetailProvider(widget.orderId));

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(title: 'Order Details'),
      body: orderAsync.when(
        data: (order) => _buildOrderDetail(context, order),
        loading: () => const Center(
            child: CircularProgressIndicator(color: AppColors.primary)),
        error: (e, _) => Center(child: Text(e.toString())),
      ),
    );
  }

  Widget _buildOrderDetail(BuildContext context, Order order) {
    final cluster = order.clusterMember?.cluster;
    final hasVoted = cluster?.bids.any((b) => b.currentFarmerVoted) == true;
    final hasRated = cluster?.ratings.isNotEmpty == true;
    final existingRating = hasRated ? cluster!.ratings.first : null;
    final hasDeliveryTracking = (order.status == OrderStatus.processing ||
            order.status == OrderStatus.outForDelivery ||
            order.status == OrderStatus.dispatched ||
            order.status == OrderStatus.delivered) &&
        cluster?.delivery != null;

    // Vendor resolved after voting completes (vendorId set on cluster)
    final selectedVendor = cluster?.vendor;
    // Top bid by vote count (used during/after VOTING phase)
    final topBid = (cluster?.bids.isNotEmpty == true)
        ? cluster!.bids.reduce((a, b) => a.votes >= b.votes ? a : b)
        : null;
    final displayVendor = selectedVendor ?? topBid?.vendor;
    final pricePerUnit = topBid?.pricePerUnit ?? 0.0;
    final totalPrice = pricePerUnit * order.quantity;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Status Header Card ────────────────────────────────────────
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
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
                    Text(
                      'Order #${order.id.length > 6 ? order.id.substring(order.id.length - 6).toUpperCase() : order.id.toUpperCase()}',
                      style: AppTextStyles.bodySmall
                          .copyWith(color: AppColors.textOnPrimaryMuted),
                    ),
                    _OrderStatusPill(status: order.status),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  '${order.cropName}  ·  ${order.quantity.toStringAsFixed(0)} ${order.unit}',
                  style:
                      AppTextStyles.h4.copyWith(color: AppColors.textOnPrimary),
                ),
                if (displayVendor != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    displayVendor.businessName,
                    style: AppTextStyles.bodySmall
                        .copyWith(color: AppColors.textOnPrimaryMuted),
                  ),
                ],
                if (order.status == OrderStatus.delivered) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.check_circle_outline,
                            size: 18, color: AppColors.textOnPrimary),
                        const SizedBox(width: 8),
                        Text(
                          'Order delivered successfully',
                          style: AppTextStyles.bodySmall
                              .copyWith(color: AppColors.textOnPrimary),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),

          // ── Order Summary Card ────────────────────────────────────────
          if (pricePerUnit > 0) ...[
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AppColors.inputBackground,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Order Summary', style: AppTextStyles.h5),
                  const SizedBox(height: 14),
                  _SummaryRow(
                    label: 'Unit Price',
                    value: '₹${pricePerUnit.toStringAsFixed(0)}/${order.unit}',
                  ),
                  const SizedBox(height: 10),
                  _SummaryRow(
                    label: 'Quantity',
                    value: '${order.quantity.toStringAsFixed(0)} ${order.unit}',
                  ),
                  const SizedBox(height: 10),
                  const Divider(color: Color(0xFFD4CFC8), height: 1),
                  const SizedBox(height: 10),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Your Total', style: AppTextStyles.h5),
                      Text(
                        '₹${totalPrice.toStringAsFixed(0)}',
                        style:
                            AppTextStyles.h5.copyWith(color: AppColors.primary),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
          ],

          // ── Order Progress Timeline ───────────────────────────────────
          if (!hasDeliveryTracking &&
              order.status != OrderStatus.rejected &&
              order.status != OrderStatus.failed) ...[
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AppColors.inputBackground,
                borderRadius: BorderRadius.circular(20),
              ),
              child: _OrderTimeline(order: order, cluster: cluster),
            ),
            const SizedBox(height: 16),
          ],

          // ── Vendor Selection (VOTING, farmer hasn't voted yet) ────────
          if (cluster?.status == ClusterStatus.voting &&
              !hasVoted &&
              cluster!.bids.isNotEmpty) ...[
            Text('Choose Your Vendor', style: AppTextStyles.h5),
            const SizedBox(height: 4),
            Text('Vote for your preferred supplier',
                style: AppTextStyles.caption),
            const SizedBox(height: 12),
            ...cluster.bids.asMap().entries.map((entry) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _VendorBidCard(
                    bid: entry.value,
                    rank: entry.key + 1,
                    quantity: order.quantity,
                    unit: order.unit,
                    isVoting: _voting,
                    onVote: () => _vote(cluster.id, entry.value.id),
                  ),
                )),
            const SizedBox(height: 16),
          ],

          // ── Voted — waiting for others ────────────────────────────────
          if (cluster?.status == ClusterStatus.voting && hasVoted) ...[
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.inputBackground,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                children: [
                  const Icon(Icons.how_to_vote_outlined,
                      color: AppColors.primary, size: 22),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Vote submitted!', style: AppTextStyles.label),
                        Text('Waiting for other farmers in the cluster to vote',
                            style: AppTextStyles.caption),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
          ],

          // ── Pay Now ───────────────────────────────────────────────────
          if (order.status == OrderStatus.paymentPending &&
              cluster != null) ...[
            SizedBox(
              width: double.infinity,
              height: 56,
              child: ElevatedButton.icon(
                onPressed: () => context.push('/payment/${cluster.id}'),
                icon: const Icon(Icons.lock_outline, size: 20),
                label: Text(
                  totalPrice > 0
                      ? 'Pay ₹${totalPrice.toStringAsFixed(0)} Securely'
                      : 'Pay Now',
                  style: AppTextStyles.button,
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  shape: const StadiumBorder(),
                  elevation: 0,
                ),
              ),
            ),
            const SizedBox(height: 16),
          ],

          // ── Delivery Tracking ─────────────────────────────────────────
          if (hasDeliveryTracking) ...[
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AppColors.inputBackground,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Delivery Tracking', style: AppTextStyles.h5),
                  const SizedBox(height: 16),
                  ...cluster!.delivery!.trackingSteps.map((step) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Row(
                          children: [
                            Icon(
                              step.isCompleted
                                  ? Icons.check_circle
                                  : step.isInProgress
                                      ? Icons.radio_button_checked
                                      : Icons.radio_button_unchecked,
                              size: 20,
                              color: step.isCompleted
                                  ? AppColors.primary
                                  : step.isInProgress
                                      ? const Color(0xFFE69A28)
                                      : AppColors.textMuted,
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                step.step,
                                style: AppTextStyles.body.copyWith(
                                  color: step.isCompleted || step.isInProgress
                                      ? AppColors.textPrimary
                                      : AppColors.textMuted,
                                  fontWeight: step.isInProgress
                                      ? FontWeight.w600
                                      : null,
                                ),
                              ),
                            ),
                          ],
                        ),
                      )),
                ],
              ),
            ),
            const SizedBox(height: 16),
          ],

          // ── Rate Vendor (delivered, not yet rated) ────────────────────
          if (order.status == OrderStatus.delivered &&
              !hasRated &&
              cluster?.vendorId != null) ...[
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AppColors.inputBackground,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Rate Your Experience', style: AppTextStyles.h5),
                  const SizedBox(height: 4),
                  Text(
                    'How was ${displayVendor?.businessName ?? "your vendor"}?',
                    style: AppTextStyles.caption,
                  ),
                  const SizedBox(height: 16),
                  // Preview stars (tappable to open sheet)
                  Row(
                    children: List.generate(
                      5,
                      (i) => GestureDetector(
                        onTap: () => _showRatingSheet(
                          context,
                          cluster!.id,
                          cluster.vendorId!,
                        ),
                        child: Padding(
                          padding: const EdgeInsets.only(right: 6),
                          child: Icon(Icons.star_outline_rounded,
                              size: 36, color: AppColors.textMuted),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: ElevatedButton(
                      onPressed: () => _showRatingSheet(
                          context, cluster!.id, cluster.vendorId!),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        shape: const StadiumBorder(),
                        elevation: 0,
                      ),
                      child: Text('Rate & Review', style: AppTextStyles.button),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
          ],

          // ── Already Rated ─────────────────────────────────────────────
          if (order.status == OrderStatus.delivered &&
              hasRated &&
              existingRating != null) ...[
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AppColors.inputBackground,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Your Rating', style: AppTextStyles.h5),
                  const SizedBox(height: 12),
                  Row(
                    children: List.generate(
                      5,
                      (i) => Icon(
                        i < existingRating.score
                            ? Icons.star_rounded
                            : Icons.star_outline_rounded,
                        color: i < existingRating.score
                            ? const Color(0xFFE69A28)
                            : AppColors.textMuted,
                        size: 28,
                      ),
                    ),
                  ),
                  if (existingRating.tags.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: existingRating.tags
                          .map((tag) => Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 12, vertical: 5),
                                decoration: BoxDecoration(
                                  color: AppColors.primary.withOpacity(0.12),
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: Text(
                                  tag,
                                  style: AppTextStyles.caption
                                      .copyWith(color: AppColors.primary),
                                ),
                              ))
                          .toList(),
                    ),
                  ],
                  if (existingRating.comment != null &&
                      existingRating.comment!.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(existingRating.comment!,
                        style: AppTextStyles.bodySmall),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 16),
          ],

          // ── Impact Card (delivered) ───────────────────────────────────
          if (order.status == OrderStatus.delivered && pricePerUnit > 0) ...[
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AppColors.inputBackground,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Your Impact This Order',
                      style: AppTextStyles.h5.copyWith(fontSize: 14)),
                  const SizedBox(height: 14),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _ImpactStat(
                        value: '₹${(totalPrice * 0.15).toStringAsFixed(0)}',
                        label: 'Saved',
                      ),
                      _ImpactStat(
                        value:
                            '${(order.quantity * 0.012).toStringAsFixed(1)} kg',
                        label: 'CO₂ Saved',
                      ),
                      const _ImpactStat(value: '0%', label: 'Waste'),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
          ],
        ],
      ),
    );
  }

  Widget _buildNewOrderForm(BuildContext context) {
    final units = ['kg', 'quintal', 'ton', 'bag', 'litre'];
    final hasVoiceContext = (_voiceTranscript?.trim().isNotEmpty ?? false) ||
        _matchedGigLabel != null;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(title: 'Confirm Your Order'),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.primary,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Row(
                children: [
                  const Icon(Icons.auto_awesome,
                      color: AppColors.surface, size: 18),
                  const SizedBox(width: 10),
                  Text(
                    hasVoiceContext
                        ? 'AI detected your order details. Please verify.'
                        : 'Enter your order details to continue.',
                    style: AppTextStyles.bodySmall
                        .copyWith(color: AppColors.surface),
                  ),
                ],
              ),
            ),
            if (hasVoiceContext) ...[
              const SizedBox(height: 16),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.inputBackground,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if ((_voiceTranscript ?? '').isNotEmpty) ...[
                      Text('Voice Transcript', style: AppTextStyles.caption),
                      const SizedBox(height: 6),
                      Text(
                        '"${_voiceTranscript!}"',
                        style: AppTextStyles.body.copyWith(
                          color: AppColors.primary,
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                    ],
                    if ((_matchedGigLabel ?? '').isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Text('Matched Gig', style: AppTextStyles.caption),
                      const SizedBox(height: 4),
                      Text(_matchedGigLabel!, style: AppTextStyles.bodySmall),
                    ],
                    if (_voiceConfidence != null ||
                        (_extractionSource ?? '').isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text(
                        [
                          if (_voiceConfidence != null)
                            'Confidence ${(_voiceConfidence! * 100).toStringAsFixed(0)}%',
                          if ((_extractionSource ?? '').isNotEmpty)
                            (_extractionSource ?? '').toUpperCase(),
                        ].join(' · '),
                        style: AppTextStyles.caption,
                      ),
                    ],
                  ],
                ),
              ),
            ],
            const SizedBox(height: 20),
            Container(
              decoration: BoxDecoration(
                color: AppColors.inputBackground,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Column(
                children: [
                  _FormRow(
                    icon: Icons.eco,
                    label: 'Product Name',
                    child: TextField(
                      controller: _cropCtrl,
                      decoration: const InputDecoration(
                        hintText: 'e.g., Tomato Seeds',
                        border: InputBorder.none,
                        contentPadding: EdgeInsets.zero,
                      ),
                      style: AppTextStyles.body,
                    ),
                  ),
                  const Divider(height: 1),
                  _FormRow(
                    icon: Icons.scale,
                    label: 'Quantity',
                    child: Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _quantityCtrl,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                              hintText: '100',
                              border: InputBorder.none,
                              contentPadding: EdgeInsets.zero,
                            ),
                            style: AppTextStyles.body,
                          ),
                        ),
                        DropdownButton<String>(
                          value: _unitCtrl.text,
                          underline: const SizedBox.shrink(),
                          items: units
                              .map((u) => DropdownMenuItem(
                                    value: u,
                                    child: Text(u, style: AppTextStyles.body),
                                  ))
                              .toList(),
                          onChanged: (v) =>
                              setState(() => _unitCtrl.text = v ?? 'kg'),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              height: 56,
              child: ElevatedButton(
                onPressed: _isCreating ? null : _createOrder,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  shape: const StadiumBorder(),
                  elevation: 0,
                ),
                child: _isCreating
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                            strokeWidth: 2.5, color: AppColors.surface),
                      )
                    : Text('Confirm Order', style: AppTextStyles.button),
              ),
            ),
            const SizedBox(height: 12),
            Center(
              child: Text('You can edit details in the next step',
                  style: AppTextStyles.caption),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Order Timeline ─────────────────────────────────────────────────────────

class _TimelineStep {
  final String label;
  final String sublabel;
  final bool done;
  final bool active;

  const _TimelineStep({
    required this.label,
    this.sublabel = '',
    required this.done,
    this.active = false,
  });
}

class _OrderTimeline extends StatelessWidget {
  final Order order;
  final Cluster? cluster;

  const _OrderTimeline({required this.order, required this.cluster});

  List<_TimelineStep> _steps() {
    const doneStatuses = [
      OrderStatus.paymentPending,
      OrderStatus.paid,
      OrderStatus.processing,
      OrderStatus.outForDelivery,
      OrderStatus.dispatched,
      OrderStatus.delivered,
    ];
    const paidStatuses = [
      OrderStatus.paid,
      OrderStatus.processing,
      OrderStatus.outForDelivery,
      OrderStatus.dispatched,
      OrderStatus.delivered,
    ];
    const processingStatuses = [
      OrderStatus.processing,
      OrderStatus.outForDelivery,
      OrderStatus.dispatched,
      OrderStatus.delivered,
    ];
    const dispatchedStatuses = [
      OrderStatus.outForDelivery,
      OrderStatus.dispatched,
      OrderStatus.delivered,
    ];

    final vendor = cluster?.vendor;
    final topBid = (cluster?.bids.isNotEmpty == true)
        ? cluster!.bids.reduce((a, b) => a.votes >= b.votes ? a : b)
        : null;
    final vendorName = vendor?.businessName ?? topBid?.vendor?.businessName;

    return [
      _TimelineStep(
        label: 'Order Placed',
        sublabel: _fmt(order.createdAt),
        done: true,
      ),
      _TimelineStep(
        label: 'Vendor Selected',
        sublabel: doneStatuses.contains(order.status)
            ? vendorName ?? '—'
            : cluster?.status == ClusterStatus.voting
                ? 'Voting in progress…'
                : 'Waiting for farmers',
        done: doneStatuses.contains(order.status),
        active: cluster?.status == ClusterStatus.voting,
      ),
      _TimelineStep(
        label: 'Payment Done',
        done: paidStatuses.contains(order.status),
        active: order.status == OrderStatus.paymentPending,
      ),
      _TimelineStep(
        label: 'Processing',
        done: processingStatuses.contains(order.status),
        active: order.status == OrderStatus.processing,
      ),
      _TimelineStep(
        label: 'Dispatched',
        done: dispatchedStatuses.contains(order.status),
        active: order.status == OrderStatus.outForDelivery ||
            order.status == OrderStatus.dispatched,
      ),
      _TimelineStep(
        label: 'Delivered',
        done: order.status == OrderStatus.delivered,
      ),
    ];
  }

  static String _fmt(DateTime dt) {
    const months = [
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
    return '${dt.day} ${months[dt.month - 1]}';
  }

  @override
  Widget build(BuildContext context) {
    final steps = _steps();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Order Progress', style: AppTextStyles.h5),
        const SizedBox(height: 16),
        for (int i = 0; i < steps.length; i++) ...[
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Column(
                children: [
                  Container(
                    width: 24,
                    height: 24,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: steps[i].done
                          ? AppColors.primary
                          : steps[i].active
                              ? AppColors.primary.withOpacity(0.25)
                              : Colors.transparent,
                      border: Border.all(
                        color: steps[i].done || steps[i].active
                            ? AppColors.primary
                            : AppColors.textMuted.withOpacity(0.4),
                        width: 2,
                      ),
                    ),
                    child: steps[i].done
                        ? const Icon(Icons.check, size: 14, color: Colors.white)
                        : steps[i].active
                            ? Center(
                                child: Container(
                                  width: 8,
                                  height: 8,
                                  decoration: const BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: AppColors.primary,
                                  ),
                                ),
                              )
                            : null,
                  ),
                  if (i < steps.length - 1)
                    Container(
                      width: 2,
                      height: 40,
                      color: steps[i].done
                          ? AppColors.primary.withOpacity(0.4)
                          : AppColors.textMuted.withOpacity(0.15),
                    ),
                ],
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Padding(
                  padding: EdgeInsets.only(
                      top: 2, bottom: i < steps.length - 1 ? 0 : 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        steps[i].label,
                        style: AppTextStyles.label.copyWith(
                          color: steps[i].done
                              ? AppColors.primary
                              : steps[i].active
                                  ? AppColors.textPrimary
                                  : AppColors.textMuted,
                        ),
                      ),
                      if (steps[i].sublabel.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(steps[i].sublabel, style: AppTextStyles.caption),
                      ],
                      SizedBox(height: i < steps.length - 1 ? 18 : 0),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

// ─── Vendor Bid Card ────────────────────────────────────────────────────────

class _VendorBidCard extends StatelessWidget {
  final VendorBid bid;
  final int rank;
  final double quantity;
  final String unit;
  final bool isVoting;
  final VoidCallback onVote;

  const _VendorBidCard({
    required this.bid,
    required this.rank,
    required this.quantity,
    required this.unit,
    required this.isVoting,
    required this.onVote,
  });

  @override
  Widget build(BuildContext context) {
    final vendor = bid.vendor;
    final total = bid.pricePerUnit * quantity;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.inputBackground,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Rank + recommendation badge
          Row(
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.primary.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text('#$rank',
                    style: AppTextStyles.labelSmall
                        .copyWith(color: AppColors.primary)),
              ),
              if (rank == 1 && bid.votes > 0) ...[
                const SizedBox(width: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.primary,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text('Recommended',
                      style: AppTextStyles.labelSmall
                          .copyWith(color: Colors.white)),
                ),
              ],
            ],
          ),
          const SizedBox(height: 12),
          // Vendor info + price
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AppColors.primary.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(22),
                ),
                child: const Icon(Icons.storefront_outlined,
                    size: 22, color: AppColors.primary),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      vendor?.businessName ?? 'Vendor',
                      style: AppTextStyles.label,
                    ),
                    if (vendor?.state != null)
                      Text(vendor!.state!, style: AppTextStyles.caption),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '₹${bid.pricePerUnit.toStringAsFixed(0)}/$unit',
                    style: AppTextStyles.h5.copyWith(color: AppColors.primary),
                  ),
                  Text('Total ₹${total.toStringAsFixed(0)}',
                      style: AppTextStyles.caption),
                ],
              ),
            ],
          ),
          if (bid.votes > 0) ...[
            const SizedBox(height: 12),
            Text(
              '${bid.votes} vote${bid.votes != 1 ? "s" : ""}',
              style: AppTextStyles.labelSmall,
            ),
            const SizedBox(height: 4),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: (bid.votes / 10).clamp(0.0, 1.0),
                backgroundColor: AppColors.cardBackground,
                color: AppColors.primary,
                minHeight: 6,
              ),
            ),
          ],
          if (bid.note != null && bid.note!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(bid.note!,
                style: AppTextStyles.caption
                    .copyWith(fontStyle: FontStyle.italic)),
          ],
          const SizedBox(height: 12),
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
                          color: Colors.white, strokeWidth: 2))
                  : const Icon(Icons.thumb_up_alt_outlined, size: 18),
              label: Text('Vote for this Vendor',
                  style: AppTextStyles.buttonSmall),
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

// ─── Helper Widgets ─────────────────────────────────────────────────────────

class _OrderStatusPill extends StatelessWidget {
  final OrderStatus status;

  const _OrderStatusPill({required this.status});

  @override
  Widget build(BuildContext context) {
    Color bg;
    String label;

    switch (status) {
      case OrderStatus.delivered:
        bg = Colors.white.withOpacity(0.3);
        label = 'Delivered';
        break;
      case OrderStatus.processing:
        bg = const Color(0xFF92400E).withOpacity(0.85);
        label = 'Processing';
        break;
      case OrderStatus.outForDelivery:
        bg = const Color(0xFF1D4ED8).withOpacity(0.85);
        label = 'Dispatched';
        break;
      case OrderStatus.dispatched:
        bg = const Color(0xFFE69A28).withOpacity(0.8);
        label = 'Dispatched';
        break;
      case OrderStatus.paymentPending:
        bg = AppColors.warning.withOpacity(0.8);
        label = 'Pay Now';
        break;
      case OrderStatus.paid:
        bg = Colors.white.withOpacity(0.25);
        label = 'Order Received';
        break;
      case OrderStatus.rejected:
        bg = AppColors.error.withOpacity(0.8);
        label = 'Rejected';
        break;
      default:
        bg = Colors.white.withOpacity(0.2);
        label = status.displayLabel;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(label,
          style: AppTextStyles.caption
              .copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  final String label;
  final String value;

  const _SummaryRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label,
            style: AppTextStyles.body.copyWith(color: AppColors.textMuted)),
        Text(value,
            style: AppTextStyles.label.copyWith(color: AppColors.primary)),
      ],
    );
  }
}

class _ImpactStat extends StatelessWidget {
  final String value;
  final String label;

  const _ImpactStat({required this.value, required this.label});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(value, style: AppTextStyles.h4.copyWith(color: AppColors.primary)),
        const SizedBox(height: 4),
        Text(label, style: AppTextStyles.caption),
      ],
    );
  }
}

class _FormRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final Widget child;

  const _FormRow(
      {required this.icon, required this.label, required this.child});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          Icon(icon, size: 20, color: AppColors.primary),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: AppTextStyles.caption),
                const SizedBox(height: 4),
                child,
              ],
            ),
          ),
        ],
      ),
    );
  }
}
