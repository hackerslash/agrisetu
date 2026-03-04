import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:audioplayers/audioplayers.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:go_router/go_router.dart';
import 'package:record/record.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/voice_order_model.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../shared/widgets/app_header.dart';

class VoiceOrderScreen extends ConsumerStatefulWidget {
  const VoiceOrderScreen({super.key});

  @override
  ConsumerState<VoiceOrderScreen> createState() => _VoiceOrderScreenState();
}

class _VoiceOrderScreenState extends ConsumerState<VoiceOrderScreen>
    with SingleTickerProviderStateMixin {
  final AudioRecorder _recorder = AudioRecorder();
  final AudioPlayer _clarificationPlayer = AudioPlayer();
  final FlutterTts _fallbackTts = FlutterTts();
  final Random _random = Random();
  static const List<String> _processingHintPool = [
    'Tuning into your order…',
    'Listening for crop and quantity…',
    'Converting your voice into an order…',
    'Matching words with marketplace items…',
  ];
  late final AnimationController _pulseController;
  late final Animation<double> _pulseAnimation;
  Timer? _recordingTimer;
  Timer? _processingTextTimer;

  bool _isRecording = false;
  bool _isProcessing = false;
  int _recordedSeconds = 0;
  int _processingHintIndex = 0;
  List<String> _processingHints = const [];
  String? _errorMessage;
  VoiceOrderResult? _voiceResult;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    )..repeat(reverse: true);

    _pulseAnimation = Tween<double>(begin: 1.0, end: 1.14).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );

    unawaited(_configureFallbackTts());
  }

  @override
  void dispose() {
    _recordingTimer?.cancel();
    _processingTextTimer?.cancel();
    _clarificationPlayer.stop();
    _clarificationPlayer.dispose();
    _fallbackTts.stop();
    _pulseController.dispose();
    _recorder.dispose();
    super.dispose();
  }

  String _formatDuration(int seconds) {
    final mins = (seconds ~/ 60).toString().padLeft(2, '0');
    final secs = (seconds % 60).toString().padLeft(2, '0');
    return '$mins:$secs';
  }

  String _quantityLabel(double quantity) {
    if (quantity % 1 == 0) return quantity.toInt().toString();
    return quantity.toStringAsFixed(2);
  }

  String _clarificationQuestionText(VoiceOrderExtraction extraction) {
    final localized = extraction.clarificationQuestionLocalized?.trim();
    if (localized != null && localized.isNotEmpty) return localized;
    return extraction.clarificationQuestion?.trim() ?? '';
  }

  String _normalizeTtsLanguageCode(String? input) {
    final normalized = input?.trim().replaceAll('_', '-').toLowerCase();
    switch (normalized) {
      case 'hi':
      case 'hi-in':
      case 'hindi':
        return 'hi-IN';
      case 'ta':
      case 'ta-in':
      case 'tamil':
        return 'ta-IN';
      case 'te':
      case 'te-in':
      case 'telugu':
        return 'te-IN';
      case 'bn':
      case 'bn-in':
      case 'bengali':
        return 'bn-IN';
      case 'kn':
      case 'kn-in':
      case 'kannada':
        return 'kn-IN';
      case 'en':
      case 'en-in':
      case 'english':
      default:
        return 'en-IN';
    }
  }

  Future<void> _configureFallbackTts() async {
    try {
      await _fallbackTts.awaitSpeakCompletion(true);
      await _fallbackTts.setSpeechRate(0.42);
      await _fallbackTts.setVolume(1.0);
      await _fallbackTts.setPitch(1.0);
    } catch (e) {
      debugPrint('Unable to configure fallback TTS: $e');
    }
  }

  Future<void> _speakClarificationFallback(VoiceOrderResult result) async {
    final text = _clarificationQuestionText(result.extraction);
    if (text.isEmpty) {
      debugPrint(
        '[voice-order][tts] fallback skipped: clarification text is empty',
      );
      return;
    }

    final preferredLanguage = _normalizeTtsLanguageCode(
      result.clarificationLanguageCode ?? result.detectedLanguageCode,
    );

    try {
      debugPrint(
        '[voice-order][tts] fallback start language=$preferredLanguage textLen=${text.length}',
      );
      await _fallbackTts.stop();
      try {
        await _fallbackTts.setLanguage(preferredLanguage);
      } catch (_) {
        try {
          await _fallbackTts
              .setLanguage(preferredLanguage.split('-').first.toLowerCase());
        } catch (_) {
          await _fallbackTts.setLanguage('en-IN');
        }
      }
      await _fallbackTts.speak(text);
      debugPrint('[voice-order][tts] fallback speaking via flutter_tts');
    } catch (e) {
      debugPrint('[voice-order][tts] fallback failed: $e');
    }
  }

  Future<void> _playClarificationQuestion(VoiceOrderResult result) async {
    if (!result.extraction.needsClarification) return;
    final audioBase64 = result.clarificationAudioBase64?.trim();
    if (audioBase64 == null || audioBase64.isEmpty) {
      debugPrint(
        '[voice-order][tts] source=aws missing audio payload, switching to fallback',
      );
      await _speakClarificationFallback(result);
      return;
    }

    try {
      final bytes = base64Decode(audioBase64);
      if (bytes.isEmpty) {
        debugPrint(
          '[voice-order][tts] source=aws empty decoded bytes, switching to fallback',
        );
        await _speakClarificationFallback(result);
        return;
      }
      await _clarificationPlayer.stop();
      await _clarificationPlayer.play(
        BytesSource(Uint8List.fromList(bytes)),
      );
      debugPrint(
        '[voice-order][tts] source=aws playback started mime=${result.clarificationAudioMimeType ?? "unknown"} bytes=${bytes.length}',
      );
    } catch (e) {
      debugPrint(
        '[voice-order][tts] source=aws playback failed: $e; switching to fallback',
      );
      await _speakClarificationFallback(result);
    }
  }

  void _startProcessingHints() {
    _processingTextTimer?.cancel();
    _processingHints = List<String>.from(_processingHintPool)..shuffle(_random);
    _processingHintIndex = 0;
    _processingTextTimer =
        Timer.periodic(const Duration(milliseconds: 1400), (_) {
      if (!mounted || !_isProcessing || _processingHints.length < 2) return;
      setState(() {
        _processingHintIndex =
            (_processingHintIndex + 1) % _processingHints.length;
      });
    });
  }

  void _stopProcessingHints() {
    _processingTextTimer?.cancel();
    _processingTextTimer = null;
    _processingHintIndex = 0;
  }

  Future<void> _startRecording() async {
    if (_isProcessing) return;
    try {
      final hasPermission = await _recorder.hasPermission();
      if (!hasPermission) {
        if (!mounted) return;
        setState(() {
          _errorMessage =
              'Microphone permission denied. Please allow mic access and try again.';
        });
        return;
      }

      const config = RecordConfig(
        encoder: kIsWeb ? AudioEncoder.opus : AudioEncoder.aacLc,
        bitRate: 128000,
        sampleRate: 44100,
        numChannels: 1,
      );

      final filePath = kIsWeb
          ? 'agrisetu_voice_${DateTime.now().millisecondsSinceEpoch}.webm'
          : '${Directory.systemTemp.path}/agrisetu_voice_${DateTime.now().millisecondsSinceEpoch}.m4a';
      await _recorder.start(
        config,
        path: filePath,
      );

      final started = await _recorder.isRecording();
      if (!started) {
        throw Exception('Recorder did not start');
      }

      _recordingTimer?.cancel();
      _recordingTimer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (!mounted) return;
        setState(() => _recordedSeconds += 1);
      });

      if (!mounted) return;
      setState(() {
        _isRecording = true;
        _recordedSeconds = 0;
        _errorMessage = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isRecording = false;
        _errorMessage = 'Unable to start microphone: $e';
      });
    }
  }

  Future<void> _stopRecordingAndProcess() async {
    try {
      _recordingTimer?.cancel();
      final path = await _recorder.stop();
      if (!mounted) return;

      setState(() {
        _isRecording = false;
      });

      if (path == null || path.isEmpty) {
        setState(() => _errorMessage = 'No audio recorded. Please try again.');
        return;
      }

      if (kIsWeb) {
        await _processWebAudioBlob(path);
        return;
      }

      await _processAudio(path);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isRecording = false;
        _errorMessage = 'Unable to stop recording: $e';
      });
    }
  }

  Future<void> _processAudio(String filePath) async {
    setState(() {
      _isProcessing = true;
      _errorMessage = null;
      _voiceResult = null;
    });
    _startProcessingHints();

    try {
      final result = await ref.read(apiClientProvider).parseVoiceOrder(
            audioFilePath: filePath,
          );
      if (!mounted) return;
      setState(() => _voiceResult = result);
      unawaited(_playClarificationQuestion(result));
    } catch (e) {
      if (!mounted) return;
      setState(() => _errorMessage = e.toString());
    } finally {
      if (!kIsWeb) {
        try {
          final file = File(filePath);
          if (await file.exists()) {
            await file.delete();
          }
        } catch (_) {}
      }

      if (mounted) {
        setState(() => _isProcessing = false);
      }
      _stopProcessingHints();
    }
  }

  Future<void> _processWebAudioBlob(String blobUrl) async {
    setState(() {
      _isProcessing = true;
      _errorMessage = null;
      _voiceResult = null;
    });
    _startProcessingHints();

    try {
      final blobResp = await Dio().get<List<int>>(
        blobUrl,
        options: Options(responseType: ResponseType.bytes),
      );
      final bytes = blobResp.data;
      if (bytes == null || bytes.isEmpty) {
        throw Exception('Recorded audio is empty.');
      }

      final result = await ref.read(apiClientProvider).parseVoiceOrder(
            audioBytes: bytes,
            audioFileName: 'agrisetu_voice.webm',
          );
      if (!mounted) return;
      setState(() => _voiceResult = result);
      unawaited(_playClarificationQuestion(result));
    } catch (e) {
      if (!mounted) return;
      setState(() => _errorMessage = e.toString());
    } finally {
      if (kIsWeb) {
        try {
          await _recorder.cancel();
        } catch (_) {}
      }
      if (mounted) {
        setState(() => _isProcessing = false);
      }
      _stopProcessingHints();
    }
  }

  @override
  void deactivate() {
    if (_isRecording) {
      _recordingTimer?.cancel();
      _recorder.stop().catchError((_) => null);
      _isRecording = false;
    }
    super.deactivate();
  }

  Future<void> _toggleRecording() async {
    try {
      if (_isRecording) {
        await _stopRecordingAndProcess();
        return;
      }
      await _startRecording();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isRecording = false;
        _errorMessage = 'Voice capture failed: $e';
      });
    }
  }

  void _reset() {
    _clarificationPlayer.stop();
    _fallbackTts.stop();
    setState(() {
      _errorMessage = null;
      _voiceResult = null;
      _recordedSeconds = 0;
    });
  }

  @override
  Widget build(BuildContext context) {
    final extraction = _voiceResult?.extraction;
    final canConfirm = _voiceResult?.isActionable == true;
    final statusLabel = _isRecording
        ? '● Listening… ${_formatDuration(_recordedSeconds)} (tap again to stop)'
        : _isProcessing
            ? (_processingHints.isEmpty
                ? 'Analyzing your voice order…'
                : _processingHints[_processingHintIndex])
            : 'Tap to record · AI extraction enabled';
    final shouldCenterPrimaryContent =
        _voiceResult == null && _errorMessage == null;

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppHeader(
        title: 'Voice Order',
        onBack: () {
          if (context.canPop()) {
            context.pop();
          } else {
            context.go('/home');
          }
        },
        trailing: const Icon(Icons.history, color: AppColors.surface, size: 24),
      ),
      body: LayoutBuilder(
        builder: (context, constraints) => SingleChildScrollView(
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: SizedBox(
              width: constraints.maxWidth,
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Align(
                  alignment: Alignment.topCenter,
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 560),
                    child: Column(
                      mainAxisAlignment: shouldCenterPrimaryContent
                          ? MainAxisAlignment.center
                          : MainAxisAlignment.start,
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        const SizedBox(height: 16),
                        Text(
                          'Tap the mic and speak your order in your language',
                          style: AppTextStyles.body.copyWith(
                            color: AppColors.primary,
                            height: 1.5,
                          ),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 32),
                        GestureDetector(
                          onTap: _isProcessing ? null : _toggleRecording,
                          child: AnimatedBuilder(
                            animation: _pulseAnimation,
                            builder: (_, child) {
                              final recordingScale = _pulseAnimation.value;
                              final processingScale =
                                  1.0 + ((recordingScale - 1.0) * 0.75);
                              final scale = _isRecording
                                  ? recordingScale
                                  : _isProcessing
                                      ? processingScale
                                      : 1.0;
                              return Transform.scale(
                                scale: scale,
                                child: child,
                              );
                            },
                            child: Container(
                              width: 220,
                              height: 220,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: _isRecording
                                    ? AppColors.error.withOpacity(0.1)
                                    : AppColors.surface,
                                boxShadow: [
                                  BoxShadow(
                                    color: _isRecording
                                        ? AppColors.error.withOpacity(0.3)
                                        : AppColors.primary.withOpacity(0.15),
                                    blurRadius: _isRecording ? 40 : 20,
                                    spreadRadius: _isRecording ? 10 : 0,
                                  ),
                                ],
                                border: Border.all(
                                  color: _isRecording
                                      ? AppColors.error.withOpacity(0.3)
                                      : AppColors.border,
                                  width: 2,
                                ),
                              ),
                              child: Center(
                                child: Container(
                                  width: 80,
                                  height: 80,
                                  decoration: BoxDecoration(
                                    color: _isRecording
                                        ? AppColors.error
                                        : AppColors.primary,
                                    shape: BoxShape.circle,
                                  ),
                                  child: Icon(
                                    _isRecording
                                        ? Icons.stop
                                        : _isProcessing
                                            ? Icons.multitrack_audio
                                            : Icons.mic,
                                    color: AppColors.surface,
                                    size: 36,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          statusLabel,
                          style: AppTextStyles.body.copyWith(
                            color: _isRecording
                                ? AppColors.error
                                : AppColors.primary,
                            fontWeight: FontWeight.w500,
                          ),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 24),
                        if (_errorMessage != null) ...[
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: AppColors.error.withOpacity(0.08),
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Text(
                              _errorMessage!,
                              style: AppTextStyles.bodySmall
                                  .copyWith(color: AppColors.error),
                            ),
                          ),
                          const SizedBox(height: 16),
                        ],
                        if (_voiceResult != null) ...[
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(20),
                            decoration: BoxDecoration(
                              color: AppColors.inputBackground,
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    const Icon(Icons.text_fields,
                                        size: 16, color: AppColors.textMuted),
                                    const SizedBox(width: 6),
                                    Text('What we heard',
                                        style: AppTextStyles.caption),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  '"${_voiceResult!.transcript}"',
                                  style: AppTextStyles.body.copyWith(
                                    color: AppColors.primary,
                                    fontStyle: FontStyle.italic,
                                  ),
                                ),
                                if ((_voiceResult!.detectedLanguageCode ?? '')
                                    .isNotEmpty) ...[
                                  const SizedBox(height: 8),
                                  Text(
                                    'Language: ${_voiceResult!.detectedLanguageCode}',
                                    style: AppTextStyles.caption,
                                  ),
                                ],
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(20),
                            decoration: BoxDecoration(
                              color: AppColors.primary,
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Extracted Order',
                                  style: AppTextStyles.label
                                      .copyWith(color: AppColors.surface),
                                ),
                                const SizedBox(height: 16),
                                Row(
                                  children: [
                                    Expanded(
                                      child: _ExtractedField(
                                        label: 'Product',
                                        value: extraction?.cropName ??
                                            'Not detected',
                                      ),
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: _ExtractedField(
                                        label: 'Quantity',
                                        value: extraction?.quantity != null &&
                                                extraction?.unit != null
                                            ? '${_quantityLabel(extraction!.quantity!)} ${extraction.unit}'
                                            : 'Not detected',
                                      ),
                                    ),
                                  ],
                                ),
                                if ((extraction?.matchedGigLabel ?? '')
                                    .isNotEmpty) ...[
                                  const SizedBox(height: 12),
                                  _ExtractedField(
                                    label: 'Matched Gig',
                                    value: extraction!.matchedGigLabel!,
                                  ),
                                ],
                                const SizedBox(height: 10),
                                Text(
                                  'Confidence ${(extraction!.confidence * 100).toStringAsFixed(0)}% · ${extraction.source.toUpperCase()}',
                                  style: AppTextStyles.caption.copyWith(
                                      color: AppColors.textOnPrimaryMuted),
                                ),
                                if (extraction.needsClarification &&
                                    _clarificationQuestionText(extraction)
                                        .isNotEmpty) ...[
                                  const SizedBox(height: 8),
                                  Text(
                                    _clarificationQuestionText(extraction),
                                    style: AppTextStyles.bodySmall
                                        .copyWith(color: AppColors.surface),
                                  ),
                                  const SizedBox(height: 8),
                                  TextButton.icon(
                                    onPressed: _isProcessing
                                        ? null
                                        : () => unawaited(
                                            _playClarificationQuestion(
                                                _voiceResult!),
                                          ),
                                    icon: const Icon(
                                      Icons.volume_up,
                                      color: AppColors.surface,
                                      size: 18,
                                    ),
                                    label: Text(
                                      'Hear question',
                                      style: AppTextStyles.caption.copyWith(
                                        color: AppColors.surface,
                                      ),
                                    ),
                                    style: TextButton.styleFrom(
                                      padding: EdgeInsets.zero,
                                      minimumSize: const Size(0, 24),
                                      tapTargetSize:
                                          MaterialTapTargetSize.shrinkWrap,
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                          const SizedBox(height: 20),
                          Row(
                            children: [
                              Expanded(
                                child: OutlinedButton.icon(
                                  onPressed: _isProcessing ? null : _reset,
                                  icon: const Icon(Icons.refresh, size: 18),
                                  label: const Text('Re-record'),
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor: AppColors.primary,
                                    side: const BorderSide(
                                        color: AppColors.primary, width: 1.5),
                                    shape: const StadiumBorder(),
                                    padding: const EdgeInsets.symmetric(
                                        vertical: 14),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: ElevatedButton.icon(
                                  onPressed: canConfirm
                                      ? () {
                                          final resolvedExtraction =
                                              _voiceResult!.extraction;
                                          final qty =
                                              resolvedExtraction.quantity!;
                                          context.push(
                                            '/orders/new',
                                            extra: {
                                              'crop':
                                                  resolvedExtraction.cropName,
                                              'quantity': qty % 1 == 0
                                                  ? qty.toInt().toString()
                                                  : qty.toString(),
                                              'unit': resolvedExtraction.unit,
                                              'transcript':
                                                  _voiceResult!.transcript,
                                              'confidence':
                                                  resolvedExtraction.confidence,
                                              'matchedGigId': resolvedExtraction
                                                  .matchedGigId,
                                              'matchedGigLabel':
                                                  resolvedExtraction
                                                      .matchedGigLabel,
                                              'extractionSource':
                                                  resolvedExtraction.source,
                                            },
                                          );
                                        }
                                      : null,
                                  icon: const Icon(Icons.check, size: 18),
                                  label: const Text('Confirm'),
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: AppColors.primary,
                                    shape: const StadiumBorder(),
                                    elevation: 0,
                                    padding: const EdgeInsets.symmetric(
                                        vertical: 14),
                                    textStyle: AppTextStyles.button,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ] else
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: AppColors.inputBackground,
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: Column(
                              children: [
                                Text(
                                  'You can say things like:',
                                  style: AppTextStyles.caption,
                                ),
                                const SizedBox(height: 8),
                                const _ExamplePhrase(
                                    text: '"मुझे 100 किलो यूरिया चाहिए"'),
                                const _ExamplePhrase(
                                    text: '"I need 5 bags of DAP fertilizer"'),
                                const _ExamplePhrase(
                                    text:
                                        '"నాకు 50 కేజీల టమాట విత్తనాలు కావాలి"'),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ExtractedField extends StatelessWidget {
  final String label;
  final String value;

  const _ExtractedField({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surface.withOpacity(0.15),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: AppTextStyles.caption.copyWith(
              color: AppColors.textOnPrimaryMuted,
              fontSize: 10,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: AppTextStyles.label.copyWith(color: AppColors.surface),
          ),
        ],
      ),
    );
  }
}

class _ExamplePhrase extends StatelessWidget {
  final String text;

  const _ExamplePhrase({required this.text});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Text(
        text,
        style: AppTextStyles.bodySmall.copyWith(
          color: AppColors.primary,
          fontStyle: FontStyle.italic,
        ),
        textAlign: TextAlign.center,
      ),
    );
  }
}
