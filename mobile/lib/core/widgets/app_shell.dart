import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/data/providers.dart';
import '../../l10n/generated/app_localizations.dart';
import '../theme/app_design_system.dart';
import 'visuals.dart';

class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context) {
    final bool wide = MediaQuery.sizeOf(context).width >= 680;
    return Scaffold(
      backgroundColor: AppColors.background,
      extendBody: !wide,
      body: NeonBackdrop(
        child: SafeArea(
          bottom: wide,
          child: Row(
            children: <Widget>[
              if (wide) _WideNavigation(selectedIndex: navigationShell.currentIndex, onSelected: _select),
              Expanded(
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 1050),
                    child: RepaintBoundary(child: navigationShell),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: wide
          ? null
          : _GlassNavigationBar(selectedIndex: navigationShell.currentIndex, onSelected: _select),
    );
  }

  void _select(BuildContext context, int index) {
    if (index == navigationShell.currentIndex) {
      navigationShell.goBranch(index, initialLocation: true);
      return;
    }
    HapticFeedback.selectionClick();
    navigationShell.goBranch(index);
  }
}

class _GlassNavigationBar extends StatelessWidget {
  const _GlassNavigationBar({required this.selectedIndex, required this.onSelected});

  final int selectedIndex;
  final void Function(BuildContext context, int index) onSelected;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final List<_Destination> items = <_Destination>[
      _Destination(l10n.navHome, AppIcons.home, AppIcons.home),
      _Destination(l10n.navBots, AppIcons.bots, Icons.smart_toy_rounded),
      _Destination(l10n.navTasks, AppIcons.tasks, Icons.checklist_rounded),
      _Destination(l10n.navServers, AppIcons.servers, Icons.dns_rounded),
      _Destination(l10n.navSettings, AppIcons.settings, Icons.tune_rounded),
    ];
    return SafeArea(
      top: false,
      minimum: const EdgeInsets.fromLTRB(12, 0, 12, 6),
      child: RepaintBoundary(
        child: ClipRRect(
          borderRadius: BorderRadius.circular(AppRadius.xl),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 13, sigmaY: 13),
            child: Container(
              height: 66,
              decoration: BoxDecoration(
                color: const Color(0xE70A1024),
                borderRadius: BorderRadius.circular(AppRadius.xl),
                border: Border.all(color: AppColors.cyan.withValues(alpha: .32)),
                boxShadow: AppShadows.glowCyan,
              ),
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 5),
              child: Row(
                children: List<Widget>.generate(items.length, (int index) {
                  final _Destination item = items[index];
                  final bool selected = index == selectedIndex;
                  return Expanded(
                    child: Semantics(
                      button: true,
                      selected: selected,
                      label: item.label,
                      child: Tooltip(
                        message: item.label,
                        child: InkWell(
                          borderRadius: BorderRadius.circular(AppRadius.lg),
                          onTap: () => onSelected(context, index),
                          child: AnimatedContainer(
                            duration: AppMotion.standard,
                            curve: AppMotion.emphasizedCurve,
                            margin: const EdgeInsets.symmetric(horizontal: 2, vertical: 1),
                            decoration: BoxDecoration(
                              gradient: selected ? const LinearGradient(colors: <Color>[Color(0x994F3AB4), Color(0x99215A91)]) : null,
                              borderRadius: BorderRadius.circular(AppRadius.lg),
                              border: selected ? Border.all(color: AppColors.cyan.withValues(alpha: .65)) : null,
                              boxShadow: selected ? AppShadows.glowPurple : null,
                            ),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: <Widget>[
                                AnimatedScale(
                                  scale: selected ? 1.08 : .94,
                                  duration: AppMotion.fast,
                                  curve: AppMotion.curve,
                                  child: Icon(selected ? item.selectedIcon : item.icon, size: 20, color: selected ? AppColors.cyan : AppColors.textMuted),
                                ),
                                const SizedBox(height: 3),
                                AnimatedDefaultTextStyle(
                                  duration: AppMotion.fast,
                                  style: TextStyle(fontSize: 9, fontWeight: selected ? FontWeight.w700 : FontWeight.w500, color: selected ? AppColors.text : AppColors.textMuted),
                                  child: Text(item.label, maxLines: 1, overflow: TextOverflow.ellipsis),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  );
                }),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _WideNavigation extends StatelessWidget {
  const _WideNavigation({required this.selectedIndex, required this.onSelected});

  final int selectedIndex;
  final void Function(BuildContext context, int index) onSelected;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final List<_Destination> items = <_Destination>[
      _Destination(l10n.navHome, AppIcons.home, AppIcons.home),
      _Destination(l10n.navBots, AppIcons.bots, Icons.smart_toy_rounded),
      _Destination(l10n.navTasks, AppIcons.tasks, Icons.checklist_rounded),
      _Destination(l10n.navServers, AppIcons.servers, Icons.dns_rounded),
      _Destination(l10n.navSettings, AppIcons.settings, Icons.tune_rounded),
    ];
    return Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(10, 12, 2, 12),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppRadius.xl),
        child: NavigationRail(
          backgroundColor: const Color(0xD90A1024),
          selectedIndex: selectedIndex,
          onDestinationSelected: (int index) => onSelected(context, index),
          labelType: NavigationRailLabelType.all,
          minWidth: 74,
          groupAlignment: -.55,
          selectedIconTheme: const IconThemeData(color: AppColors.cyan),
          unselectedIconTheme: const IconThemeData(color: AppColors.textMuted),
          selectedLabelTextStyle: const TextStyle(color: AppColors.text, fontSize: 11, fontWeight: FontWeight.w700),
          unselectedLabelTextStyle: const TextStyle(color: AppColors.textMuted, fontSize: 10),
          leading: const Padding(padding: EdgeInsets.only(top: 10, bottom: 22), child: VoxelMark(size: 42)),
          destinations: items
              .map((_Destination item) => NavigationRailDestination(
                    icon: Icon(item.icon, size: 21),
                    selectedIcon: Icon(item.selectedIcon, size: 21),
                    label: Text(item.label),
                  ))
              .toList(growable: false),
        ),
      ),
    );
  }
}

class _Destination {
  const _Destination(this.label, this.icon, this.selectedIcon);
  final String label;
  final IconData icon;
  final IconData selectedIcon;
}

class EngineEventObserver extends ConsumerWidget {
  const EngineEventObserver({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen(engineEventsProvider, (_, next) {
      next.whenData((event) {
        final Map<String, dynamic> value = Map<String, dynamic>.from(event);
          refreshForEngineEvent(ref, value);
          final String message = (value['message'] ?? value['detail'] ?? value['reason'] ?? '').toString();
          if (value['type'] == 'auth_code') {
            final String code = (value['userCode'] ?? '').toString();
            final String uri = (value['verificationUri'] ?? '').toString();
            if (code.isNotEmpty) {
              showDialog<void>(
                context: context,
                builder: (BuildContext dialogContext) => AlertDialog(
                  icon: const Icon(Icons.verified_user_outlined, color: AppColors.cyan),
                  title: Text(AppLocalizations.of(context).microsoftDeviceTitle),
                  content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: <Widget>[
                    Text(AppLocalizations.of(context).microsoftDeviceInstructions, style: AppTypography.body),
                    const SizedBox(height: AppSpacing.md),
                    SelectableText(code, textAlign: TextAlign.center, style: AppTypography.display.copyWith(color: AppColors.cyan, letterSpacing: 3)),
                    if (uri.isNotEmpty) ...<Widget>[
                      const SizedBox(height: AppSpacing.xs),
                      SelectableText(uri, textAlign: TextAlign.center, style: AppTypography.label),
                    ],
                  ]),
                  actions: <Widget>[
                    TextButton.icon(
                      onPressed: () async {
                        await Clipboard.setData(ClipboardData(text: code));
                        if (dialogContext.mounted && context.mounted) ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(AppLocalizations.of(context).codeCopied)));
                      },
                      icon: const Icon(Icons.copy_rounded),
                      label: Text(AppLocalizations.of(context).codeCopied),
                    ),
                    if (uri.isNotEmpty) FilledButton.icon(
                      onPressed: () async {
                        try {
                          await ref.read(mineBotPlatformProvider).openExternalUrl(uri);
                        } catch (error) {
                          if (context.mounted) ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(error.toString())));
                        }
                      },
                      icon: const Icon(Icons.open_in_browser_rounded),
                      label: Text(AppLocalizations.of(context).openBrowser),
                    ),
                  ],
                ),
              );
            }
          }
        if (value['type'] == 'service_error' || (value['type'] == 'command_result' && value['ok'] == false)) {
          ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(message.isEmpty ? AppLocalizations.of(context).genericError : message)));
        }
      });
    });
    return child;
  }
}
