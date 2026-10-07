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
import 'tasks_screen.dart' show taskPresentation;

class TaskDetailsScreen extends ConsumerWidget {
  const TaskDetailsScreen({super.key, required this.taskId});
  final String taskId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final AsyncValue<List<JsonMap>> tasksAsync = ref.watch(recordsProvider('tasks'));
    final List<JsonMap> tasks = tasksAsync.valueOrNull ?? const <JsonMap>[];
    final JsonMap? task = tasks.where((JsonMap row) => row['id'] == taskId).firstOrNull;
    final List<JsonMap> bots = ref.watch(recordsProvider('bots')).valueOrNull ?? const <JsonMap>[];
    final List<JsonMap> states = ref.watch(recordsProvider('bot_states')).valueOrNull ?? const <JsonMap>[];
    final List<JsonMap> history = ref.watch(recordsProvider('task_history')).valueOrNull ?? const <JsonMap>[];
    if (task == null) {
      return SafeArea(child: Padding(padding: const EdgeInsets.all(AppSpacing.page), child: asyncContent(context, tasksAsync, data: (_) => EmptyState(title: l10n.taskNotFound, message: l10n.noTasks, action: NeonButton(label: l10n.tasksTitle, expanded: false, onPressed: () => context.go('/tasks'))), onRetry: () => ref.invalidate(recordsProvider('tasks')))));
    }
    final JsonMap? bot = bots.where((JsonMap row) => row['id'] == task['botId']).firstOrNull;
    final JsonMap? state = states.where((JsonMap row) => (row['botId'] ?? row['id']) == task['botId']).firstOrNull;
    final bool live = isFreshSnapshot(state);
    final String status = valueText(task['status'], fallback: 'pending').toLowerCase();
    final ({String label, Color color, bool pulse}) badge = taskPresentation(l10n, status);
    final int progress = (finiteInt(task['progress']) ?? 0).clamp(0, 100).toInt();
    final int count = finiteInt(task['count']) ?? 0;
    final int verified = finiteInt(task['verifiedCollected']) ?? 0;
    final List<JsonMap> timeline = history.where((JsonMap item) => item['taskId'] == taskId).toList()
      ..sort((JsonMap a, JsonMap b) => timestampMillis(b, 'createdAt').compareTo(timestampMillis(a, 'createdAt')));

