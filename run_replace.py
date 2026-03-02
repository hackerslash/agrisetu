import os
import re

replacements = {
    "Text('Order Timeline'": "Text(AppLocalizations.of(context)!.orderTimeline",
    "Text('Your Impact This Order'": "Text(AppLocalizations.of(context)!.yourImpactThisOrder",
    "Text('Rate Your Experience'": "Text(AppLocalizations.of(context)!.rateYourExperience",
    "Text('AgriSetu'": "Text(AppLocalizations.of(context)!.appTitle",
    "Text('OTP sent again'": "Text(AppLocalizations.of(context)!.otpSentAgain",
    "Text('Verify OTP'": "Text(AppLocalizations.of(context)!.verifyOtp",
    "Text('Personal Info'": "Text(AppLocalizations.of(context)!.personalInfo",
    "Text('Preferred Language'": "Text(AppLocalizations.of(context)!.preferredLanguage",
    "Text('Farm Details'": "Text(AppLocalizations.of(context)!.farmDetails",
    "Text('Crops Grown'": "Text(AppLocalizations.of(context)!.cropsGrown",
    "Text('Payment'": "Text(AppLocalizations.of(context)!.payment",
    "Text('Place New Order'": "Text(AppLocalizations.of(context)!.placeAnOrder",
    "Text('No orders yet'": "Text(AppLocalizations.of(context)!.noOrdersYet",
    "Text('Place your first order to get started'": "Text(AppLocalizations.of(context)!.placeFirstOrder",
    "Text('Looking for cluster…'": "Text(AppLocalizations.of(context)!.lookingForCluster ?? 'Looking for cluster…'",
    "Text('How was your vendor?'": "Text(AppLocalizations.of(context)!.howWasYourVendor",
    "Text('Quick tags'": "Text(AppLocalizations.of(context)!.quickTags",
    "Text('Thank you for your rating!'": "Text(AppLocalizations.of(context)!.thankYouForRating",
    "Text('Submit Rating'": "Text(AppLocalizations.of(context)!.submitRating",
    "Text('Your Total'": "Text(AppLocalizations.of(context)!.yourTotal",
    "Text('Choose Your Vendor'": "Text(AppLocalizations.of(context)!.chooseYourVendor",
    "Text('Vote for your preferred supplier'": "Text(AppLocalizations.of(context)!.voteForPreferredSupplier",
    "Text('Vote submitted!'": "Text(AppLocalizations.of(context)!.voteSubmitted",
    "Text('Waiting for other farmers in the cluster to vote'": "Text(AppLocalizations.of(context)!.waitingForOtherFarmers",
    "Text('Delivery Tracking'": "Text(AppLocalizations.of(context)!.trackDelivery",
    "Text('Rate & Review'": "Text(AppLocalizations.of(context)!.rateAndReview",
    "Text('Your Rating'": "Text(AppLocalizations.of(context)!.yourRating",
    "Text('Voice Transcript'": "Text(AppLocalizations.of(context)!.voiceTranscript",
    "Text('Matched Gig'": "Text(AppLocalizations.of(context)!.matchedGig",
    "Text('Confirm Order'": "Text(AppLocalizations.of(context)!.confirmOrder",
    "Text('You can edit details in the next step'": "Text(AppLocalizations.of(context)!.editDetailsNextStep",
    "Text('Recommended'": "Text(AppLocalizations.of(context)!.recommended",
    "Text('Vote for this Vendor'": "Text(AppLocalizations.of(context)!.voteForThisVendor",
    "Text('What we heard'": "Text(AppLocalizations.of(context)!.whatWeHeard",
    "Text('Re-record'": "Text(AppLocalizations.of(context)!.reRecord",
    "Text('Confirm'": "Text(AppLocalizations.of(context)!.confirm",
    "Text('Vote cast successfully!'": "Text(AppLocalizations.of(context)!.voteCastSuccessfully",
    "Text('Vote for Vendor'": "Text(AppLocalizations.of(context)!.voteForVendor",
    "Text('Pay Securely'": "Text(AppLocalizations.of(context)!.paySecurely",
    "Text('Payment Completed'": "Text(AppLocalizations.of(context)!.paymentCompleted",
    "Text('Track Delivery'": "Text(AppLocalizations.of(context)!.trackDelivery",
    "Text('How It Works'": "Text(AppLocalizations.of(context)!.howItWorks",
    "Text('Place an Order'": "Text(AppLocalizations.of(context)!.placeAnOrder",
    "Text('Invite Nearby Farmers'": "Text(AppLocalizations.of(context)!.inviteNearbyFarmers",
    "Text('No matching cluster found'": "Text(AppLocalizations.of(context)!.noMatchingCluster",
    "Text('No clusters yet'": "Text(AppLocalizations.of(context)!.noClustersYet",
    "Text('How Clusters Work'": "Text(AppLocalizations.of(context)!.howClustersWork",
    "Text('Avatar updated'": "Text(AppLocalizations.of(context)!.avatarUpdated",
    "Text('Order Summary'": "Text(AppLocalizations.of(context)!.orderSummary",
    "Text('Pay via UPI'": "Text(AppLocalizations.of(context)!.payViaUpi",
    "Text('Track Order'": "Text(AppLocalizations.of(context)!.trackOrder",
}

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original_content = content
    for old, new in replacements.items():
        content = content.replace(old, new)

    if "AppLocalizations.of(context)" in content and "l10n/app_localizations.dart" not in content:
        # We need to add the import
        if "import 'package:flutter/material.dart';" in content:
            # find depth
            depth = filepath.count('/') - 2
            prefix = "../" * depth
            import_str = f"import '{prefix}l10n/app_localizations.dart';"
            content = content.replace("import 'package:flutter/material.dart';", f"import 'package:flutter/material.dart';\n{import_str}")

    if content != original_content:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Updated {filepath}")

for root, _, files in os.walk('apps/mobile/lib/features'):
    for file in files:
        if file.endswith('.dart'):
            process_file(os.path.join(root, file))
