import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/data/providers.dart';
import '../../core/data/record_helpers.dart';
import '../../core/theme/app_design_system.dart';
import '../../core/widgets/async_view.dart';
import '../../core/widgets/visuals.dart';
import '../../l10n/generated/app_localizations.dart';

class PlannerScreen extends ConsumerStatefulWidget {
  const PlannerScreen({super.key});

  @override
  ConsumerState<PlannerScreen> createState() => _PlannerScreenState();
}

class _PlannerScreenState extends ConsumerState<PlannerScreen> {
  final TextEditingController _prompt = TextEditingController();
  bool _hasKey = false;
  bool _keyLoading = true;
  bool _discovering = false;
  bool _planning = false;
  bool _saving = false;
  String _modelId = '';
  String _botId = '';
  JsonMap? _plan;
  String? _failure;

  @override
  void initState() {
    super.initState();
    _loadKeyStatus();
  }

  @override
  void dispose() {
    _prompt.dispose();
    super.dispose();
  }

  Future<void> _loadKeyStatus() async {
    try {
      final bool hasKey = await ref.read(mineBotPlatformProvider).hasApiKey();
      if (mounted) setState(() { _hasKey = hasKey; _keyLoading = false; });
    } catch (_) {
      if (mounted) setState(() { _hasKey = false; _keyLoading = false; });
    }
  }

  Future<void> _discoverModels() async {
    if (!_hasKey || _discovering) return;
    setState(() { _discovering = true; _failure = null; });
    try {
      final List<JsonMap> models = await ref.read(mineBotPlatformProvider).discoverFreeModels();
      if (models.isEmpty) throw StateError(AppLocalizations.of(context).modelsNotFound);
      final List<JsonMap> toolModels = models.where((JsonMap row) => row['supportsTools'] == true).toList(growable: false);
      if (toolModels.isEmpty) throw StateError(AppLocalizations.of(context).modelsToolsNotFound);
      final JsonMap old = _config;
      final String selected = toolModels.any((JsonMap row) => row['id'] == _modelId) ? _modelId : valueText(toolModels.first['id']);
      await ref.read(mineBotPlatformProvider).upsert('ai_config', <String, dynamic>{
        ...old,
        'id': 'openrouter',
        'freeModels': models,
        'selectedModel': selected,
        'updatedAt': DateTime.now().millisecondsSinceEpoch,
      });
      refreshTable(ref, 'ai_config');
      if (mounted) setState(() => _modelId = selected);
    } catch (error) {
      if (mounted) setState(() => _failure = _safeError(error));
    } finally {
      if (mounted) setState(() => _discovering = false);
    }
  }

  Future<void> _buildPlan(List<JsonMap> models) async {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final String prompt = _prompt.text.trim();
    final bool modelExists = models.any((JsonMap row) => row['id'] == _modelId && row['supportsTools'] == true);
    if (prompt.isEmpty || prompt.length > 4000) {
      setState(() => _failure = l10n.promptRequired);
      return;
    }
    if (!_hasKey) {
      setState(() => _failure = l10n.keyMissing);
      return;
    }
    if (!modelExists) {
      final bool anyToolModel = models.any((JsonMap row) => row['supportsTools'] == true);
      setState(() => _failure = anyToolModel ? l10n.selectModel : l10n.modelsToolsNotFound);
      return;
    }
    setState(() { _planning = true; _failure = null; _plan = null; });
    try {
      final JsonMap result = await ref.read(mineBotPlatformProvider).createPlan(prompt: prompt, model: _modelId, models: models);
      if (mounted) setState(() => _plan = result);
    } catch (error) {
      if (mounted) setState(() => _failure = _safeError(error));
    } finally {
      if (mounted) setState(() => _planning = false);
    }
  }

