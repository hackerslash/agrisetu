import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:record/record.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import '../../../core/api/api_client.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/models/order_model.dart';
import '../../../core/models/voice_order_model.dart';
import '../../../core/providers/auth_provider.dart';
import '../../../features/orders/widgets/order_summary_card.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../shared/widgets/app_header.dart';
import '../../../shared/widgets/status_badge.dart';

final voiceAssistantOrdersProvider =
    FutureProvider.autoDispose<List<Order>>((ref) async {
  final api = ref.read(apiClientProvider);
  final rawOrders = await api.getOrders();
  return rawOrders
      .map((raw) => Order.fromJson(raw as Map<String, dynamic>))
      .toList();
});

final voiceAssistantClustersProvider =
    FutureProvider.autoDispose<List<Cluster>>((ref) async {
  final api = ref.read(apiClientProvider);
  final rawClusters = await api.getClusters();
  return rawClusters
      .map((raw) => Cluster.fromJson(raw as Map<String, dynamic>))
      .toList();
});

class VoiceOrderScreen extends ConsumerStatefulWidget {
  const VoiceOrderScreen({super.key});

  @override
  ConsumerState<VoiceOrderScreen> createState() => _VoiceOrderScreenState();
}

class _VoiceOrderScreenState extends ConsumerState<VoiceOrderScreen>
    with SingleTickerProviderStateMixin {
  final AudioRecorder _recorder = AudioRecorder();
  final AudioPlayer _clarificationPlayer = AudioPlayer();
  final AudioPlayer _assistantPlayer = AudioPlayer();
  final Random _random = Random();

  static const List<String> _processingHintPool = [
    'Understanding your request…',
    'Checking orders, payments, and clusters…',
    'Preparing your voice assistant response…',
    'Matching your request with farm actions…',
  ];
  static const int _silenceAutoSubmitMs = 2500;
  static const int _recordingSampleRateHz = 16000;
  static const double _silenceRmsThreshold = 550;

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
  bool _isConfirming = false;
  int _recordedSeconds = 0;
  int _processingHintIndex = 0;
  List<String> _processingHints = const [];
  late String _voiceConversationSessionId;
  String? _errorMessage;
  String _liveTranscript = '';
  String? _liveDetectedLanguageCode;
  VoiceOrderResult? _voiceResult;
  bool _handledNavigationForCurrentResult = false;
  bool _hasDetectedSpeechInCurrentRecording = false;
  int _silenceAccumulatedMs = 0;
  bool _autoSubmittingForSilence = false;

  // Inline-editable order fields (overrides extraction values)
  String? _editedProduct;
  double? _editedQuantity;
  String? _editedUnit;

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
    _assistantPlayer.stop();
    _assistantPlayer.dispose();
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

  Future<void> _playClarificationQuestion(VoiceOrderResult result) async {
    if (!result.extraction.needsClarification) return;
    final audioBase64 = result.clarificationAudioBase64?.trim();

    if (audioBase64 == null || audioBase64.isEmpty) {
      return;
    }

    try {
      final bytes = base64Decode(audioBase64);
      if (bytes.isEmpty) {
        return;
      }
      await _assistantPlayer.stop();
      await _clarificationPlayer.stop();
      await _clarificationPlayer.play(BytesSource(Uint8List.fromList(bytes)));
    } catch (e) {
      debugPrint('[voice-order][tts] clarification playback failed: $e');
    }
  }

  Future<void> _playAssistantSpeech(VoiceOrderResult result) async {
    if (result.assistant.intent == VoiceAssistantIntent.placeOrder) return;

    final audioBase64 = result.assistantAudioBase64?.trim();
    if (audioBase64 == null || audioBase64.isEmpty) return;

    try {
      final bytes = base64Decode(audioBase64);
      if (bytes.isEmpty) return;
      await _clarificationPlayer.stop();
      await _assistantPlayer.stop();
      await _assistantPlayer.play(BytesSource(Uint8List.fromList(bytes)));
    } catch (e) {
      debugPrint('[voice-order][tts] assistant playback failed: $e');
    }
  }

  void _resetSilenceDetectionState() {
    _hasDetectedSpeechInCurrentRecording = false;
    _silenceAccumulatedMs = 0;
    _autoSubmittingForSilence = false;
  }

  int _chunkDurationMs(Uint8List chunk) {
    final sampleCount = chunk.lengthInBytes ~/ 2;
    if (sampleCount <= 0) return 0;
    return ((sampleCount / _recordingSampleRateHz) * 1000).round();
  }

  double _chunkRms(Uint8List chunk) {
    final sampleCount = chunk.lengthInBytes ~/ 2;
    if (sampleCount <= 0) return 0;

    final data = ByteData.sublistView(chunk);
    double sumSquares = 0;
    for (var i = 0; i < sampleCount; i += 1) {
      final sample = data.getInt16(i * 2, Endian.little).toDouble();
      sumSquares += sample * sample;
    }
    return sqrt(sumSquares / sampleCount);
  }

  bool _chunkHasSpeech(Uint8List chunk) {
    return _chunkRms(chunk) >= _silenceRmsThreshold;
  }

  Future<void> _autoSubmitAfterSilence() async {
    if (!_isRecording || _isProcessing) {
      _autoSubmittingForSilence = false;
      return;
    }
    await _stopRecordingAndProcess();
  }

  void _trackSilenceAndMaybeAutoSubmit(Uint8List chunk) {
    if (!_isRecording || _isProcessing || _autoSubmittingForSilence) return;

    final chunkMs = _chunkDurationMs(chunk);
    if (chunkMs <= 0) return;

    if (_chunkHasSpeech(chunk)) {
      _hasDetectedSpeechInCurrentRecording = true;
      _silenceAccumulatedMs = 0;
      return;
    }

    if (!_hasDetectedSpeechInCurrentRecording) return;

    _silenceAccumulatedMs += chunkMs;
    if (_silenceAccumulatedMs < _silenceAutoSubmitMs) return;

    _autoSubmittingForSilence = true;
    unawaited(_autoSubmitAfterSilence());
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
    _assistantPlayer.stop();
    unawaited(_closeVoiceStream());

    _isRecording = false;
    _isProcessing = false;
    _recordedSeconds = 0;
    _errorMessage = null;
    _voiceResult = null;
    _liveTranscript = '';
    _liveDetectedLanguageCode = null;
    _handledNavigationForCurrentResult = false;
    _resetSilenceDetectionState();
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
        _trackSilenceAndMaybeAutoSubmit(chunk);
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
        _handledNavigationForCurrentResult = false;
        _resetSilenceDetectionState();
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

  void _handleAssistantIntentResult(VoiceOrderResult result) {
    final intent = result.assistant.intent;

    if (intent == VoiceAssistantIntent.updateProfile) {
      if (_handledNavigationForCurrentResult) return;
      _handledNavigationForCurrentResult = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        context.push('/profile/edit');
      });
      return;
    }

    if (intent == VoiceAssistantIntent.trackOrders ||
        intent == VoiceAssistantIntent.pendingPayments) {
      ref.invalidate(voiceAssistantOrdersProvider);
    }

    if (intent == VoiceAssistantIntent.clusterStatus ||
        intent == VoiceAssistantIntent.votingStatus) {
      ref.invalidate(voiceAssistantClustersProvider);
    }
  }

  Future<void> _stopRecordingAndProcess() async {
    if (_isProcessing) return;

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

      final result = await resultFuture.timeout(const Duration(seconds: 50));
      if (!mounted) return;
      setState(() => _voiceResult = result);
      unawaited(_playAssistantSpeech(result));
      _handleAssistantIntentResult(result);

      if (result.assistant.intent == VoiceAssistantIntent.placeOrder) {
        unawaited(_playClarificationQuestion(result));
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _errorMessage = e.toString());
    } finally {
      _resetSilenceDetectionState();
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
      if (_autoSubmittingForSilence) return;
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
    _assistantPlayer.stop();
    unawaited(_closeVoiceStream());
    setState(() {
      _errorMessage = null;
      _voiceResult = null;
      _recordedSeconds = 0;
      _liveTranscript = '';
      _liveDetectedLanguageCode = null;
      _handledNavigationForCurrentResult = false;
      _resetSilenceDetectionState();
    });
  }

  List<Order> _ordersForTracking(List<Order> orders) {
    final active = orders
        .where((order) =>
            order.status != OrderStatus.delivered &&
            order.status != OrderStatus.rejected &&
            order.status != OrderStatus.failed)
        .toList();

    final recent = orders
        .where((order) =>
            order.status == OrderStatus.delivered ||
            order.status == OrderStatus.rejected ||
            order.status == OrderStatus.failed)
        .toList();

    final combined = <Order>[];
    combined.addAll(active.take(5));

    if (combined.length < 5) {
      combined.addAll(recent.take(5 - combined.length));
    }

    return combined;
  }

  List<Order> _ordersWithPendingPayments(List<Order> orders) {
    final pending = orders
        .where((order) => order.status == OrderStatus.paymentPending)
        .toList();

    if (pending.isNotEmpty) {
      return pending.take(5).toList();
    }

    final clusterPayment = orders
        .where((order) =>
            order.clusterMember?.cluster?.status == ClusterStatus.payment)
        .toList();

    return clusterPayment.take(5).toList();
  }

  Widget _buildMessageCard({
    required String title,
    required String message,
    IconData icon = Icons.assistant,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.inputBackground,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: AppColors.primary.withOpacity(0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: AppColors.primary, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: AppTextStyles.label),
                const SizedBox(height: 6),
                Text(
                  message,
                  style: AppTextStyles.body.copyWith(
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildOrderCards({
    required List<Order> orders,
    required bool showPayAction,
  }) {
    return Column(
      children: orders
          .map(
            (order) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: OrderSummaryCard(
                order: order,
                onTap: () => context.push('/orders/${order.id}'),
                actionLabel: showPayAction ? 'Pay now' : null,
                onActionTap: showPayAction
                    ? () {
                        final clusterId = order.clusterMember?.cluster?.id;
                        if (clusterId != null && clusterId.isNotEmpty) {
                          context.push('/payment/$clusterId');
                          return;
                        }
                        context.push('/orders/${order.id}');
                      }
                    : null,
              ),
            ),
          )
          .toList(),
    );
  }

  Widget _buildClusterCards(List<Cluster> clusters) {
    return Column(
      children: clusters
          .map(
            (cluster) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _VoiceClusterCard(
                cluster: cluster,
                onTap: () => context.push('/clusters/${cluster.id}'),
              ),
            ),
          )
          .toList(),
    );
  }

  void _showEditProductDialog(String current) {
    final ctrl = TextEditingController(text: current);
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Edit Product'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(hintText: 'e.g. Paddy Seed'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              final v = ctrl.text.trim();
              if (v.isNotEmpty) setState(() => _editedProduct = v);
              Navigator.pop(ctx);
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  void _showEditQuantityDialog(double currentQty, String currentUnit) {
    final qtyCtrl =
        TextEditingController(text: currentQty.toString());
    String selectedUnit = currentUnit;
    const units = ['kg', 'quintal', 'ton', 'bag', 'litre'];
    showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setS) => AlertDialog(
          title: const Text('Edit Quantity & Unit'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: qtyCtrl,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                autofocus: true,
                decoration:
                    const InputDecoration(hintText: 'e.g. 100'),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                children: units
                    .map((u) => ChoiceChip(
                          label: Text(u),
                          selected: selectedUnit == u,
                          onSelected: (_) => setS(() => selectedUnit = u),
                        ))
                    .toList(),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () {
                final q = double.tryParse(qtyCtrl.text.trim());
                if (q != null && q > 0) {
                  setState(() {
                    _editedQuantity = q;
                    _editedUnit = selectedUnit;
                  });
                }
                Navigator.pop(ctx);
              },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPlaceOrderPanel(VoiceOrderResult result) {
    final extraction = result.extraction;
    final displayProduct = _editedProduct ?? extraction.product ?? '';
    final displayQty = _editedQuantity ?? extraction.quantity;
    final displayUnit = _editedUnit ?? extraction.unit ?? '';

    return Container(
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
            'Order details',
            style: AppTextStyles.label.copyWith(color: AppColors.surface),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: GestureDetector(
                  onTap: () =>
                      _showEditProductDialog(displayProduct),
                  child: _ExtractedField(
                    label: 'Product',
                    value: displayProduct.isNotEmpty
                        ? displayProduct
                        : 'Tap to set',
                    editable: true,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: GestureDetector(
                  onTap: () => _showEditQuantityDialog(
                    displayQty ?? 0,
                    displayUnit.isNotEmpty ? displayUnit : 'kg',
                  ),
                  child: _ExtractedField(
                    label: 'Quantity',
                    value: displayQty != null && displayUnit.isNotEmpty
                        ? '${_quantityLabel(displayQty)} $displayUnit'
                        : 'Tap to set',
                    editable: true,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            'Confidence ${(extraction.confidence * 100).toStringAsFixed(0)}% · ${extraction.source.toUpperCase()}',
            style: AppTextStyles.caption.copyWith(
              color: AppColors.textOnPrimaryMuted,
            ),
          ),
          if (extraction.needsClarification &&
              _clarificationQuestionText(extraction).isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              _clarificationQuestionText(extraction),
              style: AppTextStyles.bodySmall.copyWith(
                color: AppColors.surface,
              ),
            ),
            const SizedBox(height: 8),
            TextButton.icon(
              onPressed: _isProcessing
                  ? null
                  : () => unawaited(_playClarificationQuestion(result)),
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
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildIntentPanel(VoiceOrderResult result) {
    final intent = result.assistant.intent;
    final assistantMessage = result.assistant.message?.trim();

    switch (intent) {
      case VoiceAssistantIntent.placeOrder:
        return _buildPlaceOrderPanel(result);

      case VoiceAssistantIntent.trackOrders:
        final ordersAsync = ref.watch(voiceAssistantOrdersProvider);
        return ordersAsync.when(
          data: (orders) {
            final selected = _ordersForTracking(orders);
            if (selected.isEmpty) {
              return _buildMessageCard(
                title: 'Orders',
                message: assistantMessage?.isNotEmpty == true
                    ? assistantMessage!
                    : 'You do not have any orders yet.',
                icon: Icons.receipt_long,
              );
            }
            return Column(
              children: [
                if (assistantMessage?.isNotEmpty == true) ...[
                  _buildMessageCard(
                    title: 'Orders',
                    message: assistantMessage!,
                    icon: Icons.receipt_long,
                  ),
                  const SizedBox(height: 12),
                ],
                _buildOrderCards(orders: selected, showPayAction: false),
              ],
            );
          },
          loading: () => const Center(
            child: CircularProgressIndicator(color: AppColors.primary),
          ),
          error: (error, _) => _buildMessageCard(
            title: 'Orders',
            message: error.toString(),
            icon: Icons.error_outline,
          ),
        );

      case VoiceAssistantIntent.pendingPayments:
        final ordersAsync = ref.watch(voiceAssistantOrdersProvider);
        return ordersAsync.when(
          data: (orders) {
            final selected = _ordersWithPendingPayments(orders);
            if (selected.isEmpty) {
              return _buildMessageCard(
                title: 'Payments',
                message: assistantMessage?.isNotEmpty == true
                    ? assistantMessage!
                    : 'There are no pending payments right now.',
                icon: Icons.payments_outlined,
              );
            }
            return Column(
              children: [
                if (assistantMessage?.isNotEmpty == true) ...[
                  _buildMessageCard(
                    title: 'Payments',
                    message: assistantMessage!,
                    icon: Icons.payments_outlined,
                  ),
                  const SizedBox(height: 12),
                ],
                _buildOrderCards(orders: selected, showPayAction: true),
              ],
            );
          },
          loading: () => const Center(
            child: CircularProgressIndicator(color: AppColors.primary),
          ),
          error: (error, _) => _buildMessageCard(
            title: 'Payments',
            message: error.toString(),
            icon: Icons.error_outline,
          ),
        );

      case VoiceAssistantIntent.clusterStatus:
      case VoiceAssistantIntent.votingStatus:
        final clustersAsync = ref.watch(voiceAssistantClustersProvider);
        return clustersAsync.when(
          data: (clusters) {
            final selected = intent == VoiceAssistantIntent.votingStatus
                ? clusters
                    .where((cluster) => cluster.status == ClusterStatus.voting)
                    .take(5)
                    .toList()
                : clusters.take(5).toList();

            if (selected.isEmpty) {
              return _buildMessageCard(
                title: intent == VoiceAssistantIntent.votingStatus
                    ? 'Voting Status'
                    : 'Cluster Status',
                message: assistantMessage?.isNotEmpty == true
                    ? assistantMessage!
                    : intent == VoiceAssistantIntent.votingStatus
                        ? 'No active voting is pending for your clusters.'
                        : 'No active clusters found right now.',
                icon: intent == VoiceAssistantIntent.votingStatus
                    ? Icons.how_to_vote
                    : Icons.people,
              );
            }

            return Column(
              children: [
                if (assistantMessage?.isNotEmpty == true) ...[
                  _buildMessageCard(
                    title: intent == VoiceAssistantIntent.votingStatus
                        ? 'Voting Status'
                        : 'Cluster Status',
                    message: assistantMessage!,
                    icon: intent == VoiceAssistantIntent.votingStatus
                        ? Icons.how_to_vote
                        : Icons.people,
                  ),
                  const SizedBox(height: 12),
                ],
                _buildClusterCards(selected),
              ],
            );
          },
          loading: () => const Center(
            child: CircularProgressIndicator(color: AppColors.primary),
          ),
          error: (error, _) => _buildMessageCard(
            title: 'Cluster Status',
            message: error.toString(),
            icon: Icons.error_outline,
          ),
        );

      case VoiceAssistantIntent.updateProfile:
        return _buildMessageCard(
          title: 'Profile Update',
          message: assistantMessage?.isNotEmpty == true
              ? assistantMessage!
              : 'Opening your profile editor.',
          icon: Icons.person_outline,
        );

      case VoiceAssistantIntent.generalQuestion:
        return _buildMessageCard(
          title: 'Assistant Answer',
          message: assistantMessage?.isNotEmpty == true
              ? assistantMessage!
              : 'I can answer quick questions about products and deliveries.',
        );

      case VoiceAssistantIntent.unknown:
        return _buildMessageCard(
          title: 'Assistant',
          message: assistantMessage?.isNotEmpty == true
              ? assistantMessage!
              : 'I could not map that request, please try asking about orders, payments, clusters, voting, or profile updates.',
          icon: Icons.help_outline,
        );
    }
  }

  Future<void> _confirmPlaceOrder() async {
    final voiceResult = _voiceResult;
    if (voiceResult == null || _isConfirming) return;

    final extraction = voiceResult.extraction;
    final product = (_editedProduct ?? extraction.product ?? '').trim();
    final qty = _editedQuantity ?? extraction.quantity;
    final unit = (_editedUnit ?? extraction.unit ?? '').trim();

    if (product.isEmpty || qty == null || unit.isEmpty) return;

    setState(() => _isConfirming = true);
    try {
      final api = ref.read(apiClientProvider);
      final result = await api.createOrder({
        'product': product,
        'quantity': qty,
        'unit': unit,
      });

      // API now returns { ...order, cluster: { id, ... } }
      final clusterId = (result['cluster'] as Map<String, dynamic>?)?['id']
          as String?;

      _resetVoiceModuleContextOnExit();
      if (!mounted) return;

      if (clusterId != null && clusterId.isNotEmpty) {
        context.go('/clusters/$clusterId');
      } else {
        context.go('/clusters');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _isConfirming = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final voiceResult = _voiceResult;
    final extraction = voiceResult?.extraction;
    final effectiveProduct =
        (_editedProduct ?? extraction?.product ?? '').trim();
    final effectiveQty = _editedQuantity ?? extraction?.quantity;
    final effectiveUnit = (_editedUnit ?? extraction?.unit ?? '').trim();
    final canConfirm =
        voiceResult?.assistant.intent == VoiceAssistantIntent.placeOrder &&
            effectiveProduct.isNotEmpty &&
            effectiveQty != null &&
            effectiveQty > 0 &&
            effectiveUnit.isNotEmpty;
    final isPlaceOrderIntent =
        voiceResult?.assistant.intent == VoiceAssistantIntent.placeOrder;

    final statusLabel = _isRecording
        ? '● Listening… ${_formatDuration(_recordedSeconds)}'
        : _isProcessing
            ? (_processingHints.isEmpty
                ? 'Analyzing your request…'
                : _processingHints[_processingHintIndex])
            : 'Tap to record · AI voice assistance enabled';

    final liveTranscript = _liveTranscript.trim();
    final shouldCenterPrimaryContent =
        _voiceResult == null && _errorMessage == null;

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppHeader(
        title: 'Voice Assistance',
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
                          'Tap the mic and ask for orders, payments, cluster status, voting, profile updates, or place an order.',
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
                                Text('Live transcript',
                                    style: AppTextStyles.caption),
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
                        if (voiceResult != null) ...[
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
                                    const Icon(
                                      Icons.text_fields,
                                      size: 16,
                                      color: AppColors.textMuted,
                                    ),
                                    const SizedBox(width: 6),
                                    Text('What we heard',
                                        style: AppTextStyles.caption),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  '"${voiceResult.transcript}"',
                                  style: AppTextStyles.body.copyWith(
                                    color: AppColors.primary,
                                    fontStyle: FontStyle.italic,
                                  ),
                                ),
                                if ((voiceResult.detectedLanguageCode ?? '')
                                    .isNotEmpty) ...[
                                  const SizedBox(height: 8),
                                  Text(
                                    'Language: ${voiceResult.detectedLanguageCode}',
                                    style: AppTextStyles.caption,
                                  ),
                                ],
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                          _buildIntentPanel(voiceResult),
                          const SizedBox(height: 20),
                          if (isPlaceOrderIntent)
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
                                        color: AppColors.primary,
                                        width: 1.5,
                                      ),
                                      shape: const StadiumBorder(),
                                      padding: const EdgeInsets.symmetric(
                                        vertical: 14,
                                      ),
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: ElevatedButton.icon(
                                    onPressed: canConfirm && !_isConfirming
                                        ? _confirmPlaceOrder
                                        : null,
                                    icon: _isConfirming
                                        ? const SizedBox(
                                            width: 18,
                                            height: 18,
                                            child: CircularProgressIndicator(
                                              strokeWidth: 2,
                                              color: AppColors.surface,
                                            ),
                                          )
                                        : const Icon(Icons.check, size: 18),
                                    label: Text(
                                        _isConfirming ? 'Placing…' : 'Confirm'),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: AppColors.primary,
                                      shape: const StadiumBorder(),
                                      elevation: 0,
                                      padding: const EdgeInsets.symmetric(
                                        vertical: 14,
                                      ),
                                      textStyle: AppTextStyles.button,
                                    ),
                                  ),
                                ),
                              ],
                            )
                          else
                            SizedBox(
                              width: double.infinity,
                              child: OutlinedButton.icon(
                                onPressed: _isProcessing ? null : _reset,
                                icon: const Icon(Icons.refresh, size: 18),
                                label: const Text('Ask another question'),
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: AppColors.primary,
                                  side: const BorderSide(
                                    color: AppColors.primary,
                                    width: 1.5,
                                  ),
                                  shape: const StadiumBorder(),
                                  padding: const EdgeInsets.symmetric(
                                    vertical: 14,
                                  ),
                                ),
                              ),
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
                                const _ExamplePhrase(text: '"Track my orders"'),
                                const _ExamplePhrase(
                                  text: '"Which payments are pending for me?"',
                                ),
                                const _ExamplePhrase(
                                  text: '"What products are available now?"',
                                ),
                                const _ExamplePhrase(
                                  text: '"I need 5 bags of DAP fertilizer"',
                                ),
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

class _VoiceClusterCard extends StatelessWidget {
  final Cluster cluster;
  final VoidCallback onTap;

  const _VoiceClusterCard({
    required this.cluster,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.inputBackground,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(
                    Icons.people,
                    color: AppColors.primary,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(cluster.product, style: AppTextStyles.label),
                      Text(
                        '#${cluster.id.substring(0, 8).toUpperCase()}',
                        style: AppTextStyles.caption,
                      ),
                    ],
                  ),
                ),
                StatusBadge.fromClusterStatus(cluster.status),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              '${cluster.currentQuantity.toStringAsFixed(0)} / ${cluster.targetQuantity.toStringAsFixed(0)} ${cluster.unit}',
              style:
                  AppTextStyles.body.copyWith(color: AppColors.textSecondary),
            ),
            const SizedBox(height: 4),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '${cluster.membersCount} farmers · ${cluster.district ?? "your area"}',
                  style: AppTextStyles.caption,
                ),
                const Icon(
                  Icons.arrow_forward_ios,
                  size: 12,
                  color: AppColors.textMuted,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _ExtractedField extends StatelessWidget {
  final String label;
  final String value;
  final bool editable;

  const _ExtractedField({
    required this.label,
    required this.value,
    this.editable = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surface.withOpacity(0.15),
        borderRadius: BorderRadius.circular(12),
        border: editable
            ? Border.all(
                color: AppColors.surface.withOpacity(0.35),
                width: 1,
              )
            : null,
      ),
      child: Row(
        children: [
          Expanded(
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
          ),
          if (editable)
            Icon(
              Icons.edit,
              size: 14,
              color: AppColors.surface.withOpacity(0.6),
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