    return CustomScrollView(
      physics: const BouncingScrollPhysics(),
      slivers: <Widget>[
        SliverPadding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 10, AppSpacing.page, 0),
          sliver: SliverToBoxAdapter(child: ScreenHeader(title: valueText(task['name'], fallback: l10n.taskName), subtitle: l10n.taskDetails, leading: IconButton.filledTonal(onPressed: () => context.pop(), icon: const Icon(Icons.arrow_back_rounded)), trailing: StatusBadge(label: badge.label, color: badge.color, pulse: badge.pulse))),
        ),
        SliverPadding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0),
          sliver: SliverToBoxAdapter(
            child: GlassPanel(accent: badge.color, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
              Text(valueText(task['description'], fallback: l10n.taskSubtitle), style: AppTypography.body),
              const SizedBox(height: AppSpacing.md),
              _DetailRow(label: l10n.assignedBot, value: valueText(bot?['name'], fallback: valueText(task['botId'], fallback: l10n.notAvailable))),
              _DetailRow(label: l10n.stepCategory, value: valueText(task['type'], fallback: l10n.notAvailable)),
              if (valueText(task['blockName']).isNotEmpty) _DetailRow(label: l10n.selectBlock, value: valueText(task['blockName'])),
              if (task['count'] != null) _DetailRow(label: l10n.quantity, value: '$count'),
              _DetailRow(label: l10n.confirmedItems, value: '$verified${count > 0 ? ' / $count' : ''}'),
              const SizedBox(height: AppSpacing.xs),
              ClipRRect(borderRadius: BorderRadius.circular(AppRadius.pill), child: LinearProgressIndicator(value: progress / 100, minHeight: 7, color: badge.color, backgroundColor: AppColors.surfaceRaised)),
              const SizedBox(height: AppSpacing.xs),
              Align(alignment: AlignmentDirectional.centerEnd, child: Text('$progress%', style: AppTypography.title.copyWith(color: badge.color))),
              if (status == 'running' || status == 'paused') ...<Widget>[
                const Divider(height: AppSpacing.lg),
                Text(valueText(task['currentAction'], fallback: l10n.currentAction), style: AppTypography.body.copyWith(color: AppColors.cyan)),
              ],
              if (<String>{'failed', 'interrupted'}.contains(status) && valueText(task['lastReason']).isNotEmpty) ...<Widget>[
                const SizedBox(height: AppSpacing.sm),
                Text(valueText(task['lastReason']), style: AppTypography.body.copyWith(color: AppColors.amber)),
              ],
              const SizedBox(height: AppSpacing.sm),
              Text(l10n.noAutoExecution, style: AppTypography.label.copyWith(height: 1.45)),
            ])),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.sm, AppSpacing.page, 0),
          sliver: SliverToBoxAdapter(
            child: Wrap(spacing: AppSpacing.xs, runSpacing: AppSpacing.xs, children: <Widget>[
              if (<String>{'pending', 'failed', 'interrupted'}.contains(status)) OutlinedButton.icon(onPressed: live ? () => _send(context, ref, <String, dynamic>{'action': 'execute-tool', 'toolName': 'collect_block', 'botId': task['botId'], 'taskId': taskId, 'arguments': <String, dynamic>{'block_name': task['blockName'], 'amount': count}, 'alreadyCollected': verified, if (task['initialInventoryCount'] != null) 'initialInventoryCount': task['initialInventoryCount']}) : null, icon: const Icon(Icons.play_arrow_rounded), label: Text(l10n.start)),
              if (status == 'running') OutlinedButton.icon(onPressed: () => _send(context, ref, <String, dynamic>{'action': 'pause-task', 'botId': task['botId'], 'taskId': taskId}), icon: const Icon(Icons.pause_rounded), label: Text(l10n.pause)),
              if (status == 'paused' && valueText(task['runtimePriority']) == 'USER_PAUSE') OutlinedButton.icon(onPressed: live ? () => _send(context, ref, <String, dynamic>{'action': 'resume-task', 'botId': task['botId'], 'taskId': taskId}) : null, icon: const Icon(Icons.play_arrow_rounded), label: Text(l10n.resume)),
              if (<String>{'running', 'paused'}.contains(status)) OutlinedButton.icon(onPressed: () => _confirmCancel(context, ref, task, l10n), icon: const Icon(Icons.cancel_outlined), label: Text(l10n.cancelTask)),
            ]),
          ),
        ),
        if (!live && <String>{'pending', 'failed', 'interrupted'}.contains(status)) SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.xs, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: Text(l10n.taskNeedsSpawn, style: AppTypography.label.copyWith(color: AppColors.amber)))),
        SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: SectionHeading(l10n.taskHistory, trailing: '${timeline.length}'))),
        if (timeline.isEmpty)
          SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: EmptyState(title: l10n.noActivity, message: l10n.noFakeData, icon: Icons.history_rounded)))
        else
          SliverPadding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0),
            sliver: SliverList.builder(
              itemCount: timeline.length,
              itemBuilder: (BuildContext context, int index) {
                final JsonMap row = timeline[index];
                final bool error = <String>{'FAILED', 'error'}.contains(valueText(row['status']));
                return Padding(padding: const EdgeInsets.only(bottom: AppSpacing.xs), child: GlassPanel(accent: error ? AppColors.red : AppColors.blue, padding: const EdgeInsets.all(AppSpacing.sm), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[Icon(error ? Icons.error_outline_rounded : Icons.bolt_rounded, color: error ? AppColors.red : AppColors.cyan, size: 18), const SizedBox(width: AppSpacing.xs), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[Text(valueText(row['status']), style: AppTypography.micro), Text(valueText(row['message'], fallback: l10n.notAvailable), style: AppTypography.body.copyWith(fontSize: 12))]))])));
              },
            ),
          ),
        SliverPadding(padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom + 92)),
      ],
    );
  }

  Future<void> _send(BuildContext context, WidgetRef ref, JsonMap command) async {
    try {
      await ref.read(mineBotPlatformProvider).sendCommand(command);
      HapticFeedback.selectionClick();
      refreshTable(ref, 'tasks');
      refreshTable(ref, 'task_history');
    } catch (error) {
      if (context.mounted) showFeedback(context, error.toString(), error: true);
    }
  }

  Future<void> _confirmCancel(BuildContext context, WidgetRef ref, JsonMap task, AppLocalizations l10n) async {
    final bool? confirmed = await showDialog<bool>(context: context, builder: (BuildContext context) => AlertDialog(
      title: Text(l10n.cancelTask),
      content: Text(l10n.cancelTaskConfirm),
      actions: <Widget>[
        TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l10n.keepTask)),
        FilledButton.tonal(onPressed: () => Navigator.pop(context, true), child: Text(l10n.cancelTask)),
      ],
    ));
    if (confirmed == true) await _send(context, ref, <String, dynamic>{'action': 'cancel-task', 'botId': task['botId'], 'taskId': taskId});
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[Expanded(child: Text(label, style: AppTypography.label)), const SizedBox(width: AppSpacing.md), Flexible(child: Text(value, textAlign: TextAlign.end, style: AppTypography.body.copyWith(fontWeight: FontWeight.w600)))]));
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
