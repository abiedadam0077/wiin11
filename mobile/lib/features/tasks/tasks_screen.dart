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

class TasksScreen extends ConsumerStatefulWidget {
  const TasksScreen({super.key});

  @override
  ConsumerState<TasksScreen> createState() => _TasksScreenState();
}

class _TasksScreenState extends ConsumerState<TasksScreen> {
  String _filter = 'all';

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final AsyncValue<List<JsonMap>> tasksAsync = ref.watch(recordsProvider('tasks'));
    final List<JsonMap> tasks = tasksAsync.valueOrNull ?? const <JsonMap>[];
    final List<JsonMap> bots = ref.watch(recordsProvider('bots')).valueOrNull ?? const <JsonMap>[];
    final List<JsonMap> servers = ref.watch(recordsProvider('servers')).valueOrNull ?? const <JsonMap>[];
    final List<JsonMap> states = ref.watch(recordsProvider('bot_states')).valueOrNull ?? const <JsonMap>[];
    final List<_TaskFilter> filters = <_TaskFilter>[
      _TaskFilter('all', l10n.filterAll),
      _TaskFilter('running', l10n.tabActive),
      _TaskFilter('queued', l10n.tabQueued),
      _TaskFilter('paused', l10n.tabWaiting),
      _TaskFilter('completed', l10n.tabCompleted),
      _TaskFilter('failed', l10n.tabFailed),
    ];
    final List<JsonMap> visible = tasks.where((JsonMap task) {
      final String status = valueText(task['status'], fallback: 'pending').toLowerCase();
      return switch (_filter) {
        'running' => status == 'running',
        'queued' => <String>{'pending', 'interrupted'}.contains(status),
        'paused' => <String>{'paused', 'inventory_full'}.contains(status),
        'completed' => status == 'completed',
        'failed' => <String>{'failed', 'cancelled'}.contains(status),
        _ => true,
      };
    }).toList()
      ..sort((JsonMap a, JsonMap b) => timestampMillis(b, 'updatedAt').compareTo(timestampMillis(a, 'updatedAt')));

    return RefreshIndicator(
      color: AppColors.cyan,
      onRefresh: () async {
        await Future.wait<Object?>(<Future<Object?>>[
          ref.refresh(recordsProvider('tasks').future),
          ref.refresh(recordsProvider('bot_states').future),
          ref.refresh(recordsProvider('bots').future),
        ]);
      },
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
        slivers: <Widget>[
          SliverPadding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 10, AppSpacing.page, 0),
            sliver: SliverToBoxAdapter(
              child: ScreenHeader(
                title: l10n.tasksTitle,
                subtitle: l10n.taskSubtitle,
                trailing: IconButton.filledTonal(tooltip: l10n.createTask, onPressed: () => context.push('/tasks/create'), icon: const Icon(Icons.add_rounded)),
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.xs),
            sliver: SliverToBoxAdapter(
              child: GlassPanel(
                accent: AppColors.blue,
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.xs),
                child: Row(children: <Widget>[const Icon(Icons.fact_check_outlined, color: AppColors.blue, size: 18), const SizedBox(width: AppSpacing.xs), Expanded(child: Text(l10n.taskSubtitle, style: AppTypography.label.copyWith(fontSize: 10, height: 1.35)))]),
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: SizedBox(
              height: 51,
              child: ListView.separated(
                padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.xs),
                scrollDirection: Axis.horizontal,
                itemCount: filters.length,
                separatorBuilder: (_, __) => const SizedBox(width: AppSpacing.xs),
                itemBuilder: (BuildContext context, int index) {
                  final _TaskFilter filter = filters[index];
                  return FilterChip(label: Text(filter.label), selected: _filter == filter.key, showCheckmark: false, onSelected: (_) => setState(() => _filter = filter.key));
                },
              ),
            ),
          ),
          if (tasksAsync.isLoading && tasks.isEmpty)
            const SliverFillRemaining(hasScrollBody: false, child: LoadingState())
          else if (tasksAsync.hasError)
            SliverPadding(padding: const EdgeInsets.all(AppSpacing.page), sliver: SliverToBoxAdapter(child: asyncContent(context, tasksAsync, data: (_) => const SizedBox.shrink(), onRetry: () => ref.invalidate(recordsProvider('tasks')))))
          else if (visible.isEmpty)
            SliverPadding(
              padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0),
              sliver: SliverToBoxAdapter(child: EmptyState(title: l10n.noTasks, message: l10n.noFakeData, icon: Icons.checklist_rounded, action: NeonButton(label: l10n.createTask, icon: Icons.add_task_rounded, expanded: false, onPressed: () => context.push('/tasks/create')))),
            )
          else
            SliverPadding(
              padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.xs, AppSpacing.page, 0),
              sliver: SliverList.builder(
                itemCount: visible.length,
                itemBuilder: (BuildContext context, int index) {
                  final JsonMap task = visible[index];
                  final JsonMap? bot = bots.where((JsonMap row) => row['id'] == task['botId']).firstOrNull;
                  final JsonMap? state = states.where((JsonMap row) => (row['botId'] ?? row['id']) == task['botId']).firstOrNull;
                  final JsonMap? server = servers.where((JsonMap row) => row['id'] == bot?['serverId']).firstOrNull;
                  return Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                    child: TaskCard(
                      task: task,
                      bot: bot,
                      server: server,
                      freshBot: isFreshSnapshot(state),
                      onOpen: () => context.push('/tasks/${task['id']}'),
                      onStart: () => _start(task, state),
                      onPause: () => _send(task, 'pause-task'),
                      onResume: () => _send(task, 'resume-task'),
                      onCancel: () => _confirmCancel(task),
                    ),
                  );
                },
              ),
            ),
          SliverPadding(padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom + 92)),
        ],
      ),
    );
  }

  Future<void> _start(JsonMap task, JsonMap? state) async {
    final AppLocalizations l10n = AppLocalizations.of(context);
    if (!isFreshSnapshot(state)) {
      showFeedback(context, l10n.taskNeedsSpawn, error: true);
      return;
    }
    if (valueText(task['type']) != 'collect' || valueText(task['blockName']).isEmpty) {
      showFeedback(context, l10n.notSupportedByEngine, error: true);
      return;
    }
    final int amount = finiteInt(task['count']) ?? 0;
    if (amount < 1 || amount > 320) {
      showFeedback(context, l10n.quantity, error: true);
      return;
    }
    final JsonMap command = <String, dynamic>{
      'action': 'execute-tool',
      'toolName': 'collect_block',
      'botId': task['botId'],
      'taskId': task['id'],
      'arguments': <String, dynamic>{'block_name': task['blockName'], 'amount': amount},
      'alreadyCollected': finiteInt(task['verifiedCollected']) ?? 0,
      if (task['initialInventoryCount'] != null) 'initialInventoryCount': task['initialInventoryCount'],
    };
    await _sendCommand(command);
  }

  Future<void> _send(JsonMap task, String action) async {
    if (!isTerminalTask(valueText(task['status']))) await _sendCommand(<String, dynamic>{'action': action, 'botId': task['botId'], 'taskId': task['id']});
  }

  Future<void> _sendCommand(JsonMap command) async {
    try {
      await ref.read(mineBotPlatformProvider).sendCommand(command);
      HapticFeedback.selectionClick();
      refreshTable(ref, 'tasks');
      refreshTable(ref, 'logs');
    } catch (error) {
      if (mounted) showFeedback(context, error.toString(), error: true);
    }
  }

  Future<void> _confirmCancel(JsonMap task) async {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final bool? confirmed = await showDialog<bool>(context: context, builder: (BuildContext context) => AlertDialog(
      title: Text(l10n.cancelTask),
      content: Text(l10n.cancelTaskConfirm),
      actions: <Widget>[
        TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l10n.keepTask)),
        FilledButton.tonal(onPressed: () => Navigator.pop(context, true), child: Text(l10n.cancelTask)),
      ],
    ));
    if (confirmed == true) await _send(task, 'cancel-task');
  }
}

