import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../core/providers/auth_provider.dart';

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _villageCtrl = TextEditingController();
  final _districtCtrl = TextEditingController();
  final _stateCtrl = TextEditingController();
  final _landAreaCtrl = TextEditingController();
  final _upiCtrl = TextEditingController();
  String _selectedLanguage = 'en';
  final List<String> _cropsGrown = [];
  bool _isLoading = false;
  String? _error;

  final _cropOptions = [
    'Wheat', 'Rice', 'Maize', 'Cotton', 'Sugarcane',
    'Tomato', 'Onion', 'Potato', 'Soybean', 'Groundnut',
  ];

  @override
  void dispose() {
    _nameCtrl.dispose();
    _villageCtrl.dispose();
    _districtCtrl.dispose();
    _stateCtrl.dispose();
    _landAreaCtrl.dispose();
    _upiCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      await ref.read(authProvider.notifier).updateProfile({
        'name': _nameCtrl.text.trim(),
        'village': _villageCtrl.text.trim(),
        'district': _districtCtrl.text.trim(),
        'state': _stateCtrl.text.trim(),
        'landArea': _landAreaCtrl.text.isNotEmpty
            ? double.tryParse(_landAreaCtrl.text)
            : null,
        'cropsGrown': _cropsGrown,
        'upiId': _upiCtrl.text.trim().isNotEmpty ? _upiCtrl.text.trim() : null,
        'language': _selectedLanguage,
      });
      if (mounted) context.go('/home');
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Widget _buildField({
    required String label,
    required TextEditingController controller,
    String? hint,
    TextInputType? keyboardType,
    String? Function(String?)? validator,
    bool optional = false,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(label, style: AppTextStyles.label),
            if (!optional)
              Text(' *',
                  style: AppTextStyles.label.copyWith(color: AppColors.error)),
          ],
        ),
        const SizedBox(height: 8),
        TextFormField(
          controller: controller,
          keyboardType: keyboardType,
          validator: optional
              ? null
              : (validator ??
                  (v) => (v == null || v.trim().isEmpty)
                      ? 'Required field'
                      : null),
          style: AppTextStyles.body,
          decoration: InputDecoration(
            hintText: hint,
            filled: true,
            fillColor: AppColors.inputBackground,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: BorderSide.none,
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: BorderSide.none,
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
            ),
            errorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: const BorderSide(color: AppColors.error, width: 1.5),
            ),
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    ref.watch(currentFarmerProvider);

    return Scaffold(
      backgroundColor: AppColors.surface,
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            backgroundColor: AppColors.primary,
            expandedHeight: 160,
            pinned: true,
            flexibleSpace: FlexibleSpaceBar(
              background: SafeArea(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(24, 16, 24, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 32,
                            height: 32,
                            decoration: BoxDecoration(
                              color: AppColors.surface.withOpacity(0.15),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(Icons.eco,
                                color: AppColors.surface, size: 18),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'AgriSetu',
                            style: AppTextStyles.h5.copyWith(
                                color: AppColors.surface),
                          ),
                        ],
                      ),
                      const Spacer(),
                      Text(
                        'Complete your profile',
                        style: AppTextStyles.h2.copyWith(color: AppColors.surface),
                      ),
                      Text(
                        'Help us personalise your experience',
                        style: AppTextStyles.bodySmall.copyWith(
                          color: AppColors.textOnPrimaryMuted,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            leading: const SizedBox.shrink(),
            automaticallyImplyLeading: false,
          ),

          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Mandatory banner
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
                              'Name, location & language are required to match you with the right cluster.',
                              style: AppTextStyles.bodySmall.copyWith(
                                  color: AppColors.primary),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),

                    Text('Personal Info', style: AppTextStyles.h5),
                    const SizedBox(height: 16),

                    _buildField(
                      label: 'Full Name',
                      controller: _nameCtrl,
                      hint: 'e.g., Ramesh Kumar',
                    ),
                    const SizedBox(height: 16),

                    // Language
                    Text('Preferred Language', style: AppTextStyles.label),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        {'code': 'hi', 'label': 'हिंदी'},
                        {'code': 'kn', 'label': 'ಕನ್ನಡ'},
                        {'code': 'ta', 'label': 'தமிழ்'},
                        {'code': 'bn', 'label': 'বাংলা'},
                        {'code': 'te', 'label': 'తెలుగు'},
                        {'code': 'en', 'label': 'English'},
                      ].map((lang) {
                        final isSelected = _selectedLanguage == lang['code'];
                        return GestureDetector(
                          onTap: () =>
                              setState(() => _selectedLanguage = lang['code']!),
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 8),
                            decoration: BoxDecoration(
                              color: isSelected
                                  ? AppColors.primary
                                  : AppColors.inputBackground,
                              borderRadius: BorderRadius.circular(20),
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
                    const SizedBox(height: 24),

                    Text('Farm Details', style: AppTextStyles.h5),
                    const SizedBox(height: 16),

                    _buildField(
                      label: 'Village / Town',
                      controller: _villageCtrl,
                      hint: 'e.g., Srirangapatna',
                    ),
                    const SizedBox(height: 16),

                    Row(
                      children: [
                        Expanded(
                          child: _buildField(
                            label: 'District',
                            controller: _districtCtrl,
                            hint: 'e.g., Mandya',
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _buildField(
                            label: 'State',
                            controller: _stateCtrl,
                            hint: 'e.g., Karnataka',
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),

                    _buildField(
                      label: 'Land Area (acres)',
                      controller: _landAreaCtrl,
                      hint: 'e.g., 5.5',
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      optional: true,
                    ),
                    const SizedBox(height: 16),

                    // Crops grown
                    Text('Crops Grown', style: AppTextStyles.label),
                    const SizedBox(height: 8),
                    Text(
                      'Select all that apply',
                      style: AppTextStyles.caption,
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: _cropOptions.map((crop) {
                        final isSelected = _cropsGrown.contains(crop);
                        return FilterChip(
                          label: Text(crop),
                          selected: isSelected,
                          onSelected: (v) {
                            setState(() {
                              if (v) {
                                _cropsGrown.add(crop);
                              } else {
                                _cropsGrown.remove(crop);
                              }
                            });
                          },
                          backgroundColor: AppColors.inputBackground,
                          selectedColor: AppColors.primary,
                          checkmarkColor: AppColors.surface,
                          labelStyle: AppTextStyles.bodySmall.copyWith(
                            color: isSelected
                                ? AppColors.surface
                                : AppColors.textPrimary,
                          ),
                          side: BorderSide.none,
                          shape: const StadiumBorder(),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 24),

                    Text('Payment', style: AppTextStyles.h5),
                    const SizedBox(height: 16),

                    _buildField(
                      label: 'UPI ID',
                      controller: _upiCtrl,
                      hint: 'e.g., ramesh@upi',
                      optional: true,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Used for collective payments. Can be added later.',
                      style: AppTextStyles.caption,
                    ),

                    if (_error != null) ...[
                      const SizedBox(height: 16),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppColors.errorLight,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          _error!,
                          style: AppTextStyles.bodySmall
                              .copyWith(color: AppColors.error),
                        ),
                      ),
                    ],

                    const SizedBox(height: 32),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: Container(
        color: AppColors.surface,
        padding: EdgeInsets.fromLTRB(
          24,
          12,
          24,
          MediaQuery.of(context).padding.bottom + 12,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton(
                onPressed: _isLoading ? null : _save,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
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
                    : Text('Continue →', style: AppTextStyles.button),
              ),
            ),
            const SizedBox(height: 8),
            GestureDetector(
              onTap: () => context.go('/home'),
              child: Center(
                child: Text(
                  'Skip for now',
                  style: AppTextStyles.label.copyWith(color: AppColors.textMuted),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