  Future<void> _approvePlan(JsonMap plan, List<JsonMap> bots) async {
    final AppLocalizations l10n = AppLocalizations.of(context);
    if (plan['action'] != 'collect' || plan['toolName'] != 'collect_block') return;
    if (!RegExp(r'^[a-z0-9_]{1,64}$').hasMatch(valueText(plan['blockName'])) || (finiteInt(plan['count']) ?? 0) < 1 || (finiteInt(plan['count']) ?? 0) > 320) {
      setState(() => _failure = l10n.invalidPlan);
      return;
    }
    if (!bots.any((JsonMap bot) => bot['id'] == _botId)) {
      setState(() => _failure = l10n.selectBot);
      return;
    }
    setState(() => _saving = true);
    final String taskId = 'ai-task-${DateTime.now().microsecondsSinceEpoch}';
    final int now = DateTime.now().millisecondsSinceEpoch;
    final int count = finiteInt(plan['count']) ?? 0;
    final String block = valueText(plan['blockName']);
    final String botId = _botId;
    final JsonMap task = <String, dynamic>{
      'id': taskId,
      'name': '${l10n.aiPlanPrefix} $count × $block',
      'description': valueText(plan['reason'], fallback: l10n.plannerDescription),
      'type': 'collect',
      'blockName': block,
      'count': count,
      'botId': botId,
      'source': 'ai_high_level_plan',
      'model': valueText(plan['model'], fallback: _modelId),
      'status': 'pending',
      'progress': 0,
      'verifiedCollected': 0,
      'createdAt': now,
      'updatedAt': now,
    };
    try {
      final platform = ref.read(mineBotPlatformProvider);
      await platform.upsert('tasks', task);
      await platform.upsert('task_history', <String, dynamic>{'id': '$taskId-created', 'taskId': taskId, 'botId': botId, 'status': 'PENDING', 'message': l10n.planSaved, 'createdAt': now});
      refreshTable(ref, 'tasks');
      refreshTable(ref, 'task_history');
      if (mounted) {
        HapticFeedback.mediumImpact();
        showFeedback(context, l10n.planSaved);
        context.go('/tasks');
      }
    } catch (error) {
      if (mounted) setState(() => _failure = _safeError(error));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  JsonMap get _config {
    final List<JsonMap> rows = ref.read(recordsProvider('ai_config')).valueOrNull ?? const <JsonMap>[];
    return rows.where((JsonMap row) => row['id'] == 'openrouter').firstOrNull ?? <String, dynamic>{};
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final AsyncValue<List<JsonMap>> configAsync = ref.watch(recordsProvider('ai_config'));
    final JsonMap config = configAsync.valueOrNull?.where((JsonMap row) => row['id'] == 'openrouter').firstOrNull ?? <String, dynamic>{};
    final List<JsonMap> models = (config['freeModels'] as List? ?? const <dynamic>[]).whereType<Map>().map((Map row) => Map<String, dynamic>.from(row)).toList(growable: false);
    if (_modelId.isEmpty && valueText(config['selectedModel']).isNotEmpty) _modelId = valueText(config['selectedModel']);
    final List<JsonMap> bots = ref.watch(recordsProvider('bots')).valueOrNull ?? const <JsonMap>[];
    final String action = valueText(_plan?['action'], fallback: 'unsupported');
    final bool supported = action == 'collect' && _plan?['toolName'] == 'collect_block';

    return CustomScrollView(
      physics: const BouncingScrollPhysics(),
      slivers: <Widget>[
        SliverPadding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 10, AppSpacing.page, 0),
          sliver: SliverToBoxAdapter(child: ScreenHeader(title: l10n.plannerTitle, subtitle: l10n.openRouter, leading: IconButton.filledTonal(onPressed: () => context.pop(), icon: const Icon(Icons.arrow_back_rounded)), trailing: StatusBadge(label: _keyLoading ? l10n.loading : _hasKey ? l10n.apiKeySaved : l10n.keyMissing, color: _hasKey ? AppColors.green : AppColors.amber))),
        ),
        SliverPadding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0),
          sliver: SliverToBoxAdapter(
            child: GlassPanel(accent: AppColors.purple, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
              Row(children: <Widget>[const Icon(Icons.auto_awesome_rounded, color: AppColors.purple), const SizedBox(width: AppSpacing.sm), Expanded(child: Text(l10n.openRouter, style: AppTypography.title)), Text('AI', style: AppTypography.micro.copyWith(color: AppColors.cyan))]),
              const SizedBox(height: AppSpacing.sm),
              Text(l10n.plannerDescription, style: AppTypography.body.copyWith(fontSize: 12, color: AppColors.textMuted)),
              const SizedBox(height: AppSpacing.sm),
              Text(l10n.keySecurity, style: AppTypography.label.copyWith(height: 1.4)),
              const SizedBox(height: AppSpacing.sm),
              NeonButton(label: _hasKey ? l10n.replaceApiKey : l10n.setApiKey, icon: Icons.key_rounded, secondary: true, onPressed: () => context.go('/settings/section/ai')),
            ])),
          ),
        ),
        if (!_keyLoading && !_hasKey)
          SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.sm, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: EmptyState(title: l10n.keyMissing, message: l10n.configureOpenRouterFirst, icon: Icons.lock_outline_rounded, action: NeonButton(label: l10n.settingsTitle, icon: Icons.tune_rounded, expanded: false, onPressed: () => context.go('/settings/section/ai'))))),
        if (_hasKey) ...<Widget>[
          SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: SectionHeading(l10n.selectModel))),
          SliverPadding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0),
            sliver: SliverToBoxAdapter(
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: <Widget>[
                DropdownButtonFormField<String>(
                  value: models.any((JsonMap row) => row['id'] == _modelId && row['supportsTools'] == true) ? _modelId : null,
                  isExpanded: true,
                  decoration: InputDecoration(labelText: l10n.selectModel),
                  items: models.where((JsonMap row) => row['supportsTools'] == true).map((JsonMap row) => DropdownMenuItem<String>(value: valueText(row['id']), child: Text(valueText(row['name'], fallback: valueText(row['id'])), maxLines: 1, overflow: TextOverflow.ellipsis))).toList(growable: false),
                  onChanged: (String? value) async {
                    if (value == null) return;
                    setState(() { _modelId = value; _failure = null; });
                    try {
                      await ref.read(mineBotPlatformProvider).upsert('ai_config', <String, dynamic>{...config, 'id': 'openrouter', 'selectedModel': value, 'updatedAt': DateTime.now().millisecondsSinceEpoch});
                      refreshTable(ref, 'ai_config');
                    } catch (error) {
                      if (mounted) setState(() => _failure = _safeError(error));
                    }
                  },
                ),
                const SizedBox(height: AppSpacing.xs),
                NeonButton(label: _discovering ? l10n.loading : l10n.discoverModels, icon: Icons.travel_explore_rounded, secondary: true, loading: _discovering, onPressed: _discovering ? null : _discoverModels),
                if (models.isNotEmpty) Padding(padding: const EdgeInsets.only(top: AppSpacing.xs), child: Text('${l10n.modelsFound}: ${models.length}', style: AppTypography.label)),
              ]),
            ),
          ),
          SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: SectionHeading(l10n.assignedBot))),
          SliverPadding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0),
            sliver: SliverToBoxAdapter(
              child: bots.isEmpty
                  ? EmptyState(title: l10n.noBots, message: l10n.createFirstBot, action: NeonButton(label: l10n.addBot, icon: Icons.add_rounded, expanded: false, onPressed: () => context.go('/bots')))
                  : DropdownButtonFormField<String>(
                      value: bots.any((JsonMap bot) => bot['id'] == _botId) ? _botId : null,
                      isExpanded: true,
                      decoration: InputDecoration(labelText: l10n.assignedBot),
                      items: bots.map((JsonMap bot) => DropdownMenuItem<String>(value: valueText(bot['id']), child: Text(valueText(bot['name'], fallback: valueText(bot['username'])), overflow: TextOverflow.ellipsis))).toList(growable: false),
                      onChanged: (String? value) => setState(() { _botId = value ?? ''; _plan = null; }),
                    ),
            ),
          ),
          SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: SectionHeading(l10n.promptLabel))),
          SliverPadding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0),
            sliver: SliverToBoxAdapter(
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: <Widget>[
                TextField(controller: _prompt, maxLength: 4000, minLines: 3, maxLines: 6, textCapitalization: TextCapitalization.sentences, decoration: InputDecoration(hintText: l10n.promptHint, alignLabelWithHint: true)),
                NeonButton(label: _planning ? l10n.planning : l10n.analyzeGoal, icon: Icons.auto_awesome_rounded, loading: _planning, onPressed: _planning ? null : () => _buildPlan(models)),
              ]),
            ),
          ),
        ],
        SliverPadding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0),
          sliver: SliverToBoxAdapter(child: GlassPanel(accent: AppColors.amber, child: Text(l10n.noAutoExecution, style: AppTypography.label.copyWith(color: AppColors.amber, height: 1.45)))),
        ),
        if (_failure != null)
          SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: GlassPanel(accent: AppColors.red, child: Text(_failure!, style: AppTypography.body.copyWith(color: AppColors.red))))),
        if (_plan != null)
          SliverPadding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0),
            sliver: SliverToBoxAdapter(
              child: GlassPanel(accent: supported ? AppColors.green : AppColors.amber, child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: <Widget>[
                Row(children: <Widget>[Icon(supported ? Icons.fact_check_rounded : Icons.block_rounded, color: supported ? AppColors.green : AppColors.amber), const SizedBox(width: AppSpacing.sm), Expanded(child: Text(l10n.proposedPlan, style: AppTypography.title)), StatusBadge(label: supported ? l10n.supportedPlan : l10n.unsupportedPlanShort, color: supported ? AppColors.green : AppColors.amber)]),
                const SizedBox(height: AppSpacing.md),
                if (supported) ...<Widget>[
                  Text('${l10n.requiredTool}: collect_block', style: AppTypography.micro.copyWith(color: AppColors.cyan)),
                  const SizedBox(height: AppSpacing.xs),
                  Text('${l10n.gathering} · ${_plan!['count']} × ${_plan!['blockName']}', style: AppTypography.headline.copyWith(fontSize: 19)),
                ],
                const SizedBox(height: AppSpacing.sm),
                Text(valueText(_plan!['reason'], fallback: l10n.notAvailable), style: AppTypography.body.copyWith(color: AppColors.textMuted)),
                const SizedBox(height: AppSpacing.xs),
                Text('${l10n.selectModel}: ${valueText(_plan!['model'], fallback: _modelId)}', style: AppTypography.label),
                const SizedBox(height: AppSpacing.sm),
                Text(l10n.noAutoExecution, style: AppTypography.label.copyWith(color: AppColors.amber, height: 1.4)),
                if (supported) ...<Widget>[
                  const SizedBox(height: AppSpacing.md),
                  if (bots.isEmpty) Text(l10n.createFirstBot, style: AppTypography.label.copyWith(color: AppColors.amber))
                  else NeonButton(label: _saving ? l10n.saving : l10n.approvePlan, icon: Icons.check_circle_outline_rounded, loading: _saving, onPressed: _saving ? null : () => _approvePlan(_plan!, bots)),
                  if (bots.isEmpty) ...<Widget>[
                    const SizedBox(height: AppSpacing.xs),
                    NeonButton(label: l10n.addBot, icon: Icons.add_rounded, secondary: true, onPressed: () => context.go('/bots')),
                  ],
                ],
                const SizedBox(height: AppSpacing.xs),
                TextButton.icon(onPressed: () => setState(() => _plan = null), icon: const Icon(Icons.edit_outlined), label: Text(l10n.editPlan)),
              ])),
            ),
          ),
        SliverPadding(padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom + 92)),
      ],
    );
  }
}

String _safeError(Object error) {
  final String message = error.toString().replaceAll(RegExp(r"sk-or-\S+|Bearer\s+\S+", caseSensitive: false), '[redacted]');
  return message.length > 320 ? message.substring(0, 320) : message;
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
