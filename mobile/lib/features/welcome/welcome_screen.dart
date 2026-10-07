import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/data/providers.dart';
import '../../core/theme/app_design_system.dart';
import '../../core/widgets/visuals.dart';
import '../../core/widgets/voxel_image.dart';
import '../../l10n/generated/app_localizations.dart';

class WelcomeScreen extends ConsumerWidget {
  const WelcomeScreen({super.key});

  Future<void> _continue(BuildContext context, WidgetRef ref) async {
    HapticFeedback.mediumImpact();
    await ref.read(mineBotPlatformProvider).setPreference('welcome_seen', true);
    if (context.mounted) context.go('/dashboard');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final Size size = MediaQuery.sizeOf(context);
    return Scaffold(
      backgroundColor: AppColors.background,
      body: NeonBackdrop(
        child: SafeArea(
          child: LayoutBuilder(
            builder: (BuildContext context, BoxConstraints constraints) {
              final double artHeight = (constraints.maxHeight * .46).clamp(205.0, 390.0);
              return SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.sm, AppSpacing.md, AppSpacing.lg),
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: constraints.maxHeight - AppSpacing.xl),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: <Widget>[
                      Row(
                        children: <Widget>[
                          const VoxelMark(size: 40),
                          const SizedBox(width: AppSpacing.sm),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: <Widget>[
                                Text(l10n.appName, style: AppTypography.title),
                                Text(l10n.tagline, style: AppTypography.label, maxLines: 1, overflow: TextOverflow.ellipsis),
                              ],
                            ),
                          ),
                          const _EditionBadge(),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.md),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(30),
                        child: SizedBox(
                          height: artHeight,
                          width: double.infinity,
                          child: Stack(
                            fit: StackFit.expand,
                            children: <Widget>[
                              Image.asset('assets/images/voxel_hero.png', fit: BoxFit.cover, alignment: Alignment.topCenter),
                              const DecoratedBox(decoration: BoxDecoration(gradient: AppGradients.welcome)),
                              Positioned(
                                bottom: 12,
                                left: 16,
                                child: StatusBadge(label: l10n.engineIdle, color: AppColors.cyan),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: AppSpacing.md),
                      GlassPanel(
                        accent: AppColors.purple,
                        padding: const EdgeInsets.all(AppSpacing.lg),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: <Widget>[
                            Text(l10n.welcomeTitle, style: AppTypography.display.copyWith(fontSize: size.width < 370 ? 26 : 31)),
                            const SizedBox(height: AppSpacing.sm),
                            Text(l10n.welcomeBody, style: AppTypography.body.copyWith(color: AppColors.textMuted)),
                            const SizedBox(height: AppSpacing.md),
                            NeonButton(label: l10n.startAdventure, icon: Icons.arrow_forward_rounded, onPressed: () => _continue(context, ref)),
                            const SizedBox(height: AppSpacing.sm),
                            Row(
                              children: <Widget>[
                                const Icon(Icons.verified_user_outlined, size: 16, color: AppColors.green),
                                const SizedBox(width: 7),
                                Expanded(child: Text(l10n.privacyNote, style: AppTypography.label.copyWith(fontSize: 11))),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: AppSpacing.sm),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

class _EditionBadge extends StatelessWidget {
  const _EditionBadge();

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: BoxDecoration(
          color: AppColors.purple.withValues(alpha: .14),
          borderRadius: BorderRadius.circular(AppRadius.pill),
          border: Border.all(color: AppColors.purple.withValues(alpha: .44)),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
          child: Text('JAVA EDITION', style: AppTypography.micro.copyWith(color: AppColors.cyan, fontSize: 9)),
        ),
      );
}
