import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import 'package:geocoding/geocoding.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../shared/widgets/app_brand_icon.dart';
import '../../../core/constants/app_constants.dart';
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

  String _normalizeLanguageCode(String? code) {
    final trimmed = (code ?? '').trim().toLowerCase();
    if (trimmed.isEmpty) return 'en';
    final parts = trimmed.split('-');
    return parts.first;
  }

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

  String? _firstNonEmpty(List<String?> candidates) {
    for (final candidate in candidates) {
      final value = candidate?.trim();
      if (value != null && value.isNotEmpty) {
        return value;
      }
    }
    return null;
  }

  bool _looksLikeCoordinateAddress(String value) {
    final input = value.trim();
    final coordinatePattern = RegExp(
      r'^Lat\s*-?\d+(\.\d+)?,\s*Lng\s*-?\d+(\.\d+)?$',
      caseSensitive: false,
    );
    return coordinatePattern.hasMatch(input);
  }

  String? _buildAddressFromPlacemark(Placemark placemark) {
    final rawParts = [
      placemark.name,
      placemark.street,
      placemark.subLocality,
      placemark.locality,
      placemark.subAdministrativeArea,
      placemark.administrativeArea,
      placemark.postalCode,
    ];

    final seen = <String>{};
    final cleanedParts = <String>[];
    for (final part in rawParts) {
      final value = part?.trim();
      if (value == null || value.isEmpty) continue;
      final key = value.toLowerCase();
      if (seen.add(key)) {
        cleanedParts.add(value);
      }
    }

    if (cleanedParts.isEmpty) return null;
    return cleanedParts.join(', ');
  }

  String? _toStringValue(dynamic value) {
    if (value == null) return null;
    if (value is! String) return null;
    final trimmed = value.trim();
    if (trimmed.isEmpty) return null;
    return trimmed;
  }

  Future<Map<String, dynamic>?> _reverseGeocodeFromNominatim({
    required double latitude,
    required double longitude,
  }) async {
    final dio = Dio(
      BaseOptions(
        connectTimeout: const Duration(seconds: 8),
        receiveTimeout: const Duration(seconds: 8),
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'AgriSetu-Mobile/1.0',
        },
      ),
    );

    final response = await dio.get(
      'https://nominatim.openstreetmap.org/reverse',
      queryParameters: {
        'lat': latitude,
        'lon': longitude,
        'format': 'jsonv2',
        'addressdetails': 1,
      },
    );

    if (response.data is Map<String, dynamic>) {
      return response.data as Map<String, dynamic>;
    }
    if (response.data is Map) {
      return Map<String, dynamic>.from(response.data as Map);
    }
    return null;
  }

  Future<Map<String, dynamic>?> _reverseGeocodeFromBigDataCloud({
    required double latitude,
    required double longitude,
  }) async {
    final dio = Dio(
      BaseOptions(
        connectTimeout: const Duration(seconds: 8),
        receiveTimeout: const Duration(seconds: 8),
        headers: {
          'Accept': 'application/json',
        },
      ),
    );

    final response = await dio.get(
      'https://api.bigdatacloud.net/data/reverse-geocode-client',
      queryParameters: {
        'latitude': latitude,
        'longitude': longitude,
        'localityLanguage': 'en',
      },
    );

    if (response.data is Map<String, dynamic>) {
      return response.data as Map<String, dynamic>;
    }
    if (response.data is Map) {
      return Map<String, dynamic>.from(response.data as Map);
    }
    return null;
  }

  String? _buildAddressFromNominatim(Map<String, dynamic> data) {
    final displayName = _toStringValue(data['display_name']);
    if (displayName != null) return displayName;

    final rawAddress = data['address'];
    if (rawAddress is! Map) return null;
    final address = Map<String, dynamic>.from(rawAddress);

    final parts = [
      _toStringValue(address['road']),
      _toStringValue(address['neighbourhood']),
      _toStringValue(address['suburb']),
      _toStringValue(address['village']),
      _toStringValue(address['town']),
      _toStringValue(address['city']),
      _toStringValue(address['county']),
      _toStringValue(address['state']),
      _toStringValue(address['postcode']),
      _toStringValue(address['country']),
    ];

    final seen = <String>{};
    final cleanedParts = <String>[];
    for (final part in parts) {
      if (part == null) continue;
      final key = part.toLowerCase();
      if (seen.add(key)) cleanedParts.add(part);
    }

    if (cleanedParts.isEmpty) return null;
    return cleanedParts.join(', ');
  }

  String? _extractDistrictFromBigDataCloud(Map<String, dynamic> data) {
    final localityInfo = data['localityInfo'];
    if (localityInfo is! Map) return null;

    final administrative = localityInfo['administrative'];
    if (administrative is! List) return null;

    for (final entry in administrative) {
      if (entry is! Map) continue;
      final item = Map<String, dynamic>.from(entry);
      final name = _toStringValue(item['name']);
      final description = _toStringValue(item['description'])?.toLowerCase();

      if (name == null) continue;
      if (description != null && description.contains('district')) {
        return name;
      }
      if (name.toLowerCase().contains(' district')) {
        return name;
      }
    }

    return null;
  }

  String? _buildAddressFromBigDataCloud(Map<String, dynamic> data) {
    final locality = _firstNonEmpty([
      _toStringValue(data['locality']),
      _toStringValue(data['city']),
    ]);
    final district = _extractDistrictFromBigDataCloud(data);
    final state = _toStringValue(data['principalSubdivision']);
    final postcode = _toStringValue(data['postcode']);
    final country = _toStringValue(data['countryName']);

    final parts = [locality, district, state, postcode, country];
    final seen = <String>{};
    final cleanedParts = <String>[];
    for (final part in parts) {
      if (part == null) continue;
      final key = part.toLowerCase();
      if (seen.add(key)) cleanedParts.add(part);
    }

    if (cleanedParts.isEmpty) return null;
    return cleanedParts.join(', ');
  }

  void _prefillLocationFieldsFromNominatim(Map<String, dynamic> data) {
    final rawAddress = data['address'];
    if (rawAddress is! Map) return;
    final address = Map<String, dynamic>.from(rawAddress);

    final village = _firstNonEmpty([
      _toStringValue(address['village']),
      _toStringValue(address['town']),
      _toStringValue(address['city']),
      _toStringValue(address['hamlet']),
      _toStringValue(address['suburb']),
      _toStringValue(address['neighbourhood']),
    ]);
    final district = _firstNonEmpty([
      _toStringValue(address['state_district']),
      _toStringValue(address['county']),
      _toStringValue(address['district']),
      _toStringValue(address['city_district']),
    ]);
    final state = _firstNonEmpty([
      _toStringValue(address['state']),
      _toStringValue(address['region']),
    ]);

    if (_villageCtrl.text.trim().isEmpty && village != null) {
      _villageCtrl.text = village;
    }
    if (_districtCtrl.text.trim().isEmpty && district != null) {
      _districtCtrl.text = district;
    }
    if (_stateCtrl.text.trim().isEmpty && state != null) {
      _stateCtrl.text = state;
    }
  }

  void _prefillLocationFieldsFromBigDataCloud(Map<String, dynamic> data) {
    final village = _firstNonEmpty([
      _toStringValue(data['locality']),
      _toStringValue(data['city']),
    ]);
    final district = _firstNonEmpty([
      _extractDistrictFromBigDataCloud(data),
      _toStringValue(data['locality']),
      _toStringValue(data['city']),
    ]);
    final state = _toStringValue(data['principalSubdivision']);

    if (_villageCtrl.text.trim().isEmpty && village != null) {
      _villageCtrl.text = village;
    }
    if (_districtCtrl.text.trim().isEmpty && district != null) {
      _districtCtrl.text = district;
    }
    if (_stateCtrl.text.trim().isEmpty && state != null) {
      _stateCtrl.text = state;
    }
  }

  void _prefillLocationFieldsFromPlacemark(Placemark placemark) {
    final village = _firstNonEmpty([
      placemark.locality,
      placemark.subLocality,
      placemark.name,
    ]);
    final district = _firstNonEmpty([
      placemark.subAdministrativeArea,
      placemark.locality,
      placemark.subLocality,
    ]);
    final state = _firstNonEmpty([placemark.administrativeArea]);

    if (_villageCtrl.text.trim().isEmpty && village != null) {
      _villageCtrl.text = village;
    }
    if (_districtCtrl.text.trim().isEmpty && district != null) {
      _districtCtrl.text = district;
    }
    if (_stateCtrl.text.trim().isEmpty && state != null) {
      _stateCtrl.text = state;
    }
  }

  bool _isPostalCodeToken(String token) {
    final digitsOnly = token.replaceAll(RegExp(r'[^0-9]'), '');
    return digitsOnly.length >= 5 && digitsOnly.length <= 6;
  }

  bool _isCountryToken(String token) {
    final normalized = token.trim().toLowerCase();
    return normalized == 'india' || normalized == 'bharat';
  }

  void _prefillLocationFieldsFromAddress(String address) {
    if (_looksLikeCoordinateAddress(address)) return;

    final parts = address
        .split(',')
        .map((part) => part.trim())
        .where((part) => part.isNotEmpty)
        .toList();
    if (parts.length < 2) return;

    final areaParts = parts
        .where((part) => !_isCountryToken(part) && !_isPostalCodeToken(part))
        .toList();
    if (areaParts.isEmpty) return;

    String? stateCandidate =
        _stateCtrl.text.trim().isNotEmpty ? _stateCtrl.text.trim() : null;
    if (stateCandidate == null) {
      stateCandidate = areaParts.last;
      _stateCtrl.text = stateCandidate;
    }

    if (_districtCtrl.text.trim().isEmpty) {
      for (var index = areaParts.length - 1; index >= 0; index--) {
        final candidate = areaParts[index];
        if (candidate != stateCandidate) {
          _districtCtrl.text = candidate;
          break;
        }
      }
    }

    if (_villageCtrl.text.trim().isEmpty) {
      final districtValue = _districtCtrl.text.trim();
      for (var index = areaParts.length - 1; index >= 0; index--) {
        final candidate = areaParts[index];
        if (candidate != stateCandidate && candidate != districtValue) {
          _villageCtrl.text = candidate;
          break;
        }
      }
    }
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
      var shouldShowAddressManualEntryError = false;
      try {
        final placemarks = await placemarkFromCoordinates(
            position.latitude, position.longitude);
        if (placemarks.isNotEmpty) {
          final p = placemarks.first;
          resolvedAddress = _buildAddressFromPlacemark(p);
          _prefillLocationFieldsFromPlacemark(p);
          if (resolvedAddress != null) {
            _prefillLocationFieldsFromAddress(resolvedAddress);
          }
        }
      } catch (_) {
        // Fall back to network reverse geocode below.
      }

      try {
        final nominatim = await _reverseGeocodeFromNominatim(
          latitude: position.latitude,
          longitude: position.longitude,
        );
        if (nominatim != null) {
          _prefillLocationFieldsFromNominatim(nominatim);
          final nominatimAddress = _buildAddressFromNominatim(nominatim);
          if (nominatimAddress != null) {
            _prefillLocationFieldsFromAddress(nominatimAddress);
            if (resolvedAddress == null || resolvedAddress.trim().isEmpty) {
              resolvedAddress = nominatimAddress;
            }
          }
        }
      } catch (_) {
        // If both reverse geocoders fail, ask user to enter address manually.
      }

      if (resolvedAddress == null || resolvedAddress.trim().isEmpty) {
        try {
          final bigDataCloud = await _reverseGeocodeFromBigDataCloud(
            latitude: position.latitude,
            longitude: position.longitude,
          );
          if (bigDataCloud != null) {
            _prefillLocationFieldsFromBigDataCloud(bigDataCloud);
            final bigDataAddress = _buildAddressFromBigDataCloud(bigDataCloud);
            if (bigDataAddress != null) {
              _prefillLocationFieldsFromAddress(bigDataAddress);
              resolvedAddress = bigDataAddress;
            }
          }
        } catch (_) {
          // If this fallback also fails, user can still enter address manually.
        }
      }

      if (resolvedAddress != null && resolvedAddress.trim().isNotEmpty) {
        _locationAddressCtrl.text = resolvedAddress;
      } else {
        final currentAddress = _locationAddressCtrl.text.trim();
        if (_looksLikeCoordinateAddress(currentAddress)) {
          _locationAddressCtrl.clear();
        }
      }

      if (_locationAddressCtrl.text.trim().isEmpty) {
        shouldShowAddressManualEntryError = true;
      }

      if (shouldShowAddressManualEntryError) {
        setState(() {
          _error =
              'Location captured, but address could not be resolved. Please enter the address manually.';
        });
      } else {
        setState(() {});
      }
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
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(AppConstants.languageKey, _selectedLanguage);
      if (!mounted) return;
      if (widget.isEditMode) {
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
      if (_locationAddressCtrl.text.trim().isNotEmpty &&
          !_looksLikeCoordinateAddress(_locationAddressCtrl.text.trim())) {
        _prefillLocationFieldsFromAddress(_locationAddressCtrl.text.trim());
      }
      _latitude = farmer.latitude;
      _longitude = farmer.longitude;
      _landAreaCtrl.text =
          farmer.landArea != null ? farmer.landArea!.toString() : '';
      _upiCtrl.text = farmer.upiId ?? '';
      final normalizedLanguage = _normalizeLanguageCode(farmer.language);
      final isAudioLanguageSupported = AppConstants.audioSupportedLanguages.any(
        (lang) => lang['code'] == normalizedLanguage,
      );
      _selectedLanguage = isAudioLanguageSupported ? normalizedLanguage : 'en';
      _cropsGrown
        ..clear()
        ..addAll(farmer.cropsGrown);
    }
    final headerLeftPadding = widget.isEditMode ? 24.0 : 24.0;
    final headerExpandedHeight = widget.isEditMode ? 120.0 : 160.0;
    final headerTopPadding = widget.isEditMode ? 10.0 : 16.0;
    final headerBottomPadding = widget.isEditMode ? 12.0 : 16.0;
    final headerTitleStyle = widget.isEditMode
        ? AppTextStyles.h2.copyWith(
            color: AppColors.surface,
            fontWeight: FontWeight.w700,
            fontSize: 24,
            height: 1.15,
          )
        : AppTextStyles.h2.copyWith(color: AppColors.surface);
    final headerSubtitleStyle = widget.isEditMode
        ? AppTextStyles.body.copyWith(
            color: AppColors.textOnPrimaryMuted,
            fontSize: 14,
            height: 1.35,
            fontWeight: FontWeight.w500,
          )
        : AppTextStyles.bodySmall.copyWith(
            color: AppColors.textOnPrimaryMuted,
          );

    return Scaffold(
      backgroundColor: AppColors.surface,
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            backgroundColor: AppColors.primary,
            expandedHeight: headerExpandedHeight,
            pinned: true,
            flexibleSpace: FlexibleSpaceBar(
              background: SafeArea(
                child: Padding(
                  padding: EdgeInsets.fromLTRB(
                    headerLeftPadding,
                    headerTopPadding,
                    24,
                    headerBottomPadding,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (!widget.isEditMode) ...[
                        Row(
                          children: [
                            Container(
                              width: 32,
                              height: 32,
                              decoration: BoxDecoration(
                                color: AppColors.surface.withOpacity(0.15),
                                shape: BoxShape.circle,
                              ),
                              child: const AppBrandIcon(
                                color: AppColors.surface,
                                size: 18,
                                padding: EdgeInsets.all(3),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              'AgriSetu',
                              style: AppTextStyles.h5
                                  .copyWith(color: AppColors.surface),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                      ],
                      const Spacer(),
                      Text(
                        widget.isEditMode
                            ? 'Edit your profile'
                            : 'Complete your profile',
                        style: headerTitleStyle,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        widget.isEditMode
                            ? 'Update your details and preferences'
                            : 'Help us personalise your experience',
                        style: headerSubtitleStyle,
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
                              'Name, location & audio language are required to match you with the right cluster.',
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
                    Text('Audio Language', style: AppTextStyles.label),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children:
                          AppConstants.audioSupportedLanguages.map((lang) {
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
                                    'com.agrisetu.mobile',
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

