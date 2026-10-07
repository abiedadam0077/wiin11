import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/data/providers.dart';
import '../../core/theme/app_design_system.dart';
import '../../core/widgets/visuals.dart';
import '../../core/widgets/voxel_image.dart';
import '../../l10n/generated/app_localizations.dart';

class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> with TickerProviderStateMixin {
  late final AnimationController _entrance = AnimationController(vsync: this, duration: const Duration(milliseconds: 950))..forward();
  late final AnimationController _orbit = AnimationController(vsync: this, duration: const Duration(milliseconds: 5200))..repeat();
  late final Animation<double> _scale = CurvedAnimation(parent: _entrance, curve: Curves.easeOutBack);
  String _engineStatus = 'STOPPED';

  @override
  void initState() {
    super.initState();
    unawaited(_bootstrap());
  }

  Future<void> _bootstrap() async {
    bool seenWelcome = false;
    try {
      final Map<String, dynamic> state = await ref.read(mineBotPlatformProvider).engineStatus();
      _engineStatus = (state['status'] ?? 'STOPPED').toString();
      seenWelcome = await ref.read(mineBotPlatformProvider).getPreference('welcome_seen') == true;
      if (mounted) setState(() {});
    } catch (_) {
      _engineStatus = 'STOPPED';
    }
    await Future<void>.delayed(const Duration(milliseconds: 1150));
    if (mounted) context.go(seenWelcome ? '/dashboard' : '/welcome');
  }

  @override
  void dispose() {
    _entrance.dispose();
    _orbit.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final String status = switch (_engineStatus) {
      'READY' => l10n.engineReady,
      'FAILED' => l10n.engineFailed,
      'CONNECTING' => l10n.engineStarting,
      _ => l10n.engineIdle,
    };
    return Scaffold(
      backgroundColor: AppColors.background,
      body: NeonBackdrop(
        centered: true,
        child: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 430),
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.xl),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: <Widget>[
                    AnimatedBuilder(
                      animation: _orbit,
                      builder: (BuildContext context, Widget? child) => Stack(
                        alignment: Alignment.center,
                        children: <Widget>[
                          Transform.rotate(
                            angle: _orbit.value * math.pi * 2,
                            child: Container(
                              width: 154,
                              height: 154,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                border: Border.all(color: AppColors.cyan.withValues(alpha: .19)),
                              ),
                              child: Align(
                                alignment: Alignment.topCenter,
                                child: Container(width: 7, height: 7, decoration: const BoxDecoration(color: AppColors.cyan, shape: BoxShape.circle, boxShadow: AppShadows.glowCyan)),
                              ),
                            ),
                          ),
                          ScaleTransition(
                            scale: _scale,
                            child: child,
                          ),
                        ],
                      ),
                      child: const VoxelMark(size: 92),
                    ),
                    const SizedBox(height: AppSpacing.xl),
                    Text(l10n.appName, style: AppTypography.display.copyWith(letterSpacing: 1.1)),
                    const SizedBox(height: AppSpacing.xs),
                    Text(l10n.splashPreparing, style: AppTypography.label),
                    const SizedBox(height: AppSpacing.xl),
                    SizedBox(
                      width: 190,
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(20),
                        child: const LinearProgressIndicator(minHeight: 3, color: AppColors.cyan, backgroundColor: AppColors.surfaceRaised),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: <Widget>[
                        Icon(_engineStatus == 'READY' ? Icons.check_circle_rounded : Icons.memory_rounded, color: _engineStatus == 'READY' ? AppColors.green : AppColors.purple, size: 16),
                        const SizedBox(width: AppSpacing.xs),
                        Text(status, style: AppTypography.label.copyWith(color: _engineStatus == 'FAILED' ? AppColors.amber : AppColors.textMuted)),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
