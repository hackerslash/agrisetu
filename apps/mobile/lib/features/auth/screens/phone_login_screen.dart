import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../shared/widgets/app_brand_icon.dart';
import '../../../core/providers/auth_provider.dart';

class PhoneLoginScreen extends ConsumerStatefulWidget {
  final String? initialPhone;

  const PhoneLoginScreen({super.key, this.initialPhone});

  @override
  ConsumerState<PhoneLoginScreen> createState() => _PhoneLoginScreenState();
}

class _PhoneLoginScreenState extends ConsumerState<PhoneLoginScreen> {
  late final TextEditingController _phoneController;
  bool _isLoading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _phoneController = TextEditingController(text: widget.initialPhone ?? '');
  }

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  bool get _isValid => _phoneController.text.replaceAll(' ', '').length == 10;

  Future<void> _sendOtp() async {
    if (!_isValid) return;
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      await ref
          .read(authProvider.notifier)
          .requestOtp(_phoneController.text.trim());
      if (mounted) {
        context.push('/otp', extra: _phoneController.text.trim());
      }
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final mediaQuery = MediaQuery.of(context);
    final isKeyboardVisible = mediaQuery.viewInsets.bottom > 0;

    return Scaffold(
      backgroundColor: AppColors.primary,
      body: Column(
        children: [
          // Hero
          Expanded(
            flex: 3,
            child: Padding(
              padding: EdgeInsets.only(
                top: mediaQuery.padding.top + (isKeyboardVisible ? 12 : 60),
                left: 24,
                right: 24,
                bottom: isKeyboardVisible ? 12 : 40,
              ),
              child: Column(
                mainAxisAlignment: isKeyboardVisible
                    ? MainAxisAlignment.start
                    : MainAxisAlignment.center,
                children: [
                  if (!isKeyboardVisible) ...[
                    Container(
                      width: 64,
                      height: 64,
                      decoration: BoxDecoration(
                        color: AppColors.surface.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(32),
                      ),
                      child: const AppBrandIcon(
                        color: AppColors.surface,
                        size: 32,
                        padding: EdgeInsets.all(8),
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],
                  Text('AgriSetu',
                      style:
                          AppTextStyles.h1.copyWith(color: AppColors.surface)),
                  if (!isKeyboardVisible) ...[
                    const SizedBox(height: 8),
                    Text(
                      'Enter your mobile number to continue',
                      style: AppTextStyles.body.copyWith(
                        color: AppColors.textOnPrimaryMuted,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ],
              ),
            ),
          ),

          // Sheet
          Expanded(
            flex: 5,
            child: Container(
              decoration: const BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.only(
                  topLeft: Radius.circular(32),
                  topRight: Radius.circular(32),
                ),
              ),
              padding: const EdgeInsets.fromLTRB(24, 36, 24, 40),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    "What's your mobile number?",
                    style: AppTextStyles.h2.copyWith(color: AppColors.primary),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    "We'll send a one-time password to verify your identity.",
                    style: AppTextStyles.body.copyWith(
                      color: AppColors.primary,
                      height: 1.5,
                    ),
                  ),
                  const SizedBox(height: 24),

                  // Phone input
                  Container(
                    height: 56,
                    decoration: BoxDecoration(
                      color: AppColors.inputBackground,
                      borderRadius: BorderRadius.circular(16),
                      border: _error != null
                          ? Border.all(color: AppColors.error, width: 1.5)
                          : null,
                    ),
                    child: Row(
                      children: [
                        const SizedBox(width: 16),
                        Text(
                          '🇮🇳 +91',
                          style: AppTextStyles.body.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        Container(
                          width: 1,
                          height: 24,
                          margin: const EdgeInsets.symmetric(horizontal: 12),
                          color: AppColors.divider,
                        ),
                        Expanded(
                          child: TextField(
                            controller: _phoneController,
                            keyboardType: TextInputType.phone,
                            inputFormatters: [
                              FilteringTextInputFormatter.digitsOnly,
                              LengthLimitingTextInputFormatter(10),
                            ],
                            style: AppTextStyles.body.copyWith(
                              fontWeight: FontWeight.w600,
                              fontSize: 16,
                              letterSpacing: 1,
                            ),
                            decoration: InputDecoration(
                              hintText: '00000 00000',
                              hintStyle: AppTextStyles.body.copyWith(
                                color: AppColors.textMuted,
                              ),
                              border: InputBorder.none,
                              enabledBorder: InputBorder.none,
                              focusedBorder: InputBorder.none,
                              contentPadding: EdgeInsets.zero,
                            ),
                            onChanged: (_) => setState(() => _error = null),
                            onSubmitted: (_) => _sendOtp(),
                          ),
                        ),
                      ],
                    ),
                  ),

                  if (_error != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      _error!,
                      style: AppTextStyles.bodySmall
                          .copyWith(color: AppColors.error),
                    ),
                  ],

                  const SizedBox(height: 8),
                  Text(
                    'You will receive an OTP on this number',
                    style: AppTextStyles.caption,
                  ),
                  const SizedBox(height: 16),

                  // Aadhaar note
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.inputBackground,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.info_outline,
                            size: 18, color: AppColors.primary),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Linked to your Aadhaar for secure verification',
                            style: AppTextStyles.bodySmall.copyWith(
                              color: AppColors.primary,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Spacer(),

                  // Send OTP button
                  AnimatedBuilder(
                    animation: _phoneController,
                    builder: (_, __) => SizedBox(
                      width: double.infinity,
                      height: 56,
                      child: ElevatedButton(
                        onPressed: (_isValid && !_isLoading) ? _sendOtp : null,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          disabledBackgroundColor:
                              AppColors.primary.withOpacity(0.4),
                          shape: const StadiumBorder(),
                          elevation: 0,
                        ),
                        child: _isLoading
                            ? const SizedBox(
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2.5,
                                  color: AppColors.surface,
                                ),
                              )
                            : Text(
                                'Send OTP',
                                style: AppTextStyles.button,
                              ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  Center(
                    child: GestureDetector(
                      onTap: () {
                        if (context.canPop()) {
                          context.pop();
                        } else {
                          context.go('/landing');
                        }
                      },
                      child: Text(
                        'Back',
                        style: AppTextStyles.label.copyWith(
                          color: AppColors.textMuted,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