class TaskCard extends StatelessWidget {
  const TaskCard({super.key, required this.task, required this.bot, required this.server, required this.freshBot, required this.onOpen, required this.onStart, required this.onPause, required this.onResume, required this.onCancel});

  final JsonMap task;
  final JsonMap? bot;
  final JsonMap? server;
  final bool freshBot;
  final VoidCallback onOpen;
  final VoidCallback onStart;
  final VoidCallback onPause;
  final VoidCallback onResume;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final String status = valueText(task['status'], fallback: 'pending').toLowerCase();
    final bool inventoryFull = valueText(task['stage']).toUpperCase() == 'INVENTORY_FULL';
    final ({String label, Color color, bool pulse}) badge = inventoryFull
        ? (label: l10n.stageInventoryFull, color: AppColors.amber, pulse: false)
        : taskPresentation(l10n, status);
    final int progress = (finiteInt(task['progress']) ?? 0).clamp(0, 100).toInt();
    final int verified = finiteInt(task['verifiedCollected']) ?? 0;
    final int count = finiteInt(task['count']) ?? 0;
    final bool startable = <String>{'pending', 'failed', 'interrupted'}.contains(status);
    final bool running = status == 'running';
    final bool pausedByUser = <String>{'paused', 'inventory_full'}.contains(status)
        && <String>{'USER_PAUSE', 'INVENTORY_FULL'}.contains(valueText(task['runtimePriority']));
    final bool cancelable = running || <String>{'paused', 'inventory_full'}.contains(status);
    return GlassPanel(
      accent: badge.color,
      onTap: onOpen,
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
        Row(children: <Widget>[
          Expanded(child: Text(valueText(task['name'], fallback: l10n.taskName), style: AppTypography.title, maxLines: 2, overflow: TextOverflow.ellipsis)),
          StatusBadge(label: badge.label, color: badge.color, pulse: badge.pulse),
        ]),
        const SizedBox(height: AppSpacing.xs),
        Text('${l10n.assignedBot}: ${valueText(bot?['name'], fallback: valueText(task['botId'], fallback: l10n.notAvailable))} · ${l10n.server}: ${valueText(server?['name'], fallback: l10n.notAvailable)}', style: AppTypography.label, maxLines: 2, overflow: TextOverflow.ellipsis),
        if (valueText(task['blockName']).isNotEmpty) ...<Widget>[
          const SizedBox(height: AppSpacing.xs),
          Text('${task['blockName']} · $verified/$count ${l10n.confirmedItems}', style: AppTypography.body.copyWith(fontSize: 12, color: AppColors.text)),
          if (valueText(task['outputItemName']).isNotEmpty) Text('${l10n.outputItem}: ${task['outputItemName']}', style: AppTypography.label.copyWith(color: AppColors.cyan)),
          const SizedBox(height: AppSpacing.xs),
          ClipRRect(borderRadius: BorderRadius.circular(AppRadius.pill), child: LinearProgressIndicator(value: progress / 100, minHeight: 5, color: badge.color, backgroundColor: AppColors.surfaceRaised)),
        ],
        if (running || <String>{'paused', 'inventory_full'}.contains(status)) ...<Widget>[
          const SizedBox(height: AppSpacing.xs),
          Text('${taskStageLabel(l10n, task['stage'])} · ${l10n.taskDuration}: ${formatDuration(task['durationMs'])}', style: AppTypography.label.copyWith(color: badge.color)),
          if (valueText(task['currentAction']).isNotEmpty) Text(valueText(task['currentAction']), style: AppTypography.label.copyWith(color: AppColors.textMuted), maxLines: 2, overflow: TextOverflow.ellipsis),
        ],
        if ((<String>{'failed', 'interrupted', 'paused', 'inventory_full'}.contains(status) || inventoryFull) && valueText(task['lastReason']).isNotEmpty) ...<Widget>[
          const SizedBox(height: AppSpacing.xs),
          Text(valueText(task['lastReason']), style: AppTypography.label.copyWith(color: AppColors.amber), maxLines: 3, overflow: TextOverflow.ellipsis),
        ],
        const SizedBox(height: AppSpacing.sm),
        Wrap(spacing: AppSpacing.xs, runSpacing: AppSpacing.xs, children: <Widget>[
          if (startable) OutlinedButton.icon(onPressed: freshBot ? onStart : null, icon: const Icon(Icons.play_arrow_rounded), label: Text(l10n.start)),
          if (running) OutlinedButton.icon(onPressed: onPause, icon: const Icon(Icons.pause_rounded), label: Text(l10n.pause)),
          if (pausedByUser) OutlinedButton.icon(onPressed: freshBot ? onResume : null, icon: const Icon(Icons.play_arrow_rounded), label: Text(l10n.resume)),
          if (cancelable) TextButton.icon(onPressed: onCancel, icon: const Icon(Icons.cancel_outlined), label: Text(l10n.cancelTask)),
          TextButton.icon(onPressed: onOpen, icon: const Icon(Icons.open_in_new_rounded), label: Text(l10n.details)),
        ]),
        if (startable && !freshBot) Padding(padding: const EdgeInsets.only(top: AppSpacing.xs), child: Text(l10n.taskNeedsSpawn, style: AppTypography.label.copyWith(color: AppColors.amber))),
      ]),
    );
  }
}

