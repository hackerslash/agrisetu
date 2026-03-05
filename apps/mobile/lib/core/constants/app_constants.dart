class AppConstants {
  // API
  // Override via --dart-define=API_BASE_URL=<url>
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3001/api/v1',
  );

  // Storage keys
  static const String tokenKey = 'agrisetu_token';
  static const String farmerKey = 'agrisetu_farmer';
  static const String languageKey = 'agrisetu_language';

  // App info
  static const String appName = 'AgriSetu';
  static const String appTagline = 'Collective Farming Power';

  // OTP
  static const int otpLength = 6;
  static const int otpExpirySeconds = 600; // 10 minutes
  static const int otpResendSeconds = 30;

  // Cluster
  static const double defaultTargetQuantity = 1000;

  // Pagination
  static const int pageSize = 20;

  // Languages
  static const List<Map<String, String>> supportedLanguages = [
    {'code': 'hi', 'label': 'हिंदी', 'name': 'Hindi'},
    {'code': 'kn', 'label': 'ಕನ್ನಡ', 'name': 'Kannada'},
    {'code': 'ta', 'label': 'தமிழ்', 'name': 'Tamil'},
    {'code': 'bn', 'label': 'বাংলা', 'name': 'Bengali'},
    {'code': 'te', 'label': 'తెలుగు', 'name': 'Telugu'},
    {'code': 'en', 'label': 'English', 'name': 'English'},
  ];

  // Voice/audio order languages supported by backend speech pipeline.
  static const List<Map<String, String>> audioSupportedLanguages = [
    {'code': 'hi', 'label': 'हिंदी', 'name': 'Hindi'},
    {'code': 'kn', 'label': 'ಕನ್ನಡ', 'name': 'Kannada'},
    {'code': 'ta', 'label': 'தமிழ்', 'name': 'Tamil'},
    {'code': 'te', 'label': 'తెలుగు', 'name': 'Telugu'},
    {'code': 'bn', 'label': 'বাংলা', 'name': 'Bengali'},
    {'code': 'mr', 'label': 'मराठी', 'name': 'Marathi'},
    {'code': 'gu', 'label': 'ગુજરાતી', 'name': 'Gujarati'},
    {'code': 'ml', 'label': 'മലയാളം', 'name': 'Malayalam'},
    {'code': 'pa', 'label': 'ਪੰਜਾਬੀ', 'name': 'Punjabi'},
    {'code': 'or', 'label': 'ଓଡ଼ିଆ', 'name': 'Odia'},
    {'code': 'en', 'label': 'English', 'name': 'English'},
  ];

  // UPI Apps
  static const List<Map<String, String>> upiApps = [
    {'name': 'PhonePe', 'package': 'com.phonepe.app'},
    {'name': 'GPay', 'package': 'com.google.android.apps.nbu.paisa.user'},
    {'name': 'Scan QR', 'package': ''},
    {'name': 'BHIM', 'package': 'in.org.npci.upiapp'},
  ];

  // Reject reasons
  static const List<String> rejectReasons = [
    'Stock not available',
    'Cannot meet delivery date',
    'Quantity too small',
    'Price no longer valid',
    'Delivery location not serviceable',
    'Other',
  ];

  // Rating tags
  static const List<String> ratingTags = [
    'on-time',
    'good-quality',
    'fair-price',
    'good-packaging',
    'responsive',
    'late-delivery',
    'poor-quality',
  ];
}
