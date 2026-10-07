import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/data/providers.dart';
import '../../core/data/record_helpers.dart';
import '../../core/theme/app_design_system.dart';
import '../../core/widgets/visuals.dart';
import '../../l10n/generated/app_localizations.dart';

class SettingsDetailScreen extends ConsumerStatefulWidget {
  const SettingsDetailScreen({super.key, required this.section});
  final String section;

  @override
  ConsumerState<SettingsDetailScreen> createState() => _SettingsDetailScreenState();
}

class _SettingsDetailScreenState extends ConsumerState<SettingsDetailScreen> {
  final TextEditingController _keyController = TextEditingController();
  bool _hasKey = false;
  bool _checkingKey = true;
  bool _busy = false;
  String? _message;
  bool _error = false;

  @override
  void initState() {
    super.initState();
    if (widget.section == 'ai') _checkKey();
  }

  @override
  void didUpdateWidget(covariant SettingsDetailScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.section != widget.section) {
      _message = null;
      _error = false;
      if (widget.section == 'ai') {
        _checkingKey = true;
        _checkKey();
      }
    }
  }

  @override
  void dispose() {
    _keyController.dispose();
    super.dispose();
  }

  Future<void> _checkKey() async {
    try {
      final bool result = await ref.read(mineBotPlatformProvider).hasApiKey();
      if (mounted) setState(() { _hasKey = result; _checkingKey = false; });
    } catch (_) {
      if (mounted) setState(() { _hasKey = false; _checkingKey = false; });
    }
  }

  Future<void> _saveKey() async {
    final String key = _keyController.text.trim();
    if (key.length < 20 || key.length > 512 || RegExp(r'\s').hasMatch(key)) {
      setState(() { _message = AppLocalizations.of(context).invalidKey; _error = true; });
      return;
    }
    setState(() { _busy = true; _message = null; });
    try {
      await ref.read(mineBotPlatformProvider).saveApiKey(key);
      _keyController.clear();
      if (mounted) setState(() { _hasKey = true; _message = AppLocalizations.of(context).apiKeySaved; _error = false; });
      HapticFeedback.selectionClick();
    } catch (error) {
      if (mounted) setState(() { _message = error.toString(); _error = true; });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _removeKey() async {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final bool? confirmed = await showDialog<bool>(context: context, builder: (BuildContext context) => AlertDialog(
      title: Text(l10n.deleteApiKey),
      content: Text(l10n.removeKeyConfirm),
      actions: <Widget>[
        TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l10n.cancel)),
        FilledButton.tonal(onPressed: () => Navigator.pop(context, true), child: Text(l10n.delete)),
      ],
    ));
    if (confirmed != true) return;
    try {
      await ref.read(mineBotPlatformProvider).clearApiKey();
      if (mounted) setState(() { _hasKey = false; _message = l10n.keyRemoved; _error = false; });
    } catch (error) {
      if (mounted) setState(() { _message = error.toString(); _error = true; });
    }
  }

  Future<void> _discoverModels() async {
    setState(() { _busy = true; _message = null; });
    try {
      final List<JsonMap> models = await ref.read(mineBotPlatformProvider).discoverFreeModels();
      final List<JsonMap> toolModels = models.where((JsonMap row) => row['supportsTools'] == true).toList(growable: false);
      final JsonMap old = (ref.read(recordsProvider('ai_config')).valueOrNull ?? const <JsonMap>[]).where((JsonMap row) => row['id'] == 'openrouter').firstOrNull ?? <String, dynamic>{};
      final String savedModel = toolModels.any((JsonMap row) => row['id'] == old['selectedModel'])
          ? valueText(old['selectedModel'])
          : toolModels.isEmpty ? '' : valueText(toolModels.first['id']);
      await ref.read(mineBotPlatformProvider).upsert('ai_config', <String, dynamic>{...old, 'id': 'openrouter', 'freeModels': models, 'selectedModel': savedModel, 'updatedAt': DateTime.now().millisecondsSinceEpoch});
      refreshTable(ref, 'ai_config');
      if (mounted) setState(() {
        _message = models.isEmpty
            ? AppLocalizations.of(context).modelsNotFound
            : toolModels.isEmpty
                ? AppLocalizations.of(context).modelsToolsNotFound
                : '${AppLocalizations.of(context).modelsFound}: ${models.length}';
        _error = models.isEmpty || toolModels.isEmpty;
      });
    } catch (error) {
      if (mounted) setState(() { _message = error.toString(); _error = true; });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _stopAll() async {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final bool? confirmed = await showDialog<bool>(context: context, builder: (BuildContext context) => AlertDialog(
      title: Text(l10n.stopAllBots),
      content: Text(l10n.stopAllConfirm),
      actions: <Widget>[
        TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l10n.cancel)),
        FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(l10n.stopAllBots)),
      ],
    ));
    if (confirmed != true) return;
    try {
      await ref.read(mineBotPlatformProvider).stopAllBots();
      if (mounted) setState(() { _message = l10n.stopRequested; _error = false; });
      ref.invalidate(engineStatusProvider);
    } catch (error) {
      if (mounted) setState(() { _message = error.toString(); _error = true; });
    }
  }

  Future<void> _clearLogs() async {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final bool? confirmed = await showDialog<bool>(context: context, builder: (BuildContext context) => AlertDialog(
      title: Text(l10n.clearLogs),
      content: Text(l10n.clearLogsConfirm),
      actions: <Widget>[
        TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l10n.cancel)),
        FilledButton.tonal(onPressed: () => Navigator.pop(context, true), child: Text(l10n.delete)),
      ],
    ));
    if (confirmed != true) return;
    try {
      await ref.read(mineBotPlatformProvider).clearTable('logs');
      refreshTable(ref, 'logs');
      if (mounted) setState(() { _message = l10n.logsCleared; _error = false; });
    } catch (error) {
      if (mounted) setState(() { _message = error.toString(); _error = true; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final JsonMap engine = ref.watch(engineStatusProvider).valueOrNull ?? const <String, dynamic>{};
    final List<String> tables = <String>['bots', 'servers', 'tasks', 'task_history', 'logs', 'skins'];
    final Map<String, List<JsonMap>> rows = <String, List<JsonMap>>{for (final String table in tables) table: ref.watch(recordsProvider(table)).valueOrNull ?? const <JsonMap>[]};
    final String title = switch (widget.section) {
      'engine' => l10n.minecraftSettings,
      'ai' => l10n.aiSettings,
      'behavior' => l10n.behaviorTitle,
      'security' => l10n.security,
      'storage' => l10n.storage,
      _ => l10n.about,
    };
    return CustomScrollView(
      physics: const BouncingScrollPhysics(),
      slivers: <Widget>[
        SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 10, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: ScreenHeader(title: title, subtitle: l10n.settingsTitle, leading: IconButton.filledTonal(onPressed: () => context.pop(), icon: const Icon(Icons.arrow_back_rounded))))),
        if (_message != null) SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.sm), sliver: SliverToBoxAdapter(child: GlassPanel(accent: _error ? AppColors.red : AppColors.green, child: Row(children: <Widget>[Icon(_error ? Icons.error_outline_rounded : Icons.check_circle_outline_rounded, color: _error ? AppColors.red : AppColors.green), const SizedBox(width: AppSpacing.xs), Expanded(child: Text(_message!, style: AppTypography.body))])))),
        if (widget.section == 'engine') ..._engineSection(l10n, engine)
        else if (widget.section == 'ai') ..._aiSection(l10n)
        else if (widget.section == 'behavior') ..._behaviorSection(l10n)
        else if (widget.section == 'security') ..._securitySection(l10n)
        else if (widget.section == 'storage') ..._storageSection(l10n, rows)
        else ..._aboutSection(l10n),
        SliverPadding(padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom + 92)),
      ],
    );
  }

  List<Widget> _engineSection(AppLocalizations l10n, JsonMap engine) => <Widget>[
        SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: GlassPanel(accent: AppColors.cyan, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
          _InfoLine(label: l10n.engineStatus, value: _engineLabel(l10n, valueText(engine['status'], fallback: 'STOPPED'))),
          _InfoLine(label: l10n.engineRuntime, value: valueText(engine['runtime'], fallback: l10n.notAvailable)),
          if (valueText(engine['reason']).isNotEmpty) _InfoLine(label: l10n.latestEngineEvent, value: valueText(engine['reason'])),
          const SizedBox(height: AppSpacing.sm),
          Text(l10n.engineInfo, style: AppTypography.body.copyWith(color: AppColors.textMuted)),
          const SizedBox(height: AppSpacing.xs),
          Text(l10n.permissionNotifications, style: AppTypography.label.copyWith(height: 1.4)),
          const SizedBox(height: AppSpacing.xs),
          OutlinedButton.icon(
            onPressed: () async {
              try {
                await ref.read(mineBotPlatformProvider).requestNotificationPermission();
              } catch (error) {
                if (mounted) setState(() { _message = error.toString(); _error = true; });
              }
            },
            icon: const Icon(Icons.notifications_active_outlined),
            label: Text(l10n.notificationSettings),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(l10n.noFakeData, style: AppTypography.label.copyWith(height: 1.4)),
        ])))),
        SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.sm, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: NeonButton(label: l10n.stopAllBots, icon: Icons.stop_circle_outlined, secondary: true, onPressed: _stopAll))),
        SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: GlassPanel(accent: AppColors.amber, child: Text(l10n.engineLimitNote, style: AppTypography.label.copyWith(height: 1.45))))),
      ];

  List<Widget> _aiSection(AppLocalizations l10n) {
    final JsonMap config = (ref.watch(recordsProvider('ai_config')).valueOrNull ?? const <JsonMap>[]).where((JsonMap row) => row['id'] == 'openrouter').firstOrNull ?? <String, dynamic>{};
    final List<JsonMap> models = (config['freeModels'] as List? ?? const <dynamic>[]).whereType<Map>().map((Map item) => Map<String, dynamic>.from(item)).toList(growable: false);
    return <Widget>[
      SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: GlassPanel(accent: AppColors.purple, child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: <Widget>[
        Row(children: <Widget>[const Icon(Icons.key_rounded, color: AppColors.purple), const SizedBox(width: AppSpacing.sm), Expanded(child: Text(l10n.openRouter, style: AppTypography.title)), StatusBadge(label: _checkingKey ? l10n.loading : _hasKey ? l10n.apiKeySaved : l10n.keyMissing, color: _hasKey ? AppColors.green : AppColors.amber)]),
        const SizedBox(height: AppSpacing.sm),
        Text(l10n.keySecurity, style: AppTypography.label.copyWith(height: 1.5)),
        const SizedBox(height: AppSpacing.md),
        TextField(controller: _keyController, obscureText: true, autocorrect: false, enableSuggestions: false, maxLength: 512, decoration: InputDecoration(labelText: l10n.apiKey, hintText: l10n.apiKeyHint, counterText: '')),
        const SizedBox(height: AppSpacing.xs),
        NeonButton(label: _busy ? l10n.saving : _hasKey ? l10n.replaceApiKey : l10n.setApiKey, icon: Icons.lock_rounded, loading: _busy, onPressed: _busy ? null : _saveKey),
        if (_hasKey) ...<Widget>[
          const SizedBox(height: AppSpacing.xs),
          OutlinedButton.icon(onPressed: _removeKey, icon: const Icon(Icons.delete_outline_rounded), label: Text(l10n.deleteApiKey)),
        ],
        const Divider(height: AppSpacing.xl),
        Text('${l10n.discoverModels} · ${models.length}', style: AppTypography.title),
        const SizedBox(height: AppSpacing.xs),
        Text(l10n.modelsToolsNotice, style: AppTypography.label.copyWith(height: 1.45)),
        const SizedBox(height: AppSpacing.sm),
        NeonButton(label: _busy ? l10n.loading : l10n.discoverModels, icon: Icons.travel_explore_rounded, secondary: true, loading: _busy, onPressed: !_hasKey || _busy ? null : _discoverModels),
        const SizedBox(height: AppSpacing.xs),
        Text('${l10n.modelsFound}: ${models.length}', style: AppTypography.label),
        const SizedBox(height: AppSpacing.sm),
        NeonButton(label: l10n.plannerTitle, icon: Icons.auto_awesome_rounded, onPressed: () => context.go('/tasks/planner')),
      ])))),
      SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.sm, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: GlassPanel(accent: AppColors.amber, child: Text(l10n.noAutoExecution, style: AppTypography.label.copyWith(height: 1.45))))),
    ];
  }

  List<Widget> _behaviorSection(AppLocalizations l10n) => <Widget>[
        SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: GlassPanel(accent: AppColors.green, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
          Text(l10n.behaviorCurrent, style: AppTypography.body.copyWith(height: 1.55)),
          const SizedBox(height: AppSpacing.md),
          for (final String item in <String>[l10n.priorityEmergency, l10n.prioritySurvival, l10n.priorityUser, l10n.priorityTask, l10n.priorityResources, l10n.priorityIdle]) Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: Row(children: <Widget>[const Icon(Icons.check_circle_outline_rounded, size: 16, color: AppColors.green), const SizedBox(width: AppSpacing.xs), Expanded(child: Text(item, style: AppTypography.label.copyWith(color: AppColors.text)))])),
          const SizedBox(height: AppSpacing.sm),
          Text(l10n.behaviorLimit, style: AppTypography.label.copyWith(color: AppColors.amber, height: 1.5)),
        ])))),
      ];

  List<Widget> _securitySection(AppLocalizations l10n) => <Widget>[
        SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: GlassPanel(accent: AppColors.blue, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
          Text(l10n.securityNotice, style: AppTypography.body.copyWith(height: 1.5)),
          const SizedBox(height: AppSpacing.md),
          _Bullet(text: l10n.keySecurity),
          _Bullet(text: l10n.authNoPassword),
          _Bullet(text: l10n.microsoftDeviceCode),
          _Bullet(text: l10n.localDataOnly),
          const SizedBox(height: AppSpacing.sm),
          Text(l10n.noFakeData, style: AppTypography.label.copyWith(color: AppColors.amber, height: 1.4)),
        ])))),
      ];

  List<Widget> _storageSection(AppLocalizations l10n, Map<String, List<JsonMap>> rows) => <Widget>[
        SliverPadding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0),
          sliver: SliverToBoxAdapter(
            child: GlassPanel(
              accent: AppColors.amber,
              child: Column(
                children: rows.entries
                    .map((MapEntry<String, List<JsonMap>> entry) => _InfoLine(
                          label: _tableLabel(l10n, entry.key),
                          value: '${entry.value.length}',
                        ))
                    .toList(growable: false),
              ),
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.sm, AppSpacing.page, 0),
          sliver: SliverToBoxAdapter(child: Text(l10n.localDatabaseInfo, style: AppTypography.label.copyWith(height: 1.5))),
        ),
        SliverPadding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.sm, AppSpacing.page, 0),
          sliver: SliverToBoxAdapter(child: NeonButton(label: l10n.clearLogs, icon: Icons.delete_sweep_outlined, secondary: true, onPressed: _clearLogs)),
        ),
      ];

  List<Widget> _aboutSection(AppLocalizations l10n) => <Widget>[
        SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: GlassPanel(accent: AppColors.purple, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
          const VoxelMark(size: 58),
          const SizedBox(height: AppSpacing.sm),
          Text(l10n.appName, style: AppTypography.headline),
          Text(l10n.tagline, style: AppTypography.label),
          const SizedBox(height: AppSpacing.md),
          Text(l10n.nativeFlutterAbout, style: AppTypography.body.copyWith(height: 1.5)),
          const SizedBox(height: AppSpacing.sm),
          Text(l10n.noFakeData, style: AppTypography.label.copyWith(color: AppColors.amber, height: 1.45)),
        ])))),
      ];

  String _engineLabel(AppLocalizations l10n, String status) => switch (status) {
        'READY' => l10n.engineReady,
        'FAILED' => l10n.engineFailed,
        'CONNECTING' => l10n.engineStarting,
        _ => l10n.engineIdle,
      };

  String _tableLabel(AppLocalizations l10n, String table) => switch (table) {
        'bots' => l10n.botProfiles,
        'servers' => l10n.serversTitle,
        'tasks' => l10n.tasksTitle,
        'task_history' => l10n.taskHistory,
        'logs' => l10n.logs,
        'skins' => l10n.savedSkins,
        _ => table,
      };
}

class _InfoLine extends StatelessWidget {
  const _InfoLine({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) => Padding(padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[Expanded(child: Text(label, style: AppTypography.label)), const SizedBox(width: AppSpacing.sm), Flexible(child: Text(value, textAlign: TextAlign.end, style: AppTypography.body))]));
}

class _Bullet extends StatelessWidget {
  const _Bullet({required this.text});
  final String text;
  @override
  Widget build(BuildContext context) => Padding(padding: const EdgeInsets.symmetric(vertical: 5), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[const Icon(Icons.verified_user_outlined, size: 16, color: AppColors.green), const SizedBox(width: AppSpacing.xs), Expanded(child: Text(text, style: AppTypography.body.copyWith(fontSize: 12)))]));
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
