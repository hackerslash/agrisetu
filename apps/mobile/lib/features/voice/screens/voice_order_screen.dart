import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:go_router/go_router.dart';
import 'package:record/record.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../../../core/api/api_client.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/models/voice_order_model.dart';
import '../../../core/providers/auth_provider.dart';
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
  StreamSubscription<Uint8List>? _audioStreamSub;
  StreamSubscription<dynamic>? _voiceSocketSub;
  WebSocketChannel? _voiceSocket;
  Completer<VoiceOrderResult>? _voiceResultCompleter;

  bool _isRecording = false;
  bool _isProcessing = false;
  int _recordedSeconds = 0;
  int _processingHintIndex = 0;
  List<String> _processingHints = const [];
  late String _voiceConversationSessionId;
  String? _errorMessage;
  String _liveTranscript = '';
  String? _liveDetectedLanguageCode;
  VoiceOrderResult? _voiceResult;

  @override
  void initState() {
    super.initState();
    _voiceConversationSessionId = _buildConversationSessionId();
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
    _audioStreamSub?.cancel();
    _voiceSocketSub?.cancel();
    _voiceSocket?.sink.close();
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
      case 'mr':
      case 'mr-in':
      case 'marathi':
        return 'mr-IN';
      case 'gu':
      case 'gu-in':
      case 'gujarati':
        return 'gu-IN';
      case 'ml':
      case 'ml-in':
      case 'malayalam':
        return 'ml-IN';
      case 'pa':
      case 'pa-in':
      case 'punjabi':
        return 'pa-IN';
      case 'or':
      case 'or-in':
      case 'odia':
      case 'oriya':
        return 'or-IN';
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

  Uri _buildVoiceStreamUri(String token) {
    final base = Uri.parse(AppConstants.apiBaseUrl);
    final wsScheme = base.scheme == 'https' ? 'wss' : 'ws';
    final pathSegments = [
      ...base.pathSegments.where((segment) => segment.isNotEmpty),
      'farmer',
      'voice',
      'stream',
    ];
    return base.replace(
      scheme: wsScheme,
      pathSegments: pathSegments,
      queryParameters: {'token': token},
      fragment: null,
    );
  }

  String _buildConversationSessionId() {
    final timestamp = DateTime.now().microsecondsSinceEpoch;
    final nonce = _random.nextInt(0x7fffffff).toRadixString(36);
    return 'voice_${timestamp}_$nonce';
  }

  void _resetVoiceModuleContextOnExit() {
    _recordingTimer?.cancel();
    _stopProcessingHints();
    _clarificationPlayer.stop();
    _fallbackTts.stop();
    unawaited(_closeVoiceStream());
    _isRecording = false;
    _isProcessing = false;
    _recordedSeconds = 0;
    _errorMessage = null;
    _voiceResult = null;
    _liveTranscript = '';
    _liveDetectedLanguageCode = null;
    _voiceConversationSessionId = _buildConversationSessionId();
  }

  Future<void> _closeVoiceStream() async {
    await _audioStreamSub?.cancel();
    _audioStreamSub = null;
    await _voiceSocketSub?.cancel();
    _voiceSocketSub = null;
    try {
      await _voiceSocket?.sink.close();
    } catch (_) {}
    _voiceSocket = null;
    _voiceResultCompleter = null;
  }

  void _completeVoiceResultError(Object error) {
    final completer = _voiceResultCompleter;
    if (completer != null && !completer.isCompleted) {
      completer.completeError(error);
    }
  }

  void _handleVoiceSocketMessage(dynamic event) {
    if (event is! String) return;
    Map<String, dynamic> decoded;
    try {
      final raw = jsonDecode(event);
      if (raw is! Map<String, dynamic>) return;
      decoded = raw;
    } catch (_) {
      return;
    }
    final type = decoded['type'] as String?;
    if (type == null) return;

    if (type == 'transcript') {
      final transcript = decoded['transcript'] as String? ?? '';
      final language = decoded['detectedLanguageCode'] as String?;
      if (!mounted) return;
      setState(() {
        _liveTranscript = transcript;
        _liveDetectedLanguageCode = language;
      });
      return;
    }

    if (type == 'final_result') {
      final data = decoded['data'];
      if (data is! Map<String, dynamic>) {
        _completeVoiceResultError(
          const ApiException('Invalid response from voice stream.'),
        );
        return;
      }
      final completer = _voiceResultCompleter;
      if (completer != null && !completer.isCompleted) {
        completer.complete(VoiceOrderResult.fromJson(data));
      }
      return;
    }

    if (type == 'error') {
      final message =
          decoded['message'] as String? ?? 'Voice stream failed. Please retry.';
      _completeVoiceResultError(ApiException(message));
    }
  }

  Future<void> _startRealtimeRecording() async {
    final token = await ref.read(apiClientProvider).getToken();
    if (token == null || token.isEmpty) {
      throw const ApiException('Session expired. Please login again.');
    }
    final prefs = await SharedPreferences.getInstance();
    final profileLanguageCode = ref.read(currentFarmerProvider)?.language;
    final selectedLanguageCode = profileLanguageCode ??
        prefs.getString(AppConstants.languageKey) ??
        'en';
    final languageHint = _normalizeTtsLanguageCode(selectedLanguageCode);

    final streamUri = _buildVoiceStreamUri(token);
    final socket = WebSocketChannel.connect(streamUri);
    _voiceSocket = socket;
    _voiceResultCompleter = Completer<VoiceOrderResult>();

    _voiceSocketSub = socket.stream.listen(
      _handleVoiceSocketMessage,
      onError: (Object error) {
        _completeVoiceResultError(error);
      },
      onDone: () {
        if (!(_voiceResultCompleter?.isCompleted ?? true)) {
          _completeVoiceResultError(
            const ApiException('Voice stream disconnected unexpectedly.'),
          );
        }
      },
      cancelOnError: false,
    );

    socket.sink.add(
      jsonEncode({
        'type': 'start',
        'sampleRateHertz': 16000,
        'languageCode': languageHint,
        'conversationSessionId': _voiceConversationSessionId,
      }),
    );

    final audioStream = await _recorder.startStream(
      const RecordConfig(
        encoder: AudioEncoder.pcm16bits,
        sampleRate: 16000,
        numChannels: 1,
      ),
    );

    _audioStreamSub = audioStream.listen(
      (chunk) {
        if (chunk.isEmpty) return;
        _voiceSocket?.sink.add(chunk);
      },
      onError: (Object error) {
        _completeVoiceResultError(error);
      },
      cancelOnError: false,
    );
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

      await _startRealtimeRecording();

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
        _voiceResult = null;
        _liveTranscript = '';
        _liveDetectedLanguageCode = null;
      });
    } catch (e) {
      await _closeVoiceStream();
      if (!mounted) return;
      setState(() {
        _isRecording = false;
        _errorMessage = 'Unable to start microphone: $e';
      });
    }
  }

  Future<void> _stopRecordingAndProcess() async {
    setState(() {
      _isRecording = false;
      _isProcessing = true;
      _errorMessage = null;
      _voiceResult = null;
    });
    _startProcessingHints();

    try {
      await _recorder.stop();
      await _audioStreamSub?.cancel();
      _audioStreamSub = null;
      _voiceSocket?.sink.add(jsonEncode({'type': 'end'}));

      final resultFuture = _voiceResultCompleter?.future;
      if (resultFuture == null) {
        throw const ApiException('Voice stream not initialized.');
      }

      final result = await resultFuture.timeout(
        const Duration(seconds: 50),
      );
      if (!mounted) return;
      setState(() => _voiceResult = result);
      unawaited(_playClarificationQuestion(result));
    } catch (e) {
      if (!mounted) return;
      setState(() => _errorMessage = e.toString());
    } finally {
      await _closeVoiceStream();
      if (mounted) {
        setState(() => _isProcessing = false);
      }
      _stopProcessingHints();
    }
  }

  @override
  void deactivate() {
    if (_isRecording) {
      _recorder.stop().catchError((_) => null);
    }
    _resetVoiceModuleContextOnExit();
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
    unawaited(_closeVoiceStream());
    setState(() {
      _errorMessage = null;
      _voiceResult = null;
      _recordedSeconds = 0;
      _liveTranscript = '';
      _liveDetectedLanguageCode = null;
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
    final liveTranscript = _liveTranscript.trim();
    final shouldCenterPrimaryContent =
        _voiceResult == null && _errorMessage == null;

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppHeader(
        title: 'Voice Order',
        onBack: () {
          _resetVoiceModuleContextOnExit();
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
                        if (_isRecording && liveTranscript.isNotEmpty) ...[
                          const SizedBox(height: 12),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: AppColors.inputBackground,
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Live transcript',
                                  style: AppTextStyles.caption,
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  liveTranscript,
                                  style: AppTextStyles.body.copyWith(
                                    color: AppColors.primary,
                                  ),
                                ),
                                if ((_liveDetectedLanguageCode ?? '')
                                    .isNotEmpty) ...[
                                  const SizedBox(height: 6),
                                  Text(
                                    'Language: $_liveDetectedLanguageCode',
                                    style: AppTextStyles.caption,
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ],
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
                                          final voiceResult = _voiceResult;
                                          if (voiceResult == null) return;
                                          final resolvedExtraction =
                                              voiceResult.extraction;
                                          final qty =
                                              resolvedExtraction.quantity!;
                                          _resetVoiceModuleContextOnExit();
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
                                                  voiceResult.transcript,
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
