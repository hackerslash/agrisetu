import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../core/models/order_model.dart';
import '../../../core/providers/auth_provider.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../shared/widgets/app_header.dart';
import '../../clusters/screens/cluster_detail_screen.dart';

const _failRed = Color(0xFFB03A2E);
const _dividerColor = Color(0xFFD4CFC8);

class PaymentFailedScreen extends ConsumerWidget {
  final String clusterId;

  const PaymentFailedScreen({super.key, required this.clusterId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final clusterAsync = ref.watch(clusterDetailProvider(clusterId));
    final farmer = ref.watch(currentFarmerProvider);

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppHeader(
        title: 'Cluster Failed',
        backgroundColor: _failRed,
        trailing: const Icon(
          Icons.cancel_outlined,
          color: AppColors.surface,
          size: 22,
        ),
      ),
      body: clusterAsync.when(
        data: (cluster) => _PaymentFailedContent(
          cluster: cluster,
          currentFarmerId: farmer?.id,
        ),
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.primary),
        ),
        error: (_, __) => _PaymentFailedContent(
          cluster: null,
          currentFarmerId: farmer?.id,
        ),
      ),
    );
  }
}

class _PaymentFailedContent extends StatelessWidget {
  final Cluster? cluster;
  final String? currentFarmerId;

  const _PaymentFailedContent({
    required this.cluster,
    required this.currentFarmerId,
  });