({String label, Color color, bool pulse}) taskPresentation(AppLocalizations l10n, String status) {
  switch (status.toLowerCase()) {
    case 'running': return (label: l10n.tabActive, color: AppColors.blue, pulse: true);
    case 'pending': return (label: l10n.tabQueued, color: AppColors.purple, pulse: false);
    case 'interrupted': return (label: l10n.interrupted, color: AppColors.amber, pulse: false);
    case 'paused':
    case 'inventory_full': return (label: l10n.tabWaiting, color: AppColors.amber, pulse: false);
    case 'completed': return (label: l10n.tabCompleted, color: AppColors.green, pulse: false);
    case 'cancelled': return (label: l10n.cancelled, color: AppColors.textMuted, pulse: false);
    case 'failed': return (label: l10n.tabFailed, color: AppColors.red, pulse: false);
    default: return (label: l10n.statusUnknown, color: AppColors.textMuted, pulse: false);
  }
}

String taskStageLabel(AppLocalizations l10n, Object? rawStage) => switch (valueText(rawStage).toUpperCase()) {
      'IN_WORLD' => l10n.stageInWorld,
      'SEARCHING' => l10n.stageSearching,
      'TARGET_FOUND' => l10n.stageTargetFound,
      'MOVING' => l10n.stageMoving,
      'BREAKING' => l10n.stageBreaking,
      'COLLECTING' => l10n.stageCollecting,
      'VERIFYING_INVENTORY' => l10n.stageVerifyingInventory,
      'PATH_BLOCKED' => l10n.stagePathBlocked,
      'INVENTORY_FULL' => l10n.stageInventoryFull,
      'PAUSED' => l10n.stagePaused,
      'COMPLETED' => l10n.stageCompleted,
      'FAILED' => l10n.stageFailed,
      'CANCELLED' => l10n.stageCancelled,
      _ => l10n.statusUnknown,
    };

class _TaskFilter {
  const _TaskFilter(this.key, this.label);
  final String key;
  final String label;
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
