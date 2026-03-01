class AppConstants {
  // API
  // static const String apiBaseUrl = 'http://10.0.2.2:3001/api/v1'; // Android emulator
  static const String apiBaseUrl =
      'http://localhost:3001/api/v1'; // iOS simulator
  // static const String apiBaseUrl = 'http://192.168.0.103:3001/api/v1'; // Physical device (Mac LAN IP)

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

  // Payment timer (24 hours in seconds)
  static const int paymentTimerSeconds = 86400;

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