  @override
  Widget build(BuildContext context) {
    final rows = _buildRows(cluster, currentFarmerId);
    final paidCount = rows.where((row) => row.paid).length;
    final defaultedCount = rows.length - paidCount;
    final pricePerUnit = _winningPrice(cluster);
    final myRow = rows.firstWhere(
      (row) => row.isCurrentFarmer,
      orElse: () => rows.isNotEmpty ? rows.first : _FarmerPaymentRow.empty(),
    );
    final refundAmount = myRow.amount > 0 ? myRow.amount : 0.0;
    final moneyFormat = NumberFormat('#,##0');

    return SafeArea(
      top: false,
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _FailureBanner(defaultedCount: defaultedCount),
            const SizedBox(height: 16),
            _RefundCard(
              refundAmount: refundAmount,
              refundAmountLabel: refundAmount > 0
                  ? '₹${moneyFormat.format(refundAmount)}'
                  : '₹0',
            ),
            const SizedBox(height: 16),
            _FarmerStatusCard(
              rows: rows,
              paidCount: paidCount,
              defaultedCount: defaultedCount,
              pricePerUnit: pricePerUnit,
              moneyFormat: moneyFormat,
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              height: 56,
              child: ElevatedButton.icon(
                onPressed: () => context.go('/clusters'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(28),
                  ),
                  elevation: 0,
                ),
                icon: const Icon(Icons.refresh,
                    size: 20, color: AppColors.surface),
                label: Text(
                  'Try a New Cluster',
                  style: AppTextStyles.h5.copyWith(color: AppColors.surface),
                ),
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: FilledButton.icon(
                onPressed: () => context.go('/home'),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.inputBackground,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(26),
                  ),
                  elevation: 0,
                ),
                icon: const Icon(Icons.home_outlined,
                    size: 18, color: AppColors.primary),
                label: Text(
                  'Go to Home',
                  style: AppTextStyles.label.copyWith(color: AppColors.primary),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FailureBanner extends StatelessWidget {
  final int defaultedCount;

  const _FailureBanner({required this.defaultedCount});

  @override
  Widget build(BuildContext context) {
    final failedFarmers = defaultedCount <= 0 ? 1 : defaultedCount;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      decoration: BoxDecoration(
        color: _failRed,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.12),
              borderRadius: BorderRadius.circular(22),
            ),
            child: const Icon(Icons.person_off_outlined,
                color: AppColors.surface, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Cluster payment failed',
                  style: AppTextStyles.h5.copyWith(
                    color: AppColors.surface,
                    fontSize: 14,
                  ),
                ),
                Text(
                  "$failedFarmers farmers didn't pay in time — order cancelled",
                  style: AppTextStyles.caption
                      .copyWith(color: AppColors.textOnPrimaryMuted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RefundCard extends StatelessWidget {
  final double refundAmount;
  final String refundAmountLabel;

  const _RefundCard({
    required this.refundAmount,
    required this.refundAmountLabel,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.inputBackground,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
            child: Row(
              children: [
                const Icon(Icons.rotate_left,
                    size: 18, color: AppColors.primary),
                const SizedBox(width: 8),
                Text(
                  'Auto-Refund Initiated',
                  style: AppTextStyles.h5
                      .copyWith(color: AppColors.primary, fontSize: 15),
                ),
                const Spacer(),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 6,
                        height: 6,
                        decoration: const BoxDecoration(
                          color: AppColors.primary,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 5),
                      Text(
                        'Processing',
                        style: AppTextStyles.caption.copyWith(
                          color: AppColors.primary,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1, thickness: 1, color: _dividerColor),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'YOUR REFUND',
                      style: AppTextStyles.caption.copyWith(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      refundAmountLabel,
                      style: AppTextStyles.price.copyWith(
                        color: AppColors.primary,
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    Row(
                      children: [
                        const Icon(Icons.smartphone_outlined,
                            size: 12, color: AppColors.textMuted),
                        const SizedBox(width: 5),
                        Text(
                          'Back to source · UPI / Bank',
                          style: AppTextStyles.caption.copyWith(fontSize: 12),
                        ),
                      ],
                    ),
                  ],
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      'CREDITED IN',
                      style: AppTextStyles.caption.copyWith(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      refundAmount > 0 ? '2–3 days' : '—',
                      style: AppTextStyles.h5
                          .copyWith(color: AppColors.primary, fontSize: 16),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _FarmerStatusCard extends StatelessWidget {
  final List<_FarmerPaymentRow> rows;
  final int paidCount;
  final int defaultedCount;
  final double pricePerUnit;
  final NumberFormat moneyFormat;

  const _FarmerStatusCard({
    required this.rows,
    required this.paidCount,
    required this.defaultedCount,
    required this.pricePerUnit,
    required this.moneyFormat,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.inputBackground,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
            child: Row(
              children: [
                const Icon(Icons.groups_2_outlined,
                    size: 16, color: AppColors.primary),
                const SizedBox(width: 8),
                Text(
                  'Farmer Payment Status',
                  style: AppTextStyles.h5
                      .copyWith(color: AppColors.primary, fontSize: 14),
                ),
                const Spacer(),
                Text(
                  '$paidCount paid · $defaultedCount defaulted',
                  style: AppTextStyles.caption.copyWith(fontSize: 12),
                ),
              ],
            ),
          ),
          const Divider(height: 1, thickness: 1, color: _dividerColor),
          if (rows.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
              child: Text(
                'Farmer payment status unavailable',
                style: AppTextStyles.bodySmall
                    .copyWith(color: AppColors.textMuted),
              ),
            )
          else
            ...rows.asMap().entries.map((entry) {
              final row = entry.value;
              final isLast = entry.key == rows.length - 1;
              return Column(
                children: [
                  _FarmerRow(
                    row: row,
                    amountLabel: row.paid && pricePerUnit > 0
                        ? '₹${moneyFormat.format(row.amount)}'
                        : '',
                  ),
                  if (!isLast)
                    const Divider(
                        height: 1, thickness: 1, color: _dividerColor),
                ],
              );
            }),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
            decoration: const BoxDecoration(
              color: AppColors.inputBackground,
              borderRadius: BorderRadius.only(
                bottomLeft: Radius.circular(20),
                bottomRight: Radius.circular(20),
              ),
            ),
            child: Row(
              children: [
                const Icon(Icons.info_outline, size: 14, color: _failRed),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    'Defaulters may be restricted from future clusters',
                    style: AppTextStyles.caption.copyWith(
                      color: _failRed,
                      fontSize: 12,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _FarmerRow extends StatelessWidget {
  final _FarmerPaymentRow row;
  final String amountLabel;

  const _FarmerRow({required this.row, required this.amountLabel});

  @override
  Widget build(BuildContext context) {
    final statusColor = row.paid ? AppColors.primary : _failRed;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: statusColor.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Icon(
                  Icons.person,
                  size: 16,
                  color: statusColor,
                ),
              ),
              const SizedBox(width: 10),
              Text(
                row.label,
                style: AppTextStyles.label.copyWith(
                  color: AppColors.primary,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          Row(
            children: [
              if (amountLabel.isNotEmpty)
                Text(
                  amountLabel,
                  style: AppTextStyles.label.copyWith(
                    color: AppColors.primary,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: statusColor.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(
                  children: [
                    Icon(
                      row.paid ? Icons.check : Icons.close,
                      size: 11,
                      color: statusColor,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      row.paid ? 'Paid' : 'Defaulted',
                      style: AppTextStyles.caption.copyWith(
                        color: statusColor,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _FarmerPaymentRow {
  final String label;
  final bool paid;
  final bool isCurrentFarmer;
  final double amount;

  const _FarmerPaymentRow({
    required this.label,
    required this.paid,
    required this.isCurrentFarmer,
    required this.amount,
  });

  factory _FarmerPaymentRow.empty() => const _FarmerPaymentRow(
        label: 'You',
        paid: false,
        isCurrentFarmer: true,
        amount: 0,
      );
}

List<_FarmerPaymentRow> _buildRows(Cluster? cluster, String? currentFarmerId) {
  if (cluster == null || cluster.members.isEmpty) return const [];
  final pricePerUnit = _winningPrice(cluster);
  final byFarmer = <String, _FarmerPaymentRow>{};

  for (final member in cluster.members) {
    final existing = byFarmer[member.farmerId];
    final displayName = (member.farmer?.name ?? '').trim();
    final isCurrentFarmer =
        currentFarmerId != null && member.farmerId == currentFarmerId;
    final fallbackLabel = isCurrentFarmer ? 'You' : 'Farmer';
    final label = displayName.isNotEmpty
        ? (isCurrentFarmer ? '$displayName (You)' : displayName)
        : fallbackLabel;
    final amount = member.quantity * pricePerUnit;

    byFarmer[member.farmerId] = _FarmerPaymentRow(
      label: label,
      paid: (existing?.paid ?? false) || member.hasPaid,
      isCurrentFarmer: (existing?.isCurrentFarmer ?? false) || isCurrentFarmer,
      amount: (existing?.amount ?? 0) + amount,
    );
  }

  final rows = byFarmer.values.toList();
  rows.sort((a, b) {
    if (a.isCurrentFarmer && !b.isCurrentFarmer) return -1;
    if (!a.isCurrentFarmer && b.isCurrentFarmer) return 1;
    if (a.paid != b.paid) return a.paid ? -1 : 1;
    return a.label.toLowerCase().compareTo(b.label.toLowerCase());
  });
  return rows;
}

double _winningPrice(Cluster? cluster) {
  if (cluster == null || cluster.bids.isEmpty) return 0;
  final winningBid = cluster.bids.reduce(
    (best, current) => current.votes > best.votes ? current : best,
  );
  return winningBid.pricePerUnit;
}
