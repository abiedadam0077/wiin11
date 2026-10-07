import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/data/providers.dart';
import '../../core/data/record_helpers.dart';
import '../../core/localization/locale_provider.dart';
import '../../core/theme/app_design_system.dart';
import '../../core/widgets/visuals.dart';
import '../../l10n/generated/app_localizations.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final Locale locale = ref.watch(localeProvider);
    final AsyncValue<JsonMap> engineAsync = ref.watch(engineStatusProvider);
    final JsonMap engine = engineAsync.valueOrNull ?? const <String, dynamic>{};
    final String status = (engine['status'] ?? 'STOPPED').toString();
    final Color statusColor = switch (status) {
      'READY' => AppColors.green,
      'CONNECTING' => AppColors.cyan,
      'FAILED' => AppColors.red,
      _ => AppColors.textMuted,
    };
    final String statusText = switch (status) {
      'READY' => l10n.engineReady,
      'CONNECTING' => l10n.engineStarting,
      'FAILED' => l10n.engineFailed,
      _ => l10n.engineIdle,
    };
    final List<_SettingsLink> links = <_SettingsLink>[
      _SettingsLink('engine', l10n.minecraftSettings, l10n.engineInfo, Icons.memory_rounded, AppColors.cyan),
      _SettingsLink('ai', l10n.aiSettings, l10n.openRouter, Icons.auto_awesome_rounded, AppColors.purple),
      _SettingsLink('behavior', l10n.behaviorTitle, l10n.behaviorLimit, Icons.health_and_safety_outlined, AppColors.green),
      _SettingsLink('security', l10n.security, l10n.keySecurity, Icons.shield_outlined, AppColors.blue),
      _SettingsLink('storage', l10n.storage, l10n.recordsCount, Icons.storage_rounded, AppColors.amber),
      _SettingsLink('about', l10n.about, l10n.noFakeData, Icons.info_outline_rounded, AppColors.textMuted),
    ];
    return CustomScrollView(
      physics: const BouncingScrollPhysics(),
      slivers: <Widget>[
        SliverPadding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 10, AppSpacing.page, 0),
          sliver: SliverToBoxAdapter(child: ScreenHeader(title: l10n.settingsTitle, subtitle: l10n.appName, trailing: const VoxelMark(size: 38))),
        ),
        SliverPadding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0),
          sliver: SliverToBoxAdapter(
            child: GlassPanel(
              accent: statusColor,
              onTap: () => context.push('/settings/section/engine'),
              child: Row(children: <Widget>[
                Icon(Icons.memory_rounded, color: statusColor, size: 23),
                const SizedBox(width: AppSpacing.sm),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[Text(l10n.minecraftSettings, style: AppTypography.title), Text(engine['runtime']?.toString() ?? statusText, style: AppTypography.label, maxLines: 1, overflow: TextOverflow.ellipsis)])),
                StatusBadge(label: statusText, color: statusColor),
              ]),
            ),
          ),
        ),
        SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, AppSpacing.xs), sliver: SliverToBoxAdapter(child: SectionHeading(l10n.language))),
        SliverPadding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0),
          sliver: SliverToBoxAdapter(
            child: GlassPanel(
              accent: AppColors.blue,
              padding: const EdgeInsets.all(AppSpacing.xs),
              child: SegmentedButton<String>(
                showSelectedIcon: false,
                segments: <ButtonSegment<String>>[
                  ButtonSegment<String>(value: 'ar', label: Text(l10n.languageArabic)),
                  ButtonSegment<String>(value: 'en', label: Text(l10n.languageEnglish)),
                  ButtonSegment<String>(value: 'fr', label: Text(l10n.languageFrench)),
                ],
                selected: <String>{locale.languageCode},
                onSelectionChanged: (Set<String> selection) => persistLocale(ref, selection.first),
              ),
            ),
          ),
        ),
        SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, AppSpacing.xs), sliver: SliverToBoxAdapter(child: SectionHeading(l10n.settingsTitle))),
        SliverPadding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0),
          sliver: SliverList.builder(
            itemCount: links.length,
            itemBuilder: (BuildContext context, int index) {
              final _SettingsLink link = links[index];
              return Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                child: GlassPanel(
                  accent: link.color,
                  onTap: () => context.push('/settings/section/${link.key}'),
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.sm),
                  child: Row(children: <Widget>[
                    AccentIcon(link.icon, color: link.color, size: 20),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[Text(link.title, style: AppTypography.title), Text(link.subtitle, style: AppTypography.label, maxLines: 2, overflow: TextOverflow.ellipsis)])),
                    const Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
                  ]),
                ),
              );
            },
          ),
        ),
        SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.sm, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: GlassPanel(accent: AppColors.purple, onTap: () => context.push('/settings/skins'), child: Row(children: <Widget>[const Icon(Icons.face_retouching_natural_rounded, color: AppColors.purple), const SizedBox(width: AppSpacing.sm), Expanded(child: Text(l10n.skinManager, style: AppTypography.title)), const Icon(Icons.chevron_right_rounded, color: AppColors.textMuted)])))),
        SliverPadding(padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom + 92)),
      ],
    );
  }
}

class _SettingsLink {
  const _SettingsLink(this.key, this.title, this.subtitle, this.icon, this.color);
  final String key;
  final String title;
  final String subtitle;
  final IconData icon;
  final Color color;
}
