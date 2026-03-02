import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_bn.dart';
import 'app_localizations_en.dart';
import 'app_localizations_hi.dart';
import 'app_localizations_kn.dart';
import 'app_localizations_ta.dart';
import 'app_localizations_te.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
      : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('bn'),
    Locale('en'),
    Locale('hi'),
    Locale('kn'),
    Locale('ta'),
    Locale('te')
  ];

  /// No description provided for @appTitle.
  ///
  /// In en, this message translates to:
  /// **'AgriSetu'**
  String get appTitle;

  /// No description provided for @appTagline.
  ///
  /// In en, this message translates to:
  /// **'Collective Farming Power'**
  String get appTagline;

  /// No description provided for @costSavings.
  ///
  /// In en, this message translates to:
  /// **'Cost Savings'**
  String get costSavings;

  /// No description provided for @farmersServed.
  ///
  /// In en, this message translates to:
  /// **'Farmers Served'**
  String get farmersServed;

  /// No description provided for @carbonSaved.
  ///
  /// In en, this message translates to:
  /// **'Carbon Saved'**
  String get carbonSaved;

  /// No description provided for @welcomeTitle.
  ///
  /// In en, this message translates to:
  /// **'Welcome to AgriSetu'**
  String get welcomeTitle;

  /// No description provided for @welcomeSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Empowering farmers with collective buying power.\nLogin with your Aadhaar to get started.'**
  String get welcomeSubtitle;

  /// No description provided for @selectLanguage.
  ///
  /// In en, this message translates to:
  /// **'Select Language / भाषा चुनें'**
  String get selectLanguage;

  /// No description provided for @loginWithAadhaar.
  ///
  /// In en, this message translates to:
  /// **'Login with Aadhaar'**
  String get loginWithAadhaar;

  /// No description provided for @useOtpInstead.
  ///
  /// In en, this message translates to:
  /// **'Use OTP instead →'**
  String get useOtpInstead;

  /// No description provided for @navHome.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get navHome;

  /// No description provided for @navClusters.
  ///
  /// In en, this message translates to:
  /// **'Clusters'**
  String get navClusters;

  /// No description provided for @navOrders.
  ///
  /// In en, this message translates to:
  /// **'Orders'**
  String get navOrders;

  /// No description provided for @navProfile.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get navProfile;

  /// No description provided for @voiceOrderHint.
  ///
  /// In en, this message translates to:
  /// **'Say \'I need 50kg urea\'...'**
  String get voiceOrderHint;

  /// No description provided for @editProfile.
  ///
  /// In en, this message translates to:
  /// **'Edit Profile'**
  String get editProfile;

  /// No description provided for @inviteNearbyFarmers.
  ///
  /// In en, this message translates to:
  /// **'Invite Nearby Farmers'**
  String get inviteNearbyFarmers;

  /// No description provided for @signOut.
  ///
  /// In en, this message translates to:
  /// **'Sign Out'**
  String get signOut;

  /// No description provided for @placeAnOrder.
  ///
  /// In en, this message translates to:
  /// **'Place an Order'**
  String get placeAnOrder;

  /// No description provided for @trackOrder.
  ///
  /// In en, this message translates to:
  /// **'Track Order'**
  String get trackOrder;

  /// No description provided for @trackDelivery.
  ///
  /// In en, this message translates to:
  /// **'Track Delivery'**
  String get trackDelivery;

  /// No description provided for @paySecurely.
  ///
  /// In en, this message translates to:
  /// **'Pay Securely'**
  String get paySecurely;

  /// No description provided for @confirm.
  ///
  /// In en, this message translates to:
  /// **'Confirm'**
  String get confirm;

  /// No description provided for @reRecord.
  ///
  /// In en, this message translates to:
  /// **'Re-record'**
  String get reRecord;

  /// No description provided for @paymentCompleted.
  ///
  /// In en, this message translates to:
  /// **'Payment Completed'**
  String get paymentCompleted;

  /// No description provided for @avatarUpdated.
  ///
  /// In en, this message translates to:
  /// **'Avatar updated'**
  String get avatarUpdated;

  /// No description provided for @otpSentAgain.
  ///
  /// In en, this message translates to:
  /// **'OTP sent again'**
  String get otpSentAgain;

  /// No description provided for @thankYouForRating.
  ///
  /// In en, this message translates to:
  /// **'Thank you for your rating!'**
  String get thankYouForRating;

  /// No description provided for @voteCastSuccessfully.
  ///
  /// In en, this message translates to:
  /// **'Vote cast successfully!'**
  String get voteCastSuccessfully;

  /// No description provided for @orderSummary.
  ///
  /// In en, this message translates to:
  /// **'Order Summary'**
  String get orderSummary;

  /// No description provided for @personalInfo.
  ///
  /// In en, this message translates to:
  /// **'Personal Info'**
  String get personalInfo;

  /// No description provided for @farmDetails.
  ///
  /// In en, this message translates to:
  /// **'Farm Details'**
  String get farmDetails;

  /// No description provided for @cropsGrown.
  ///
  /// In en, this message translates to:
  /// **'Crops Grown'**
  String get cropsGrown;

  /// No description provided for @preferredLanguage.
  ///
  /// In en, this message translates to:
  /// **'Preferred Language'**
  String get preferredLanguage;

  /// No description provided for @howItWorks.
  ///
  /// In en, this message translates to:
  /// **'How It Works'**
  String get howItWorks;

  /// No description provided for @howClustersWork.
  ///
  /// In en, this message translates to:
  /// **'How Clusters Work'**
  String get howClustersWork;

  /// No description provided for @chooseYourVendor.
  ///
  /// In en, this message translates to:
  /// **'Choose Your Vendor'**
  String get chooseYourVendor;

  /// No description provided for @voteForVendor.
  ///
  /// In en, this message translates to:
  /// **'Vote for Vendor'**
  String get voteForVendor;

  /// No description provided for @submitRating.
  ///
  /// In en, this message translates to:
  /// **'Submit Rating'**
  String get submitRating;

  /// No description provided for @rateYourExperience.
  ///
  /// In en, this message translates to:
  /// **'Rate Your Experience'**
  String get rateYourExperience;

  /// No description provided for @orderTimeline.
  ///
  /// In en, this message translates to:
  /// **'Order Timeline'**
  String get orderTimeline;

  /// No description provided for @orderProgress.
  ///
  /// In en, this message translates to:
  /// **'Order Progress'**
  String get orderProgress;

  /// No description provided for @yourImpactThisOrder.
  ///
  /// In en, this message translates to:
  /// **'Your Impact This Order'**
  String get yourImpactThisOrder;

  /// No description provided for @verifyOtp.
  ///
  /// In en, this message translates to:
  /// **'Verify OTP'**
  String get verifyOtp;

  /// No description provided for @payment.
  ///
  /// In en, this message translates to:
  /// **'Payment'**
  String get payment;

  /// No description provided for @noOrdersYet.
  ///
  /// In en, this message translates to:
  /// **'No orders yet'**
  String get noOrdersYet;

  /// No description provided for @placeFirstOrder.
  ///
  /// In en, this message translates to:
  /// **'Place your first order to get started'**
  String get placeFirstOrder;

  /// No description provided for @howWasYourVendor.
  ///
  /// In en, this message translates to:
  /// **'How was your vendor?'**
  String get howWasYourVendor;

  /// No description provided for @quickTags.
  ///
  /// In en, this message translates to:
  /// **'Quick tags'**
  String get quickTags;

  /// No description provided for @yourTotal.
  ///
  /// In en, this message translates to:
  /// **'Your Total'**
  String get yourTotal;

  /// No description provided for @voteForPreferredSupplier.
  ///
  /// In en, this message translates to:
  /// **'Vote for your preferred supplier'**
  String get voteForPreferredSupplier;

  /// No description provided for @voteSubmitted.
  ///
  /// In en, this message translates to:
  /// **'Vote submitted!'**
  String get voteSubmitted;

  /// No description provided for @waitingForOtherFarmers.
  ///
  /// In en, this message translates to:
  /// **'Waiting for other farmers in the cluster to vote'**
  String get waitingForOtherFarmers;

  /// No description provided for @rateAndReview.
  ///
  /// In en, this message translates to:
  /// **'Rate & Review'**
  String get rateAndReview;

  /// No description provided for @yourRating.
  ///
  /// In en, this message translates to:
  /// **'Your Rating'**
  String get yourRating;

  /// No description provided for @voiceTranscript.
  ///
  /// In en, this message translates to:
  /// **'Voice Transcript'**
  String get voiceTranscript;

  /// No description provided for @matchedGig.
  ///
  /// In en, this message translates to:
  /// **'Matched Gig'**
  String get matchedGig;

  /// No description provided for @confirmOrder.
  ///
  /// In en, this message translates to:
  /// **'Confirm Order'**
  String get confirmOrder;

  /// No description provided for @editDetailsNextStep.
  ///
  /// In en, this message translates to:
  /// **'You can edit details in the next step'**
  String get editDetailsNextStep;

  /// No description provided for @recommended.
  ///
  /// In en, this message translates to:
  /// **'Recommended'**
  String get recommended;

  /// No description provided for @voteForThisVendor.
  ///
  /// In en, this message translates to:
  /// **'Vote for this Vendor'**
  String get voteForThisVendor;

  /// No description provided for @whatWeHeard.
  ///
  /// In en, this message translates to:
  /// **'What we heard'**
  String get whatWeHeard;

  /// No description provided for @noMatchingCluster.
  ///
  /// In en, this message translates to:
  /// **'No matching cluster found'**
  String get noMatchingCluster;

  /// No description provided for @noClustersYet.
  ///
  /// In en, this message translates to:
  /// **'No clusters yet'**
  String get noClustersYet;

  /// No description provided for @payViaUpi.
  ///
  /// In en, this message translates to:
  /// **'Pay via UPI'**
  String get payViaUpi;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) => <String>[
        'bn',
        'en',
        'hi',
        'kn',
        'ta',
        'te'
      ].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'bn':
      return AppLocalizationsBn();
    case 'en':
      return AppLocalizationsEn();
    case 'hi':
      return AppLocalizationsHi();
    case 'kn':
      return AppLocalizationsKn();
    case 'ta':
      return AppLocalizationsTa();
    case 'te':
      return AppLocalizationsTe();
  }

  throw FlutterError(
      'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
      'an issue with the localizations generation tool. Please file an issue '
      'on GitHub with a reproducible sample app and the gen-l10n configuration '
      'that was used.');
}
