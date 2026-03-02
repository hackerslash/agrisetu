import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/providers/locale_provider.dart';
import '../../../l10n/app_localizations.dart';

class LandingScreen extends ConsumerStatefulWidget {
  const LandingScreen({super.key});

  @override
  ConsumerState<LandingScreen> createState() => _LandingScreenState();
}

class _LandingScreenState extends ConsumerState<LandingScreen> {
  @override
  void initState() {
    super.initState();
    SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
    ));
  }

  Future<void> _selectLanguage(String code) async {
    await ref.read(localeProvider.notifier).setLocale(code);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final currentLocale = ref.watch(localeProvider);
    final selectedLanguage = currentLocale.languageCode;

    return Scaffold(
      backgroundColor: AppColors.primary,
      body: Column(
        children: [
          // Hero section
          Expanded(
            flex: 5,
            child: Container(
              color: AppColors.primary,
              padding: EdgeInsets.only(
                top: MediaQuery.of(context).padding.top + 30,
                left: 32,
                right: 32,
                bottom: 20,
              ),
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                  // Logo
                  Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      color: AppColors.surface.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(36),
                    ),
                    child: const Icon(
                      Icons.eco,
                      color: AppColors.surface,
                      size: 36,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    l10n.appTitle,
                    style: AppTextStyles.display,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    l10n.appTagline,
                    style: AppTextStyles.bodyLarge.copyWith(
                      color: AppColors.textOnPrimaryMuted,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                    const SizedBox(height: 16),
                    // Stats row
                    Row(
                      children: [
                        _StatItem(value: '10–25%', label: l10n.costSavings),
                        const SizedBox(width: 12),
                        _StatItem(value: '86%', label: l10n.farmersServed),
                        const SizedBox(width: 12),
                        _StatItem(value: '40–50%', label: l10n.carbonSaved),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),

          // Bottom sheet
          Expanded(
            flex: 6,
            child: Container(
              decoration: const BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.only(
                  topLeft: Radius.circular(32),
                  topRight: Radius.circular(32),
                ),
              ),
              child: SingleChildScrollView(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(24, 32, 24, 40),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Handle
                      Center(
                        child: Container(
                          width: 40,
                          height: 4,
                          decoration: BoxDecoration(
                            color: AppColors.border,
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      ),
                      const SizedBox(height: 24),

                      Text(
                        l10n.welcomeTitle,
                        style: AppTextStyles.h1.copyWith(color: AppColors.primary),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        l10n.welcomeSubtitle,
                        style: AppTextStyles.body.copyWith(
                          color: AppColors.primary,
                          height: 1.5,
                        ),
                      ),
                      const SizedBox(height: 24),

                      // Language selector
                      Text(
                        l10n.selectLanguage,
                        style: AppTextStyles.label.copyWith(
                          color: AppColors.textSecondary,
                          fontSize: 13,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: AppConstants.supportedLanguages.map((lang) {
                          final isSelected = selectedLanguage == lang['code'];
                          return GestureDetector(
                            onTap: () => _selectLanguage(lang['code']!),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 8,
                              ),
                              decoration: BoxDecoration(
                                color: isSelected
                                    ? AppColors.primary
                                    : AppColors.inputBackground,
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(
                                  color: isSelected
                                      ? AppColors.primary
                                      : Colors.transparent,
                                ),
                              ),
                              child: Text(
                                lang['label']!,
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
                      const SizedBox(height: 32),

                      // Login with Aadhaar button
                      SizedBox(
                        width: double.infinity,
                        height: 56,
                        child: ElevatedButton.icon(
                          onPressed: () => context.push('/login'),
                          icon: const Icon(Icons.verified_user_outlined, size: 20),
                          label: Text(l10n.loginWithAadhaar),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.primary,
                            foregroundColor: AppColors.surface,
                            shape: const StadiumBorder(),
                            elevation: 0,
                            textStyle: AppTextStyles.button,
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),

                      // Use OTP instead
                      Center(
                        child: GestureDetector(
                          onTap: () => context.push('/login'),
                          child: Text(
                            l10n.useOtpInstead,
                            style: AppTextStyles.label.copyWith(
                              color: AppColors.primary,
                              decoration: TextDecoration.underline,
                              decorationColor: AppColors.primary,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatItem extends StatelessWidget {
  final String value;
  final String label;

  const _StatItem({required this.value, required this.label});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: AppColors.surface.withOpacity(0.15),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              value,
              style: AppTextStyles.h4.copyWith(
                color: AppColors.surface,
                fontSize: 15,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: AppTextStyles.caption.copyWith(
                color: AppColors.textOnPrimaryMuted,
                fontSize: 11,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
