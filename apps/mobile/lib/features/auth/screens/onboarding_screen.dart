import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geocoding/geocoding.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../core/providers/auth_provider.dart';

class OnboardingScreen extends ConsumerStatefulWidget {
  final bool isEditMode;

  const OnboardingScreen({super.key, this.isEditMode = false});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _villageCtrl = TextEditingController();
  final _districtCtrl = TextEditingController();
  final _stateCtrl = TextEditingController();
  final _locationAddressCtrl = TextEditingController();
  final _landAreaCtrl = TextEditingController();
  final _upiCtrl = TextEditingController();
  double? _latitude;
  double? _longitude;
  bool _locating = false;
  String _selectedLanguage = 'en';
  final List<String> _cropsGrown = [];
  bool _isLoading = false;
  String? _error;
  bool _prefilled = false;

  final _cropOptions = [
    'Wheat',
    'Rice',
    'Maize',
    'Cotton',
    'Sugarcane',
    'Tomato',
    'Onion',
    'Potato',
    'Soybean',
    'Groundnut',
  ];

  @override
  void dispose() {
    _nameCtrl.dispose();
    _villageCtrl.dispose();
    _districtCtrl.dispose();
    _stateCtrl.dispose();
    _locationAddressCtrl.dispose();
    _landAreaCtrl.dispose();
    _upiCtrl.dispose();
    super.dispose();
  }

  Future<void> _captureCurrentLocation() async {
    if (_locating) return;
    setState(() {
      _locating = true;
      _error = null;
    });

    try {
      final enabled = await Geolocator.isLocationServiceEnabled();
      if (!enabled) {
        throw Exception('Please enable location services on your phone.');
      }

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        throw Exception(
            'Location permission is required to fetch map location.');
      }

      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      );

      _latitude = position.latitude;
      _longitude = position.longitude;

      String? resolvedAddress;
      try {
        final placemarks = await placemarkFromCoordinates(
            position.latitude, position.longitude);
        if (placemarks.isNotEmpty) {
          final p = placemarks.first;
          final addressParts = [
            p.street,
            p.subLocality,
            p.locality,
            p.subAdministrativeArea,
            p.administrativeArea,
            p.postalCode,
          ].where((value) => value != null && value.trim().isNotEmpty).toList();
          resolvedAddress = addressParts.join(', ');

          if (_villageCtrl.text.trim().isEmpty &&
              (p.locality ?? '').isNotEmpty) {
            _villageCtrl.text = p.locality!;
          }
          if (_districtCtrl.text.trim().isEmpty &&
              (p.subAdministrativeArea ?? '').isNotEmpty) {
            _districtCtrl.text = p.subAdministrativeArea!;
          }
          if (_stateCtrl.text.trim().isEmpty &&
              (p.administrativeArea ?? '').isNotEmpty) {
            _stateCtrl.text = p.administrativeArea!;
          }
        }
      } catch (_) {
        // Keep coordinates even when reverse geocoding fails.
      }

