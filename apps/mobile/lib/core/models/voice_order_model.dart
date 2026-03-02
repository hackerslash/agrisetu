class VoiceOrderExtraction {
  final String? cropName;
  final double? quantity;
  final String? unit;
  final String? matchedGigId;
  final String? matchedGigLabel;
  final double confidence;
  final bool needsClarification;
  final String? clarificationQuestion;
  final String source;

  const VoiceOrderExtraction({
    this.cropName,
    this.quantity,
    this.unit,
    this.matchedGigId,
    this.matchedGigLabel,
    required this.confidence,
    required this.needsClarification,
    this.clarificationQuestion,
    required this.source,
  });

  factory VoiceOrderExtraction.fromJson(Map<String, dynamic> json) {
    return VoiceOrderExtraction(
      cropName: json['cropName'] as String?,
      quantity: (json['quantity'] as num?)?.toDouble(),
      unit: json['unit'] as String?,
      matchedGigId: json['matchedGigId'] as String?,
      matchedGigLabel: json['matchedGigLabel'] as String?,
      confidence: (json['confidence'] as num?)?.toDouble() ?? 0,
      needsClarification: json['needsClarification'] as bool? ?? false,
      clarificationQuestion: json['clarificationQuestion'] as String?,
      source: json['source'] as String? ?? 'model',
    );
  }
}

class VoiceOrderResult {
  final String transcript;
  final VoiceOrderExtraction extraction;
  final int availableGigCount;
  final bool transcribedFromAudio;
  final String? detectedLanguageCode;

  const VoiceOrderResult({
    required this.transcript,
    required this.extraction,
    required this.availableGigCount,
    required this.transcribedFromAudio,
    this.detectedLanguageCode,
  });

  bool get isActionable =>
      (extraction.cropName?.trim().isNotEmpty ?? false) &&
      extraction.quantity != null &&
      extraction.quantity! > 0 &&
      (extraction.unit?.trim().isNotEmpty ?? false);

  factory VoiceOrderResult.fromJson(Map<String, dynamic> json) {
    final context = json['context'] as Map<String, dynamic>? ?? const {};
    return VoiceOrderResult(
      transcript: json['transcript'] as String? ?? '',
      extraction: VoiceOrderExtraction.fromJson(
        (json['extraction'] as Map<String, dynamic>? ?? const {}),
      ),
      availableGigCount: context['availableGigCount'] as int? ?? 0,
      transcribedFromAudio: context['transcribedFromAudio'] as bool? ?? false,
      detectedLanguageCode: context['detectedLanguageCode'] as String?,
    );
  }
}
