import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../shared/widgets/app_header.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/order_model.dart';
import '../../../core/providers/auth_provider.dart';
import '../../clusters/screens/cluster_detail_screen.dart';

class PaymentScreen extends ConsumerStatefulWidget {
  final String clusterId;

  const PaymentScreen({super.key, required this.clusterId});

  @override
  ConsumerState<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends ConsumerState<PaymentScreen> {
  bool _isInitiating = false;
  bool _isPaying = false;
  Map<String, dynamic>? _paymentData;
  Timer? _timer;
  int _secondsLeft = 86400; // 24h

  @override
  void initState() {
    super.initState();
    _initiatePayment();
    _startTimer();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _startTimer() {
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (_secondsLeft > 0) {
        setState(() => _secondsLeft--);
      }
    });
  }

  Future<void> _initiatePayment() async {
    setState(() => _isInitiating = true);
    try {
      final api = ref.read(apiClientProvider);
      final data = await api.initiatePayment(widget.clusterId);
      setState(() => _paymentData = data);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _isInitiating = false);
    }
  }

  Future<void> _payNow() async {
    if (_paymentData == null) return;
    setState(() => _isPaying = true);
    try {
      final api = ref.read(apiClientProvider);
      await api.confirmPayment(
        widget.clusterId,
        _paymentData!['upiRef'] as String,
      );
      // Check if all farmers paid by checking cluster status
      final clusterData = await api.getCluster(widget.clusterId);
      final cluster = Cluster.fromJson(clusterData);
      final paidByFarmer = <String, bool>{};
      for (final member in cluster.members) {
        final current = paidByFarmer[member.farmerId] ?? false;
        paidByFarmer[member.farmerId] = current || member.hasPaid;
      }
      final allPaid =
          paidByFarmer.isNotEmpty && paidByFarmer.values.every((paid) => paid);

      if (mounted) {
        context.go(
          '/payment-confirmed/${widget.clusterId}',
          extra: {'allPaid': allPaid},
        );
      }
    } catch (_) {
      if (mounted) {
        context.go('/payment-failed/${widget.clusterId}');
      }
    } finally {
      if (mounted) setState(() => _isPaying = false);
    }
  }

  String _formatDuration() {
    final h = _secondsLeft ~/ 3600;
    final m = (_secondsLeft % 3600) ~/ 60;
    final s = _secondsLeft % 60;
    return '${h.toString().padLeft(2, '0')} : ${m.toString().padLeft(2, '0')} : ${s.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final clusterAsync = ref.watch(clusterDetailProvider(widget.clusterId));
    final farmer = ref.watch(currentFarmerProvider);
    final amount = _paymentData?['amount'];
    final fmt = NumberFormat('#,###');

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(
        title: 'Secure Payment',
        trailing: const Icon(Icons.lock, color: AppColors.surface, size: 22),
      ),
      body: clusterAsync.when(
        data: (cluster) {
          final paidByFarmer = <String, bool>{};
          for (final member in cluster.members) {
            final current = paidByFarmer[member.farmerId] ?? false;
            paidByFarmer[member.farmerId] = current || member.hasPaid;
          }
          final paidFarmers = paidByFarmer.values.where((paid) => paid).length;
          final totalFarmers = paidByFarmer.length;
          final paidPercent =
              totalFarmers == 0 ? 0 : (paidFarmers / totalFarmers) * 100;

          return SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Timer banner
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: AppColors.primary,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.timer_outlined,
                          color: AppColors.surface, size: 22),
                      const SizedBox(width: 12),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'TIME LEFT TO PAY',
                            style: AppTextStyles.caption.copyWith(
                              color: AppColors.textOnPrimaryMuted,
                              letterSpacing: 0.5,
                            ),
                          ),
                          Text(
                            _formatDuration(),
                            style: AppTextStyles.h2.copyWith(
                              color: AppColors.surface,
                              fontFamily: 'monospace',
                              fontSize: 26,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Escrow badge
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                  decoration: BoxDecoration(
                    color: AppColors.inputBackground,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.shield_outlined,
                          color: AppColors.primary, size: 22),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Your money is safe',
                              style: AppTextStyles.label
                                  .copyWith(color: AppColors.primary),
                            ),
                            Text(
                              'Released only after delivery confirmation',
                              style: AppTextStyles.caption,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),

                Text('Order Summary', style: AppTextStyles.h5),
                const SizedBox(height: 12),

                // Order card
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: AppColors.inputBackground,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Column(
                    children: [
                      // Vendor row
                      Row(
                        children: [
                          Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(
                              color: AppColors.primary.withOpacity(0.12),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: const Icon(Icons.store,
                                color: AppColors.primary, size: 20),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  cluster.vendor?.businessName ?? 'Vendor',
                                  style: AppTextStyles.label,
                                ),
                                Text(
                                  cluster.vendor?.businessType ?? 'Supplier',
                                  style: AppTextStyles.caption,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const Divider(height: 24),
                      _PriceRow(
                        label: 'Product',
                        value: cluster.cropName,
                      ),
                      const SizedBox(height: 8),
                      _PriceRow(
                        label: 'Unit Price',
                        value:
                            '₹${cluster.bids.isNotEmpty ? cluster.bids.first.pricePerUnit.toStringAsFixed(0) : 0}/kg',
                      ),
                      const SizedBox(height: 8),
                      _PriceRow(
                        label: 'Your Share',
                        value:
                            '${cluster.members.where((m) => m.farmerId == farmer?.id).fold<double>(0, (sum, m) => sum + m.quantity).toStringAsFixed(0)} ${cluster.unit}',
                      ),
                      const Divider(height: 24),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Your Total', style: AppTextStyles.label),
                          Text(
                            '₹${amount != null ? fmt.format(amount) : '—'}',
                            style: AppTextStyles.price.copyWith(fontSize: 18),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Cluster payment status
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
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
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '$paidFarmers of $totalFarmers farmers paid · ${paidPercent.toStringAsFixed(0)}%',
                              style: AppTextStyles.label,
                            ),
                            Text(
                              'Waiting for more farmers — order confirmed when all pay',
                              style: AppTextStyles.caption,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),

                Text('Pay via UPI', style: AppTextStyles.h5),
                const SizedBox(height: 12),

                // UPI apps grid
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _UpiApp(
                      label: 'PhonePe',
                      icon: Icons.phone_android,
                      onTap: _payNow,
                    ),
                    _UpiApp(
                      label: 'GPay',
                      icon: Icons.g_mobiledata,
                      onTap: _payNow,
                    ),
                    _UpiApp(
                      label: 'Scan QR',
                      icon: Icons.qr_code_scanner,
                      onTap: _payNow,
                    ),
                    _UpiApp(
                      label: 'BHIM',
                      icon: Icons.account_balance,
                      onTap: _payNow,
                    ),
                  ],
                ),
                const SizedBox(height: 24),

                SizedBox(
                  width: double.infinity,
                  height: 56,
                  child: ElevatedButton(
                    onPressed: (_isPaying || _isInitiating) ? null : _payNow,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      shape: const StadiumBorder(),
                      elevation: 0,
                    ),
                    child: (_isPaying || _isInitiating)
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2.5,
                              color: AppColors.surface,
                            ),
                          )
                        : Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(Icons.lock_outline,
                                  color: AppColors.surface, size: 20),
                              const SizedBox(width: 8),
                              Text(
                                'Pay ₹${amount != null ? fmt.format(amount) : '—'} Securely',
                                style: AppTextStyles.button,
                              ),
                            ],
                          ),
                  ),
                ),
                const SizedBox(height: 80),
              ],
            ),
          );
        },
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.primary),
        ),
        error: (e, _) => Center(child: Text(e.toString())),
      ),
    );
  }
}

class _PriceRow extends StatelessWidget {
  final String label;
  final String value;

  const _PriceRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label,
            style: AppTextStyles.body.copyWith(color: AppColors.textMuted)),
        Text(value, style: AppTextStyles.body),
      ],
    );
  }
}

class _UpiApp extends StatelessWidget {
  final String label;
  final IconData icon;
  final VoidCallback onTap;

  const _UpiApp({required this.label, required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: AppColors.inputBackground,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(icon, size: 30, color: AppColors.primary),
          ),
          const SizedBox(height: 6),
          Text(label, style: AppTextStyles.caption),
        ],
      ),
    );
  }
}