      _locationAddressCtrl.text = resolvedAddress ??
          'Lat ${position.latitude.toStringAsFixed(6)}, Lng ${position.longitude.toStringAsFixed(6)}';
      setState(() {});
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    if (_latitude == null || _longitude == null) {
      setState(() => _error = 'Please capture your location on map first.');
      return;
    }
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
        'locationAddress': _locationAddressCtrl.text.trim(),
        'latitude': _latitude,
        'longitude': _longitude,
        'landArea': _landAreaCtrl.text.isNotEmpty
            ? double.tryParse(_landAreaCtrl.text)
            : null,
        'cropsGrown': _cropsGrown,
        'upiId': _upiCtrl.text.trim().isNotEmpty ? _upiCtrl.text.trim() : null,
        'language': _selectedLanguage,
      });
      if (!mounted) return;
      if (widget.isEditMode && context.canPop()) {
        context.pop();
      } else if (widget.isEditMode) {
        context.go('/profile');
      } else {
        context.go('/home');
      }
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
              borderSide:
                  const BorderSide(color: AppColors.primary, width: 1.5),
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
    final farmer = ref.watch(currentFarmerProvider);

    if (!_prefilled && farmer != null) {
      _prefilled = true;
      _nameCtrl.text = farmer.name ?? '';
      _villageCtrl.text = farmer.village ?? '';
      _districtCtrl.text = farmer.district ?? '';
      _stateCtrl.text = farmer.state ?? '';
      _locationAddressCtrl.text = farmer.locationAddress ?? '';
      _latitude = farmer.latitude;
      _longitude = farmer.longitude;
      _landAreaCtrl.text =
          farmer.landArea != null ? farmer.landArea!.toString() : '';
      _upiCtrl.text = farmer.upiId ?? '';
      _selectedLanguage = farmer.language;
      _cropsGrown
        ..clear()
        ..addAll(farmer.cropsGrown);
    }

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
                            style: AppTextStyles.h5
                                .copyWith(color: AppColors.surface),
                          ),
                        ],
                      ),
                      const Spacer(),
                      Text(
                        widget.isEditMode
                            ? 'Edit your profile'
                            : 'Complete your profile',
                        style:
                            AppTextStyles.h2.copyWith(color: AppColors.surface),
                      ),
                      Text(
                        widget.isEditMode
                            ? 'Update your details and preferences'
                            : 'Help us personalise your experience',
                        style: AppTextStyles.bodySmall.copyWith(
                          color: AppColors.textOnPrimaryMuted,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            leading: widget.isEditMode
                ? IconButton(
                    icon:
                        const Icon(Icons.arrow_back, color: AppColors.surface),
                    onPressed: () {
                      if (context.canPop()) {
                        context.pop();
                      } else {
                        context.go('/profile');
                      }
                    },
                  )
                : const SizedBox.shrink(),
            automaticallyImplyLeading: widget.isEditMode,
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
                              style: AppTextStyles.bodySmall
                                  .copyWith(color: AppColors.primary),
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
                      label: 'Exact Location Address',
                      controller: _locationAddressCtrl,
                      hint: 'Captured from map / GPS',
                      validator: (v) => (v == null || v.trim().isEmpty)
                          ? 'Location address is required'
                          : null,
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      height: 46,
                      child: OutlinedButton.icon(
                        onPressed: (_isLoading || _locating)
                            ? null
                            : _captureCurrentLocation,
                        icon: _locating
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.my_location_outlined, size: 18),
                        label: Text(
                          _locating
                              ? 'Fetching current location...'
                              : 'Use my current location',
                        ),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.primary,
                          side: const BorderSide(color: AppColors.primary),
                          shape: const StadiumBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    if (_latitude != null && _longitude != null)
                      ClipRRect(
                        borderRadius: BorderRadius.circular(14),
                        child: SizedBox(
                          height: 190,
                          child: FlutterMap(
                            options: MapOptions(
                              initialCenter: LatLng(_latitude!, _longitude!),
                              initialZoom: 15,
                              interactionOptions: const InteractionOptions(
                                  flags: InteractiveFlag.all),
                            ),
                            children: [
                              TileLayer(
                                urlTemplate:
                                    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                                userAgentPackageName:
                                    'com.example.agrisetu_app',
                              ),
                              CircleLayer(
                                circles: [
                                  CircleMarker(
                                    point: LatLng(_latitude!, _longitude!),
                                    radius: 35,
                                    useRadiusInMeter: true,
                                    color: AppColors.primary.withOpacity(0.15),
                                    borderStrokeWidth: 1.2,
                                    borderColor: AppColors.primary,
                                  ),
                                ],
                              ),
                              MarkerLayer(
                                markers: [
                                  Marker(
                                    width: 42,
                                    height: 42,
                                    point: LatLng(_latitude!, _longitude!),
                                    child: const Icon(
                                      Icons.location_on,
                                      color: AppColors.primary,
                                      size: 36,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                    const SizedBox(height: 16),

                    _buildField(
                      label: 'Land Area (acres)',
                      controller: _landAreaCtrl,
                      hint: 'e.g., 5.5',
                      keyboardType:
                          const TextInputType.numberWithOptions(decimal: true),
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
                    : Text(
                        widget.isEditMode ? 'Save Changes' : 'Continue →',
                        style: AppTextStyles.button,
                      ),
              ),
            ),
            if (!widget.isEditMode) ...[
              const SizedBox(height: 8),
              GestureDetector(
                onTap: () => context.go('/home'),
                child: Center(
                  child: Text(
                    'Skip for now',
                    style: AppTextStyles.label
                        .copyWith(color: AppColors.textMuted),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
