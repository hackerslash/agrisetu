import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../shared/widgets/app_header.dart';

class VoiceOrderScreen extends StatefulWidget {
  const VoiceOrderScreen({super.key});

  @override
  State<VoiceOrderScreen> createState() => _VoiceOrderScreenState();
}

class _VoiceOrderScreenState extends State<VoiceOrderScreen>
    with SingleTickerProviderStateMixin {
  bool _isRecording = false;
  bool _hasTranscription = false;
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;

  // Mock extracted data
  final _extractedCrop = 'Tomato Seeds';
  final _extractedQuantity = '50';
  final _extractedUnit = 'kg';

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 1),
    )..repeat(reverse: true);

    _pulseAnimation = Tween<double>(begin: 1.0, end: 1.15).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  void _toggleRecording() {
    setState(() {
      _isRecording = !_isRecording;
      if (!_isRecording) {
        // Simulate transcription after recording
        Future.delayed(const Duration(milliseconds: 500), () {
          if (mounted) setState(() => _hasTranscription = true);
        });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
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
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
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

                  // Microphone button
                  GestureDetector(
                    onTap: _toggleRecording,
                    child: AnimatedBuilder(
                      animation: _pulseAnimation,
                      builder: (_, child) => Transform.scale(
                        scale: _isRecording ? _pulseAnimation.value : 1.0,
                        child: child,
                      ),
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
                              _isRecording ? Icons.stop : Icons.mic,
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
                    _isRecording
                        ? '● Recording…'
                        : 'Tap to record · 22 languages',
                    style: AppTextStyles.body.copyWith(
                      color: _isRecording ? AppColors.error : AppColors.primary,
                      fontWeight: FontWeight.w500,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 32),

                  // Transcription
                  if (_hasTranscription) ...[
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
                              Text(
                                'What we heard',
                                style: AppTextStyles.caption,
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            '"मुझे 50 किलो टमाटर के बीज चाहिए"',
                            style: AppTextStyles.body.copyWith(
                              color: AppColors.primary,
                              fontStyle: FontStyle.italic,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Extracted order
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
                                  value: _extractedCrop,
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: _ExtractedField(
                                  label: 'Quantity',
                                  value: '$_extractedQuantity $_extractedUnit',
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),

                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () {
                              setState(() {
                                _hasTranscription = false;
                                _isRecording = false;
                              });
                            },
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
                            onPressed: () {
                              context.push(
                                '/orders/new',
                                extra: {
                                  'crop': _extractedCrop,
                                  'quantity': _extractedQuantity,
                                  'unit': _extractedUnit,
                                },
                              );
                            },
                            icon:
                                const Icon(Icons.check, size: 18),
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
                          _ExamplePhrase(
                            text: '"मुझे 100 किलो यूरिया चाहिए"'),
                          _ExamplePhrase(
                            text: '"I need 5 bags of DAP fertilizer"'),
                          _ExamplePhrase(
                            text: '"నాకు 50 కేజీల టమాట విత్తనాలు కావాలి"'),
                        ],
                      ),
                    )
          ],
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
            style: AppTextStyles.label
                .copyWith(color: AppColors.surface),
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
