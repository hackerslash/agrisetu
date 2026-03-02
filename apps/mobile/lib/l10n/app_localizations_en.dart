// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'AgriSetu';

  @override
  String get appTagline => 'Collective Farming Power';

  @override
  String get costSavings => 'Cost Savings';

  @override
  String get farmersServed => 'Farmers Served';

  @override
  String get carbonSaved => 'Carbon Saved';

  @override
  String get welcomeTitle => 'Welcome to AgriSetu';

  @override
  String get welcomeSubtitle =>
      'Empowering farmers with collective buying power.\nLogin with your Aadhaar to get started.';

  @override
  String get selectLanguage => 'Select Language / भाषा चुनें';

  @override
  String get loginWithAadhaar => 'Login with Aadhaar';

  @override
  String get useOtpInstead => 'Use OTP instead →';

  @override
  String get navHome => 'Home';

  @override
  String get navClusters => 'Clusters';

  @override
  String get navOrders => 'Orders';

  @override
  String get navProfile => 'Profile';

  @override
  String get voiceOrderHint => 'Say \'I need 50kg urea\'...';
}
