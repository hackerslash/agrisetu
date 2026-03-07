import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../shared/theme/app_theme.dart';

class HelpSupportScreen extends StatelessWidget {
  const HelpSupportScreen({super.key});

  static const String _supportEmail = 'support@agrisetu.com';

  Future<void> _composeSupportEmail(
    BuildContext context, {
    required String subject,
    required String topic,
  }) async {
    final uri = Uri(
      scheme: 'mailto',
      path: _supportEmail,
      queryParameters: {
        'subject': subject,
        'body': 'Hello AgriSetu Support,\n\nI need help with: $topic\n\n'
            'Registered phone number:\n'
            'Order / Cluster ID (if applicable):\n'
            'Issue details:\n\n'
            'Thank you.',
      },
    );

    final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (context.mounted && !launched) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Could not open the mail app. Support email copied.'),
        ),
      );
      await _copyEmail(context);
    }
  }

  Future<void> _copyEmail(BuildContext context) async {
    await Clipboard.setData(const ClipboardData(text: _supportEmail));
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Support email copied')),
      );
    }
  }

  Future<void> _shareSupport(BuildContext context) async {
    await Share.share(
      'AgriSetu Support\nEmail: $_supportEmail',
      subject: 'AgriSetu Support Contact',
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: const Text('Help & Support'),
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.surface,
      ),
      body: SafeArea(
        top: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 32),
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AppColors.primary,
                borderRadius: BorderRadius.circular(24),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(
                      color: AppColors.surface.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: const Icon(
                      Icons.support_agent_outlined,
                      color: AppColors.surface,
                      size: 28,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'We’re Ready to Help',
                    style: AppTextStyles.h2.copyWith(
                      color: AppColors.surface,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Contact AgriSetu support for help with onboarding, account access, cluster issues, payments, deliveries, or any app problem.',
                    style: AppTextStyles.body.copyWith(
                      color: AppColors.textOnPrimaryMuted,
                      height: 1.55,
                    ),
                  ),
                  const SizedBox(height: 18),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: AppColors.surface.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Support Email',
                          style: AppTextStyles.caption.copyWith(
                            color: AppColors.textOnPrimaryMuted,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          _supportEmail,
                          style: AppTextStyles.h5.copyWith(
                            color: AppColors.surface,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _ActionButton(
                    icon: Icons.mail_outline,
                    label: 'Email support',
                    onTap: () => _composeSupportEmail(
                      context,
                      subject: 'AgriSetu Support Request',
                      topic: 'General support',
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _ActionButton(
                    icon: Icons.copy_outlined,
                    label: 'Copy email',
                    onTap: () => _copyEmail(context),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () => _shareSupport(context),
                icon: const Icon(Icons.share_outlined, size: 18),
                label: const Text('Share support contact'),
              ),
            ),
            const SizedBox(height: 20),
            _SupportTopicCard(
              title: 'Payment Issue',
              description:
                  'Use this when payment is pending, failed, not reflected, or a cluster payment deadline is unclear.',
              icon: Icons.account_balance_wallet_outlined,
              onTap: () => _composeSupportEmail(
                context,
                subject: 'AgriSetu Payment Support',
                topic: 'Payment issue',
              ),
            ),
            const SizedBox(height: 12),
            _SupportTopicCard(
              title: 'Order or Delivery Issue',
              description:
                  'Use this if order status looks wrong, delivery updates are missing, or a cluster flow seems stuck.',
              icon: Icons.local_shipping_outlined,
              onTap: () => _composeSupportEmail(
                context,
                subject: 'AgriSetu Order / Delivery Support',
                topic: 'Order or delivery issue',
              ),
            ),
            const SizedBox(height: 12),
            _SupportTopicCard(
              title: 'Account or App Problem',
              description:
                  'Use this for login trouble, profile issues, language problems, or technical bugs inside the app.',
              icon: Icons.phone_android_outlined,
              onTap: () => _composeSupportEmail(
                context,
                subject: 'AgriSetu Account / App Support',
                topic: 'Account or app problem',
              ),
            ),
            const SizedBox(height: 20),
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: AppColors.inputBackground,
                borderRadius: BorderRadius.circular(18),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Include These Details',
                    style: AppTextStyles.h5.copyWith(
                      color: AppColors.primary,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 12),
                  const _SupportBullet(
                    text: 'Registered phone number or account identity',
                  ),
                  const SizedBox(height: 8),
                  const _SupportBullet(
                    text: 'Order ID or cluster ID when the issue relates to a transaction',
                  ),
                  const SizedBox(height: 8),
                  const _SupportBullet(
                    text: 'A short description of what happened and what you expected',
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _ActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return FilledButton.tonalIcon(
      onPressed: onTap,
      icon: Icon(icon, size: 18),
      label: Text(label),
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.inputBackground,
        foregroundColor: AppColors.primary,
        minimumSize: const Size(double.infinity, 52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        textStyle:
            AppTextStyles.buttonSmall.copyWith(color: AppColors.primary),
      ),
    );
  }
}

class _SupportTopicCard extends StatelessWidget {
  final String title;
  final String description;
  final IconData icon;
  final VoidCallback onTap;

  const _SupportTopicCard({
    required this.title,
    required this.description,
    required this.icon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(20),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AppColors.inputBackground,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, color: AppColors.primary, size: 22),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: AppTextStyles.body.copyWith(
                        color: AppColors.textPrimary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      description,
                      style: AppTextStyles.bodySmall.copyWith(
                        color: AppColors.textSecondary,
                        height: 1.5,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Icon(
                Icons.open_in_new_outlined,
                color: AppColors.textMuted,
                size: 18,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SupportBullet extends StatelessWidget {
  final String text;

  const _SupportBullet({required this.text});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 8,
          height: 8,
          margin: const EdgeInsets.only(top: 6),
          decoration: const BoxDecoration(
            color: AppColors.primary,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            text,
            style: AppTextStyles.body.copyWith(
              color: AppColors.primary,
              height: 1.45,
            ),
          ),
        ),
      ],
    );
  }
}
