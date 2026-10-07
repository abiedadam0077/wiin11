import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/app_design_system.dart';

class NeonBackdrop extends StatelessWidget {
  const NeonBackdrop({super.key, required this.child, this.centered = false});

  final Widget child;
  final bool centered;

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: const BoxDecoration(
          color: AppColors.background,
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: <Color>[Color(0xFF10102B), AppColors.background, Color(0xFF071324)],
          ),
        ),
        child: Stack(
          fit: StackFit.expand,
          children: <Widget>[
            const RepaintBoundary(child: CustomPaint(painter: _AmbientGridPainter())),
            if (centered)
              const PositionedDirectional(
                top: -70,
                end: -80,
                child: _AmbientOrb(color: AppColors.purple, size: 230),
              )
            else ...<Widget>[
              const PositionedDirectional(
                top: -110,
                end: -120,
                child: _AmbientOrb(color: AppColors.purple, size: 280),
              ),
              const PositionedDirectional(
                bottom: 80,
                start: -140,
                child: _AmbientOrb(color: AppColors.blue, size: 250),
              ),
            ],
            child,
          ],
        ),
      );
}

class _AmbientOrb extends StatelessWidget {
  const _AmbientOrb({required this.color, required this.size});

  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) => IgnorePointer(
        child: ExcludeSemantics(
          child: Container(
            width: size,
            height: size,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(
                colors: <Color>[color.withValues(alpha: .13), color.withValues(alpha: 0)],
              ),
            ),
          ),
        ),
      );
}

class _AmbientGridPainter extends CustomPainter {
  const _AmbientGridPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final Paint paint = Paint()
      ..color = AppColors.cyan.withValues(alpha: .025)
      ..strokeWidth = 1;
    const double step = 46;
    for (double x = 0; x < size.width; x += step) {
      canvas.drawLine(Offset(x, size.height * .68), Offset(x, size.height), paint);
    }
    for (double y = size.height * .69; y < size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class GlassPanel extends StatelessWidget {
  const GlassPanel({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(AppSpacing.md),
    this.accent = AppColors.cyan,
    this.onTap,
    this.gradient,
    this.borderRadius = AppRadius.lg,
    this.semanticLabel,
    this.clip = true,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color accent;
  final VoidCallback? onTap;
  final Gradient? gradient;
  final double borderRadius;
  final String? semanticLabel;
  final bool clip;

  @override
  Widget build(BuildContext context) {
    final BorderRadius radius = BorderRadius.circular(borderRadius);
    final Widget content = Container(
      padding: padding,
      decoration: BoxDecoration(
        borderRadius: radius,
        gradient: gradient ?? AppGradients.card,
        border: Border.all(color: accent.withValues(alpha: .34), width: 1),
        boxShadow: <BoxShadow>[
          BoxShadow(color: Colors.black.withValues(alpha: .20), blurRadius: 16, offset: const Offset(0, 7)),
          BoxShadow(color: accent.withValues(alpha: .06), blurRadius: 20, spreadRadius: -8),
        ],
      ),
      child: child,
    );
    return Semantics(
      label: semanticLabel,
      button: onTap != null,
      child: Material(
        color: Colors.transparent,
        borderRadius: radius,
        clipBehavior: clip ? Clip.antiAlias : Clip.none,
        child: onTap == null
            ? content
            : InkWell(
                onTap: onTap,
                borderRadius: radius,
                child: content,
              ),
      ),
    );
  }
}

class ScreenHeader extends StatelessWidget {
  const ScreenHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.leading,
    this.trailing,
    this.compact = false,
  });

  final String title;
  final String? subtitle;
  final Widget? leading;
  final Widget? trailing;
  final bool compact;

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsetsDirectional.fromSTEB(0, compact ? 6 : 12, 0, compact ? 14 : 18),
        child: Row(
          children: <Widget>[
            if (leading != null) ...<Widget>[leading!, const SizedBox(width: AppSpacing.sm)],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  Text(title, style: compact ? AppTypography.title : AppTypography.headline, maxLines: 1, overflow: TextOverflow.ellipsis),
                  if (subtitle != null) ...<Widget>[
                    const SizedBox(height: 3),
                    Text(subtitle!, style: AppTypography.label, maxLines: 2, overflow: TextOverflow.ellipsis),
                  ],
                ],
              ),
            ),
            if (trailing != null) ...<Widget>[
              const SizedBox(width: AppSpacing.sm),
              Flexible(
                fit: FlexFit.loose,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 132),
                  child: FittedBox(
                    alignment: AlignmentDirectional.centerEnd,
                    fit: BoxFit.scaleDown,
                    child: trailing!,
                  ),
                ),
              ),
            ],
          ],
        ),
      );
}

