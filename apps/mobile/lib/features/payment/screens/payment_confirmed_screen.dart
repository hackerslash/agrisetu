import 'package:flutter/material.dart';
import '../../../../l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/models/order_model.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../shared/widgets/app_header.dart';
import '../../clusters/screens/cluster_detail_screen.dart';

class PaymentConfirmedScreen extends ConsumerStatefulWidget {
  final String clusterId;
  final bool allPaid;

  PaymentConfirmedScreen({
    super.key,
    required this.clusterId,
    required this.allPaid,
  });

  @override
  ConsumerState<PaymentConfirmedScreen> createState() =>
      _PaymentConfirmedScreenState();
}

class _PaymentConfirmedScreenState
    extends ConsumerState<PaymentConfirmedScreen> {
  bool _navigatedToFailed = false;

  bool _isPaymentTimedOut(Cluster cluster) {
    if (cluster.status == ClusterStatus.failed) return true;
    if (cluster.status != ClusterStatus.payment) return false;
    final deadline = cluster.paymentDeadlineAt;
    return deadline != null && !deadline.isAfter(DateTime.now());
  }

  void _goToFailedScreen() {
    if (!mounted || _navigatedToFailed) return;
    _navigatedToFailed = true;
    context.go('/payment-failed/${widget.clusterId}');
  }

  @override
  Widget build(BuildContext context) {
    final clusterAsync = ref.watch(clusterDetailProvider(widget.clusterId));
    clusterAsync.whenData((cluster) {
      if (_isPaymentTimedOut(cluster)) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          _goToFailedScreen();
        });
      }
    });

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(
        title: 'Payment',
        onBack: () => context.go('/home'),
        trailing: const Icon(
          Icons.check_circle_outline,
          color: AppColors.surface,
          size: 24,
        ),
      ),
      body: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const SizedBox(height: 24),

              // Success banner
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: widget.allPaid
                      ? AppColors.successLight
                      : AppColors.infoLight,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Column(
                  children: [
                    Container(
                      width: 64,
                      height: 64,
                      decoration: BoxDecoration(
                        color: widget.allPaid
                            ? AppColors.success.withOpacity(0.2)
                            : AppColors.info.withOpacity(0.2),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        widget.allPaid ? Icons.check_circle : Icons.check,
                        color:
                            widget.allPaid ? AppColors.success : AppColors.info,
                        size: 36,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      widget.allPaid
                          ? 'All Farmers Paid!'
                          : 'Payment Confirmed!',
                      style: AppTextStyles.h3.copyWith(
                        color:
                            widget.allPaid ? AppColors.success : AppColors.info,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      widget.allPaid
                          ? 'Your order has been confirmed. The vendor will start preparing your shipment.'
                          : 'Your payment is in escrow. Waiting for other farmers to pay.',
                      style: AppTextStyles.body.copyWith(
                        color: widget.allPaid
                            ? AppColors.success.withOpacity(0.7)
                            : AppColors.info.withOpacity(0.7),
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // Cluster card
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.inputBackground,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.people,
                        color: AppColors.primary, size: 20),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        widget.allPaid
                            ? 'Your order is confirmed and will be dispatched soon.'
                            : 'We\'ll notify you when everyone has paid and the order is confirmed.',
                        style: AppTextStyles.bodySmall,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              if (widget.allPaid)
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton.icon(
                    onPressed: () =>
                        context.go('/delivery/${widget.clusterId}'),
                    icon: const Icon(Icons.local_shipping_outlined, size: 20),
                    label: Text(AppLocalizations.of(context)!.trackOrder),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      shape: const StadiumBorder(),
                      elevation: 0,
                      textStyle: AppTextStyles.button,
                    ),
                  ),
                )
              else
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: OutlinedButton(
                    onPressed: () => context.go('/home'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.primary,
                      side: const BorderSide(
                          color: AppColors.primary, width: 1.5),
                      shape: const StadiumBorder(),
                    ),
                    child: Text(
                      'Back to Home',
                      style: AppTextStyles.buttonSmall
                          .copyWith(color: AppColors.primary),
                    ),
                  ),
                ),
              const SizedBox(height: 16),
              if (!widget.allPaid)
                GestureDetector(
                  onTap: () => context.go('/clusters/${widget.clusterId}'),
                  child: Text(
                    'View Cluster Status →',
                    style:
                        AppTextStyles.label.copyWith(color: AppColors.primary),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
