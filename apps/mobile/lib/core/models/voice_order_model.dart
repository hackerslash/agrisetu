enum VoiceAssistantIntent {
  placeOrder,
  trackOrders,
  pendingPayments,
  clusterStatus,
  votingStatus,
  updateProfile,
  generalQuestion,
  unknown;

  static VoiceAssistantIntent fromRaw(String? input) {
    final normalized = input
        ?.trim()
        .toUpperCase()
        .replaceAll(RegExp(r'[^A-Z]+'), '_')
        .replaceAll(RegExp(r'^_+|_+$'), '');

    switch (normalized) {
      case 'PLACE_ORDER':
      case 'PLACE':
      case 'ORDER':
        return VoiceAssistantIntent.placeOrder;
      case 'TRACK_ORDERS':
      case 'TRACK_ORDER':
      case 'TRACK':
        return VoiceAssistantIntent.trackOrders;
      case 'PENDING_PAYMENTS':
      case 'PENDING_PAYMENT':
      case 'PAYMENT_PENDING':
        return VoiceAssistantIntent.pendingPayments;
      case 'CLUSTER_STATUS':
      case 'CLUSTER':
        return VoiceAssistantIntent.clusterStatus;
      case 'VOTING_STATUS':
      case 'VOTING':
      case 'VOTE':
        return VoiceAssistantIntent.votingStatus;
      case 'UPDATE_PROFILE':
      case 'PROFILE':
      case 'EDIT_PROFILE':
        return VoiceAssistantIntent.updateProfile;
      case 'GENERAL_QUESTION':
      case 'GENERAL':
      case 'QUESTION':
        return VoiceAssistantIntent.generalQuestion;
      default:
        return VoiceAssistantIntent.unknown;
    }
  }
}

class VoiceAssistantMeta {
  final VoiceAssistantIntent intent;
  final double intentConfidence;
  final String? message;

  const VoiceAssistantMeta({
    required this.intent,
    required this.intentConfidence,
    this.message,
  });

  factory VoiceAssistantMeta.fromJson(Map<String, dynamic> json) {
    return VoiceAssistantMeta(
      intent: VoiceAssistantIntent.fromRaw(json['intent'] as String?),
      intentConfidence: (json['intentConfidence'] as num?)?.toDouble() ?? 0,
      message: json['message'] as String?,
    );
  }
}

class VoiceOrderExtraction {
  final String? product;
  final double? quantity;
  final String? unit;
  final double confidence;
  final bool needsClarification;
  final String? clarificationQuestion;
  final String? clarificationQuestionLocalized;
  final String source;

  const VoiceOrderExtraction({
    this.product,
    this.quantity,
    this.unit,
    required this.confidence,
    required this.needsClarification,
    this.clarificationQuestion,
    this.clarificationQuestionLocalized,
    required this.source,
  });

  factory VoiceOrderExtraction.fromJson(Map<String, dynamic> json) {
    return VoiceOrderExtraction(
      product: json['product'] as String?,
      quantity: (json['quantity'] as num?)?.toDouble(),
      unit: json['unit'] as String?,
      confidence: (json['confidence'] as num?)?.toDouble() ?? 0,
      needsClarification: json['needsClarification'] as bool? ?? false,
      clarificationQuestion: json['clarificationQuestion'] as String?,
      clarificationQuestionLocalized:
          json['clarificationQuestionLocalized'] as String?,
      source: json['source'] as String? ?? 'model',
    );
  }
}

class VoiceOrderResult {
  final String transcript;
  final VoiceAssistantMeta assistant;
  final VoiceOrderExtraction extraction;
  final int activeClusterProductCount;
  final bool transcribedFromAudio;
  final String? detectedLanguageCode;
  final String? clarificationLanguageCode;
  final String? clarificationAudioBase64;
  final String? clarificationAudioMimeType;
  final String? assistantAudioLanguageCode;
  final String? assistantAudioBase64;
  final String? assistantAudioMimeType;

  const VoiceOrderResult({
    required this.transcript,
    required this.assistant,
    required this.extraction,
    required this.activeClusterProductCount,
    required this.transcribedFromAudio,
    this.detectedLanguageCode,
    this.clarificationLanguageCode,
    this.clarificationAudioBase64,
    this.clarificationAudioMimeType,
    this.assistantAudioLanguageCode,
    this.assistantAudioBase64,
    this.assistantAudioMimeType,
  });

  bool get canPlaceOrder {
    if (assistant.intent != VoiceAssistantIntent.placeOrder) return false;
    return (extraction.product?.trim().isNotEmpty ?? false) &&
        extraction.quantity != null &&
        extraction.quantity! > 0 &&
        (extraction.unit?.trim().isNotEmpty ?? false);
  }

  bool get isActionable => canPlaceOrder;

  factory VoiceOrderResult.fromJson(Map<String, dynamic> json) {
    final context = json['context'] as Map<String, dynamic>? ?? const {};
    final clarificationSpeech =
        json['clarificationSpeech'] as Map<String, dynamic>? ?? const {};
    final assistantSpeech =
        json['assistantSpeech'] as Map<String, dynamic>? ?? const {};
    final extraction = VoiceOrderExtraction.fromJson(
      (json['extraction'] as Map<String, dynamic>? ?? const {}),
    );

    final assistantJson = json['assistant'] as Map<String, dynamic>?;
    final inferredIntent = (extraction.product?.trim().isNotEmpty ?? false) ||
            extraction.quantity != null ||
            (extraction.unit?.trim().isNotEmpty ?? false) ||
            extraction.needsClarification
        ? VoiceAssistantIntent.placeOrder
        : VoiceAssistantIntent.unknown;

    final assistant = assistantJson != null
        ? VoiceAssistantMeta.fromJson(assistantJson)
        : VoiceAssistantMeta(
            intent: inferredIntent,
            intentConfidence: inferredIntent == VoiceAssistantIntent.placeOrder
                ? extraction.confidence
                : 0,
            message: null,
          );

    return VoiceOrderResult(
      transcript: json['transcript'] as String? ?? '',
      assistant: assistant,
      extraction: extraction,
      activeClusterProductCount: (context['activeClusterProductCount'] ?? context['availableGigCount']) as int? ?? 0,
      transcribedFromAudio: context['transcribedFromAudio'] as bool? ?? false,
      detectedLanguageCode: context['detectedLanguageCode'] as String?,
      clarificationLanguageCode:
          context['clarificationLanguageCode'] as String?,
      clarificationAudioBase64: clarificationSpeech['audioBase64'] as String?,
      clarificationAudioMimeType: clarificationSpeech['mimeType'] as String?,
      assistantAudioLanguageCode: assistantSpeech['languageCode'] as String?,
      assistantAudioBase64: assistantSpeech['audioBase64'] as String?,
      assistantAudioMimeType: assistantSpeech['mimeType'] as String?,
    );
  }
}