class SectionHeading extends StatelessWidget {
  const SectionHeading(this.title, {super.key, this.action, this.trailing});

  final String title;
  final VoidCallback? action;
  final String? trailing;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsetsDirectional.only(top: AppSpacing.md, bottom: AppSpacing.xs),
        child: Row(
          children: <Widget>[
            Container(
              width: 3,
              height: 17,
              decoration: BoxDecoration(color: AppColors.cyan, borderRadius: BorderRadius.circular(4), boxShadow: AppShadows.glowCyan),
            ),
            const SizedBox(width: AppSpacing.xs),
            Expanded(child: Text(title, style: AppTypography.title.copyWith(fontSize: 14))),
            if (trailing != null) Text(trailing!, style: AppTypography.label),
            if (action != null)
              IconButton(
                tooltip: trailing ?? title,
                onPressed: action,
                visualDensity: VisualDensity.compact,
                icon: const Icon(Icons.arrow_forward_rounded, size: 18, color: AppColors.cyan),
              ),
          ],
        ),
      );
}

class AccentIcon extends StatelessWidget {
  const AccentIcon(this.icon, {super.key, this.color = AppColors.cyan, this.size = 22, this.background});

  final IconData icon;
  final Color color;
  final double size;
  final Color? background;

  @override
  Widget build(BuildContext context) => Container(
        width: 42,
        height: 42,
        decoration: BoxDecoration(
          color: background ?? color.withValues(alpha: .12),
          borderRadius: BorderRadius.circular(AppRadius.md),
          border: Border.all(color: color.withValues(alpha: .3)),
        ),
        child: Icon(icon, size: size, color: color),
      );
}

class NeonButton extends StatelessWidget {
  const NeonButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.secondary = false,
    this.destructive = false,
    this.expanded = true,
    this.loading = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool secondary;
  final bool destructive;
  final bool expanded;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final Gradient? gradient = destructive ? AppGradients.danger : (secondary ? null : AppGradients.accent);
    final Color foreground = secondary ? AppColors.text : Colors.white;
    final Widget button = AnimatedContainer(
      duration: AppMotion.fast,
      constraints: const BoxConstraints(minHeight: 48),
      decoration: BoxDecoration(
        gradient: gradient,
        color: secondary ? AppColors.surface : null,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: (destructive ? AppColors.red : AppColors.cyan).withValues(alpha: secondary ? .4 : .8)),
        boxShadow: secondary ? const <BoxShadow>[] : (destructive ? AppShadows.glowPurple : AppShadows.glowCyan),
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: InkWell(
          onTap: loading ? null : onPressed,
          borderRadius: BorderRadius.circular(AppRadius.md),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
            child: Row(
              mainAxisSize: expanded ? MainAxisSize.max : MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: <Widget>[
                if (loading) ...<Widget>[
                  const SizedBox(width: 17, height: 17, child: CircularProgressIndicator(strokeWidth: 2)),
                  const SizedBox(width: 8),
                ] else if (icon != null) ...<Widget>[
                  Icon(icon, size: 18, color: foreground),
                  const SizedBox(width: 8),
                ],
                Flexible(child: Text(label, style: TextStyle(color: foreground, fontSize: 13, fontWeight: FontWeight.w700), maxLines: 1, overflow: TextOverflow.ellipsis)),
              ],
            ),
          ),
        ),
      ),
    );
    return Semantics(button: true, enabled: onPressed != null, label: label, child: button);
  }
}

class StatusBadge extends StatelessWidget {
  const StatusBadge({super.key, required this.label, required this.color, this.pulse = false});

  final String label;
  final Color color;
  final bool pulse;

