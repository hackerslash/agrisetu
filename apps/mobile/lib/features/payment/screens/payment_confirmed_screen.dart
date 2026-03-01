import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../shared/widgets/app_header.dart';

class PaymentConfirmedScreen extends StatelessWidget {
  final String clusterId;
  final bool allPaid;

  const PaymentConfirmedScreen({
    super.key,
    required this.clusterId,
    required this.allPaid,
  });

  @override
  Widget build(BuildContext context) {
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
                  color: allPaid ? AppColors.successLight : AppColors.infoLight,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Column(
                  children: [
                    Container(
                      width: 64,
                      height: 64,
                      decoration: BoxDecoration(
                        color: allPaid
                            ? AppColors.success.withOpacity(0.2)
                            : AppColors.info.withOpacity(0.2),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        allPaid ? Icons.check_circle : Icons.check,
                        color: allPaid ? AppColors.success : AppColors.info,
                        size: 36,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      allPaid
                          ? 'All Farmers Paid!'
                          : 'Payment Confirmed!',
                      style: AppTextStyles.h3.copyWith(
                        color: allPaid ? AppColors.success : AppColors.info,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      allPaid
                          ? 'Your order has been confirmed. The vendor will start preparing your shipment.'
                          : 'Your payment is in escrow. Waiting for other farmers to pay.',
                      style: AppTextStyles.body.copyWith(
                        color: allPaid
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
                        allPaid
                            ? 'Your order is confirmed and will be dispatched soon.'
                            : 'We\'ll notify you when everyone has paid and the order is confirmed.',
                        style: AppTextStyles.bodySmall,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              if (allPaid)
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton.icon(
                    onPressed: () => context.go('/delivery/$clusterId'),
                    icon: const Icon(Icons.local_shipping_outlined, size: 20),
                    label: const Text('Track Order'),
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
              if (!allPaid)
                GestureDetector(
                  onTap: () => context.go('/clusters/$clusterId'),
                  child: Text(
                    'View Cluster Status →',
                    style: AppTextStyles.label
                        .copyWith(color: AppColors.primary),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
