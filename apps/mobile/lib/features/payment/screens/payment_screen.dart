import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
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
  bool _navigatedToFailed = false;
  Map<String, dynamic>? _paymentData;
  Timer? _clockTimer;
  DateTime _now = DateTime.now();

  @override
  void initState() {
    super.initState();
    _initiatePayment();
    _startClockTicker();
  }

  @override
  void dispose() {
    _clockTimer?.cancel();
    super.dispose();
  }

  void _startClockTicker() {
    _clockTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _now = DateTime.now());
    });
  }

  bool _isPaymentWindowExpiredError(Object error) {
    final message = error.toString().toLowerCase();
    return message.contains('payment window expired') ||
        message.contains('not accepting payments');
  }

  void _goToFailedScreen() {
    if (!mounted || _navigatedToFailed) return;
    _navigatedToFailed = true;
    context.go('/payment-failed/${widget.clusterId}');
  }

  Future<void> _initiatePayment() async {
    setState(() => _isInitiating = true);
    try {
      final api = ref.read(apiClientProvider);
      final data = await api.initiatePayment(widget.clusterId);
      setState(() => _paymentData = data);
    } catch (e) {
      if (_isPaymentWindowExpiredError(e)) {
        _goToFailedScreen();
      } else if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _isInitiating = false);
    }
  }

  Future<void> _showUpiPinSheet() async {
    final confirmed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => const _UpiPinScreen(),
      ),
    );
    if (confirmed == true) {
      await _payNow();
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
    } catch (e) {
      if (_isPaymentWindowExpiredError(e)) {
        _goToFailedScreen();
      } else if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _isPaying = false);
    }
  }

  String _formatDuration(num totalSeconds) {
    final seconds = totalSeconds.toInt();
    final safeSeconds = seconds < 0 ? 0 : seconds;
    final h = safeSeconds ~/ 3600;
    final m = (safeSeconds % 3600) ~/ 60;
    final s = safeSeconds % 60;
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
          final deadline = cluster.paymentDeadlineAt;
          final secondsLeft = deadline == null
              ? 0
              : deadline.difference(_now).inSeconds.clamp(0, 10 * 24 * 3600);
          final paymentExpired = cluster.status == ClusterStatus.failed ||
              (deadline != null && secondsLeft <= 0);
          if (paymentExpired) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              _goToFailedScreen();
            });
            return const SizedBox.shrink();
          }

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
                            _formatDuration(secondsLeft),
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
                        value: cluster.product,
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
                      onTap: _showUpiPinSheet,
                    ),
                    _UpiApp(
                      label: 'GPay',
                      icon: Icons.g_mobiledata,
                      onTap: _showUpiPinSheet,
                    ),
                    _UpiApp(
                      label: 'Scan QR',
                      icon: Icons.qr_code_scanner,
                      onTap: _showUpiPinSheet,
                    ),
                    _UpiApp(
                      label: 'BHIM',
                      icon: Icons.account_balance,
                      onTap: _showUpiPinSheet,
                    ),
                  ],
                ),
                const SizedBox(height: 24),

                SizedBox(
                  width: double.infinity,
                  height: 56,
                  child: ElevatedButton(
                    onPressed: (_isPaying || _isInitiating) ? null : _showUpiPinSheet,
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

class _UpiPinScreen extends StatefulWidget {
  const _UpiPinScreen();

  @override
  State<_UpiPinScreen> createState() => _UpiPinScreenState();
}

class _UpiPinScreenState extends State<_UpiPinScreen> {
  static const _kUpiBlue = Color(0xFF1A237E);
  static const _kKeyBg = Color(0xFFEEEEEE);

  String _pin = '';
  bool _showPin = false;

  void _onDigit(String d) {
    if (_pin.length >= 4) return;
    setState(() => _pin += d);
  }

  void _onBackspace() {
    if (_pin.isEmpty) return;
    setState(() => _pin = _pin.substring(0, _pin.length - 1));
  }

  void _onConfirm() {
    if (_pin.length == 4) Navigator.of(context).pop(true);
  }

  Widget _numKey(String label) {
    return _KeyButton(
      onTap: () => _onDigit(label),
      color: Colors.white,
      child: Text(
        label,
        style: const TextStyle(fontSize: 26, color: Colors.black87, fontWeight: FontWeight.w400),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final bottomPad = MediaQuery.of(context).padding.bottom;
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(56),
        child: AppBar(
          backgroundColor: _kUpiBlue,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.keyboard_arrow_down, color: Colors.white, size: 28),
            onPressed: () => Navigator.of(context).pop(false),
          ),
          title: const Text(
            'AgriSetu Bank',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18),
          ),
          actions: [
            Padding(
              padding: const EdgeInsets.only(right: 16),
              child: SvgPicture.network(
                'https://upload.wikimedia.org/wikipedia/commons/e/e1/UPI-Logo-vector.svg',
                height: 28,
                placeholderBuilder: (_) => const SizedBox(width: 60),
              ),
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          // Accent bar
          Container(height: 4, color: _kUpiBlue),

          // PIN area
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Header row
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      'ENTER UPI PIN',
                      style: TextStyle(
                        color: Colors.grey[500],
                        fontSize: 14,
                        letterSpacing: 1.2,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(width: 8),
                    GestureDetector(
                      onTap: () => setState(() => _showPin = !_showPin),
                      child: Icon(
                        _showPin ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                        color: _kUpiBlue,
                        size: 20,
                      ),
                    ),
                    const SizedBox(width: 6),
                    GestureDetector(
                      onTap: () => setState(() => _showPin = !_showPin),
                      child: Text(
                        _showPin ? 'HIDE' : 'SHOW',
                        style: const TextStyle(
                          color: _kUpiBlue,
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 1,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 40),
                // PIN indicators
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: List.generate(4, (i) {
                    final filled = i < _pin.length;
                    if (filled && _showPin) {
                      return Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Text(
                          _pin[i],
                          style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
                        ),
                      );
                    }
                    if (filled) {
                      return const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 16),
                        child: Text(
                          '*',
                          style: TextStyle(fontSize: 32, fontWeight: FontWeight.bold, color: Colors.black87),
                        ),
                      );
                    }
                    return Container(
                      margin: const EdgeInsets.symmetric(horizontal: 16),
                      width: 28,
                      height: 3,
                      decoration: BoxDecoration(
                        color: Colors.grey[400],
                        borderRadius: BorderRadius.circular(2),
                      ),
                    );
                  }),
                ),
              ],
            ),
          ),

          // Keyboard
          Container(
            color: _kKeyBg,
            padding: EdgeInsets.fromLTRB(8, 10, 8, 10 + bottomPad),
            child: Column(
              children: [
                _KeyRow(children: [
                  _numKey('1'),
                  _numKey('2'),
                  _numKey('3'),
                  _KeyButton(color: Colors.grey[350]!, onTap: () {}, child: const Text('\u2212', style: TextStyle(fontSize: 22, color: Colors.black54))),
                ]),
                const SizedBox(height: 8),
                _KeyRow(children: [
                  _numKey('4'),
                  _numKey('5'),
                  _numKey('6'),
                  _KeyButton(color: Colors.grey[350]!, onTap: () {}, child: const Icon(Icons.keyboard_return, color: Colors.black54)),
                ]),
                const SizedBox(height: 8),
                _KeyRow(children: [
                  _numKey('7'),
                  _numKey('8'),
                  _numKey('9'),
                  _KeyButton(
                    color: const Color(0xFFBBCCEE),
                    onTap: _onBackspace,
                    child: const Icon(Icons.backspace_outlined, color: _kUpiBlue, size: 22),
                  ),
                ]),
                const SizedBox(height: 8),
                _KeyRow(children: [
                  _KeyButton(color: Colors.white, onTap: () {}, child: Text(',', style: TextStyle(fontSize: 22, color: Colors.grey[500]))),
                  _numKey('0'),
                  _KeyButton(color: Colors.white, onTap: () {}, child: Text('.', style: TextStyle(fontSize: 22, color: Colors.grey[500]))),
                  _KeyButton(
                    color: const Color(0xFFBBCCEE),
                    onTap: _onConfirm,
                    child: Icon(Icons.check, color: _pin.length == 4 ? _kUpiBlue : Colors.grey[400], size: 26),
                  ),
                ]),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _KeyRow extends StatelessWidget {
  final List<Widget> children;
  const _KeyRow({required this.children});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: children
          .map((c) => Expanded(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 4), child: c)))
          .toList(),
    );
  }
}

class _KeyButton extends StatelessWidget {
  final VoidCallback onTap;
  final Color color;
  final Widget child;

  const _KeyButton({required this.onTap, required this.color, required this.child});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 58,
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(10),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.08), blurRadius: 2, offset: const Offset(0, 1))],
        ),
        alignment: Alignment.center,
        child: child,
      ),
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