  @override
  Widget build(BuildContext context) => AnimatedContainer(
        duration: AppMotion.standard,
        curve: AppMotion.curve,
        padding: const EdgeInsetsDirectional.fromSTEB(9, 6, 10, 6),
        decoration: BoxDecoration(
          color: color.withValues(alpha: .12),
          borderRadius: BorderRadius.circular(AppRadius.pill),
          border: Border.all(color: color.withValues(alpha: .52)),
          boxShadow: pulse ? <BoxShadow>[BoxShadow(color: color.withValues(alpha: .16), blurRadius: 11)] : null,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            if (pulse)
              Container(
                width: 6,
                height: 6,
                margin: const EdgeInsetsDirectional.only(end: 6),
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
              ),
            Text(label, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w700), maxLines: 1),
          ],
        ),
      );
}

class MetricTile extends StatelessWidget {
  const MetricTile({super.key, required this.label, required this.value, required this.icon, this.accent = AppColors.cyan, this.caption});

  final String label;
  final String value;
  final IconData icon;
  final Color accent;
  final String? caption;

  @override
  Widget build(BuildContext context) => GlassPanel(
        padding: const EdgeInsetsDirectional.fromSTEB(13, 12, 13, 12),
        accent: accent,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Row(
              children: <Widget>[
                Icon(icon, size: 16, color: accent),
                const SizedBox(width: 6),
                Expanded(child: Text(label, style: AppTypography.micro.copyWith(letterSpacing: .2), maxLines: 1, overflow: TextOverflow.ellipsis)),
              ],
            ),
            const SizedBox(height: 9),
            Text(value, style: AppTypography.headline.copyWith(fontSize: 23, color: accent), maxLines: 1, overflow: TextOverflow.ellipsis),
            if (caption != null) ...<Widget>[
              const SizedBox(height: 3),
              Text(caption!, style: AppTypography.label.copyWith(fontSize: 10), maxLines: 1, overflow: TextOverflow.ellipsis),
            ],
          ],
        ),
      );
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.title, required this.message, this.icon = Icons.inbox_outlined, this.action});

  final String title;
  final String message;
  final IconData icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) => GlassPanel(
        accent: AppColors.purple,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(color: AppColors.purple.withValues(alpha: .12), shape: BoxShape.circle),
              child: Icon(icon, color: AppColors.purple, size: 24),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(title, textAlign: TextAlign.center, style: AppTypography.title),
            const SizedBox(height: AppSpacing.xs),
            Text(message, textAlign: TextAlign.center, style: AppTypography.label.copyWith(height: 1.5)),
            if (action != null) ...<Widget>[const SizedBox(height: AppSpacing.md), action!],
          ],
        ),
      );
}

class LoadingState extends StatelessWidget {
  const LoadingState({super.key});

  @override
  Widget build(BuildContext context) => const Center(
        child: SizedBox(width: 28, height: 28, child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.cyan)),
      );
}

class VoxelMark extends StatelessWidget {
  const VoxelMark({super.key, this.size = 48});

  final double size;

  @override
  Widget build(BuildContext context) => SizedBox.square(
        dimension: size,
        child: Stack(
          children: <Widget>[
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(size * .28),
                  gradient: AppGradients.accent,
                  boxShadow: AppShadows.glowCyan,
                ),
              ),
            ),
            Center(
              child: Transform.rotate(
                angle: math.pi / 4,
                child: Container(
                  width: size * .40,
                  height: size * .40,
                  decoration: BoxDecoration(
                    color: const Color(0xFF071023),
                    border: Border.all(color: Colors.white.withValues(alpha: .86), width: size * .035),
                    borderRadius: BorderRadius.circular(size * .055),
                    boxShadow: <BoxShadow>[BoxShadow(color: AppColors.cyan.withValues(alpha: .8), blurRadius: size * .18)],
                  ),
                ),
              ),
            ),
            PositionedDirectional(
              bottom: size * .16,
              end: size * .17,
              child: Container(
                width: size * .18,
                height: size * .18,
                decoration: BoxDecoration(color: AppColors.cyan, borderRadius: BorderRadius.circular(size * .035)),
              ),
            ),
          ],
        ),
      );
}
