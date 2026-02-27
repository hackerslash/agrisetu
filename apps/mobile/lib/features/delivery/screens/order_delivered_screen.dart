import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/constants/app_constants.dart';
import '../../clusters/screens/cluster_detail_screen.dart';

class OrderDeliveredScreen extends ConsumerStatefulWidget {
  final String clusterId;

  const OrderDeliveredScreen({super.key, required this.clusterId});

  @override
  ConsumerState<OrderDeliveredScreen> createState() =>
      _OrderDeliveredScreenState();
}

class _OrderDeliveredScreenState extends ConsumerState<OrderDeliveredScreen> {
  int _rating = 0;
  final Set<String> _selectedTags = {};
  final _commentCtrl = TextEditingController();
  bool _isSubmitting = false;
  bool _ratingSubmitted = false;

  @override
  void dispose() {
    _commentCtrl.dispose();
    super.dispose();
  }

  Future<void> _submitRating() async {
    if (_rating == 0) return;
    setState(() => _isSubmitting = true);
    try {
      // Use already-loaded cluster from provider — no extra API call needed
      final cluster =
          ref.read(clusterDetailProvider(widget.clusterId)).valueOrNull;
      final vendorId = cluster?.vendorId;
      if (vendorId == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
                content: Text(
                    'Vendor information not available. Please try again later.')),
          );
        }
        return;
      }

      await ref.read(apiClientProvider).submitRating({
        'vendorId': vendorId,
        'clusterId': widget.clusterId,
        'score': _rating,
        'tags': _selectedTags.toList(),
        'comment': _commentCtrl.text.trim().isNotEmpty
            ? _commentCtrl.text.trim()
            : null,
      });
      setState(() => _ratingSubmitted = true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final clusterAsync =
        ref.watch(clusterDetailProvider(widget.clusterId));

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            children: [
              // Header
              Row(
                children: [
                  GestureDetector(
                    onTap: () => context.go('/orders'),
                    child: const Icon(Icons.arrow_back,
                        color: AppColors.primary),
                  ),
                  const Spacer(),
                  Text('Order Delivered', style: AppTextStyles.h3),
                  const Spacer(),
                  const SizedBox(width: 24),
                ],
              ),
              const SizedBox(height: 24),

              // Status card
              clusterAsync.when(
                data: (cluster) => Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: AppColors.inputBackground,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.eco,
                              color: AppColors.primary, size: 22),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              cluster.cropName,
                              style: AppTextStyles.h5,
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: AppColors.successLight,
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text(
                              '✓ Delivered',
                              style: AppTextStyles.caption.copyWith(
                                color: AppColors.success,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                      if (cluster.vendor != null) ...[
                        const SizedBox(height: 8),
                        Text(
                          cluster.vendor!.businessName,
                          style: AppTextStyles.bodySmall,
                        ),
                      ],
                    ],
                  ),
                ),
                loading: () => const SizedBox(height: 80),
                error: (_, __) => const SizedBox.shrink(),
              ),
              const SizedBox(height: 20),

              // Rating card
              if (!_ratingSubmitted)
                Container(
                  padding: const EdgeInsets.all(20),
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
                      Text('Rate Your Experience',
                          style: AppTextStyles.h5),
                      const SizedBox(height: 4),
                      Text(
                        'Help other farmers make better choices',
                        style: AppTextStyles.caption,
                      ),
                      const SizedBox(height: 16),

                      // Stars
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: List.generate(
                          5,
                          (i) => GestureDetector(
                            onTap: () => setState(() => _rating = i + 1),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 6),
                              child: Icon(
                                i < _rating
                                    ? Icons.star
                                    : Icons.star_border,
                                color: i < _rating
                                    ? const Color(0xFFFBBF24)
                                    : AppColors.textMuted,
                                size: 36,
                              ),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),

                      // Rating tags
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children:
                            AppConstants.ratingTags.take(6).map((tag) {
                          final isSelected =
                              _selectedTags.contains(tag);
                          return GestureDetector(
                            onTap: () {
                              setState(() {
                                if (isSelected) {
                                  _selectedTags.remove(tag);
                                } else {
                                  _selectedTags.add(tag);
                                }
                              });
                            },
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 12, vertical: 7),
                              decoration: BoxDecoration(
                                color: isSelected
                                    ? AppColors.primary
                                    : AppColors.inputBackground,
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Text(
                                tag,
                                style: AppTextStyles.bodySmall.copyWith(
                                  color: isSelected
                                      ? AppColors.surface
                                      : AppColors.textPrimary,
                                  fontWeight: isSelected
                                      ? FontWeight.w600
                                      : FontWeight.w400,
                                ),
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                      const SizedBox(height: 16),

                      SizedBox(
                        width: double.infinity,
                        height: 48,
                        child: ElevatedButton(
                          onPressed: (_rating == 0 || _isSubmitting)
                              ? null
                              : _submitRating,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.primary,
                            disabledBackgroundColor:
                                AppColors.primary.withOpacity(0.4),
                            shape: const StadiumBorder(),
                            elevation: 0,
                          ),
                          child: _isSubmitting
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: AppColors.surface,
                                  ),
                                )
                              : Text(
                                  'Submit Rating',
                                  style: AppTextStyles.button,
                                ),
                        ),
                      ),
                    ],
                  ),
                )
              else
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: AppColors.successLight,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Column(
                    children: [
                      const Icon(Icons.check_circle,
                          color: AppColors.success, size: 40),
                      const SizedBox(height: 8),
                      Text(
                        'Rating Submitted!',
                        style: AppTextStyles.h5
                            .copyWith(color: AppColors.success),
                      ),
                      Text(
                        'Thank you for helping the community.',
                        style: AppTextStyles.bodySmall,
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
                    Text('Your Impact This Order',
                        style: AppTextStyles.h5),
                    const SizedBox(height: 16),
                    Row(
                      children: const [
                        _ImpactStat(label: 'Saved', value: '₹800'),
                        _ImpactStat(
                            label: 'CO₂ Saved', value: '12 kg'),
                        _ImpactStat(label: 'Waste', value: '0%'),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

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
                        style: AppTextStyles.body
                            .copyWith(color: AppColors.error),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 80),
            ],
          ),
        ),
      ),
    );
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
            style:
                AppTextStyles.h5.copyWith(color: AppColors.primary),
          ),
          Text(label, style: AppTextStyles.caption),
        ],
      ),
    );
  }
}
