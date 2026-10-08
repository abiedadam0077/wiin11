import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/data/providers.dart';
import '../../core/data/record_helpers.dart';
import '../../core/theme/app_design_system.dart';
import '../../core/widgets/visuals.dart';
import '../../l10n/generated/app_localizations.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final AsyncValue<List<JsonMap>> botsAsync = ref.watch(recordsProvider('bots'));
    final List<JsonMap> bots = botsAsync.valueOrNull ?? const <JsonMap>[];
    final List<JsonMap> states = ref.watch(recordsProvider('bot_states')).valueOrNull ?? const <JsonMap>[];
    final List<JsonMap> servers = ref.watch(recordsProvider('servers')).valueOrNull ?? const <JsonMap>[];
    final List<JsonMap> tasks = ref.watch(recordsProvider('tasks')).valueOrNull ?? const <JsonMap>[];
    final List<JsonMap> logs = ref.watch(recordsProvider('logs')).valueOrNull ?? const <JsonMap>[];
    final JsonMap? engine = ref.watch(engineStatusProvider).valueOrNull;
    final int online = states.where((JsonMap row) => isFreshSnapshot(row)).length;
    final int active = tasks.where((JsonMap row) => <String>{'running', 'paused', 'inventory_full'}.contains((row['status'] ?? '').toString().toLowerCase())).length;
    final String engineState = (engine?['status'] ?? 'STOPPED').toString();
    final ({String label, Color color, bool pulse}) engineStatus = switch (engineState) {
      'READY' => (label: l10n.engineReady, color: AppColors.green, pulse: true),
      'CONNECTING' => (label: l10n.engineStarting, color: AppColors.cyan, pulse: true),
      'FAILED' => (label: l10n.engineFailed, color: AppColors.red, pulse: false),
      _ => (label: l10n.engineIdle, color: AppColors.textMuted, pulse: false),
    };
    final JsonMap? currentBotState = states.where((JsonMap row) => isFreshSnapshot(row)).cast<JsonMap?>().firstOrNull;
    final JsonMap? currentBot = currentBotState == null
        ? null
        : bots.where((JsonMap row) => row['id'] == currentBotState['botId'] || row['id'] == currentBotState['id']).cast<JsonMap?>().firstOrNull;
    final JsonMap? currentTask = tasks.where((JsonMap row) => <String>{'running', 'paused', 'inventory_full'}.contains((row['status'] ?? '').toString().toLowerCase())).cast<JsonMap?>().firstOrNull;
    final List<JsonMap> recent = List<JsonMap>.from(logs)..sort((JsonMap a, JsonMap b) => timestampMillis(b, 'createdAt').compareTo(timestampMillis(a, 'createdAt')));

    return RefreshIndicator(
      color: AppColors.cyan,
      onRefresh: () async {
        await Future.wait<Object?>(<Future<Object?>>[
          ref.refresh(recordsProvider('bots').future),
          ref.refresh(recordsProvider('bot_states').future),
          ref.refresh(recordsProvider('servers').future),
          ref.refresh(recordsProvider('tasks').future),
          ref.refresh(recordsProvider('logs').future),
          ref.refresh(engineStatusProvider.future),
        ]);
      },
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
        slivers: <Widget>[
          SliverPadding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 8, AppSpacing.page, 0),
            sliver: SliverToBoxAdapter(
              child: Row(
                children: <Widget>[
                  const VoxelMark(size: 42),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(l10n.greeting, style: AppTypography.label),
                        Text(l10n.appName, style: AppTypography.title),
                        Text(l10n.dashboardSubtitle, style: AppTypography.label, maxLines: 1, overflow: TextOverflow.ellipsis),
                      ],
                    ),
                  ),
                  StatusBadge(label: engineStatus.label, color: engineStatus.color, pulse: engineStatus.pulse),
                ],
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0),
            sliver: SliverToBoxAdapter(
              child: GlassPanel(
                accent: engineStatus.color,
                padding: const EdgeInsets.all(AppSpacing.md),
                child: Row(
                  children: <Widget>[
                    Icon(engineStatus.label == l10n.engineReady ? Icons.memory_rounded : Icons.memory_outlined, color: engineStatus.color, size: 22),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text(engineStatus.label, style: AppTypography.title.copyWith(fontSize: 14)),
                          Text((engine?['runtime'] ?? engine?['reason'] ?? l10n.engineIdle).toString(), style: AppTypography.label, maxLines: 1, overflow: TextOverflow.ellipsis),
                        ],
                      ),
                    ),
                    if ((engine?['status'] ?? 'STOPPED') == 'READY') const Icon(Icons.check_circle_rounded, color: AppColors.green, size: 19),
                  ],
                ),
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.sm, AppSpacing.page, 0),
            sliver: SliverGrid.count(
              crossAxisCount: MediaQuery.sizeOf(context).width > 520 ? 4 : 2,
              crossAxisSpacing: AppSpacing.sm,
              mainAxisSpacing: AppSpacing.sm,
              childAspectRatio: MediaQuery.sizeOf(context).width > 520 ? 1.5 : 1.72,
              children: <Widget>[
                MetricTile(label: l10n.onlineBots, value: '$online', icon: Icons.wifi_rounded, accent: AppColors.green),
                MetricTile(label: l10n.botProfiles, value: '${bots.length}', icon: AppIcons.bots, accent: AppColors.purple),
                MetricTile(label: l10n.serverCount, value: '${servers.length}', icon: AppIcons.servers, accent: AppColors.cyan),
                MetricTile(label: l10n.activeTasks, value: '$active', icon: AppIcons.tasks, accent: AppColors.amber),
              ],
            ),
          ),
          SliverPadding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0),
            sliver: SliverToBoxAdapter(child: SectionHeading(l10n.quickActions)),
          ),
          SliverPadding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0),
            sliver: SliverGrid.count(
              crossAxisCount: MediaQuery.sizeOf(context).width > 520 ? 4 : 2,
              crossAxisSpacing: AppSpacing.sm,
              mainAxisSpacing: AppSpacing.sm,
              childAspectRatio: MediaQuery.sizeOf(context).width > 520 ? 2.2 : 2.05,
              children: <Widget>[
                _QuickAction(icon: Icons.smart_toy_outlined, label: l10n.addBot, accent: AppColors.purple, onTap: () => context.go('/bots')),
                _QuickAction(icon: Icons.add_link_rounded, label: l10n.addServer, accent: AppColors.cyan, onTap: () => context.go('/servers')),
                _QuickAction(icon: Icons.add_task_rounded, label: l10n.newTask, accent: AppColors.green, onTap: () => context.go('/tasks/create')),
                _QuickAction(icon: Icons.auto_awesome_rounded, label: l10n.openPlanner, accent: AppColors.blue, onTap: () => context.go('/tasks/planner')),
              ],
            ),
          ),
          if (currentBot != null)
            SliverPadding(
              padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0),
              sliver: SliverToBoxAdapter(
                child: GlassPanel(
                  accent: AppColors.green,
                  onTap: () => context.push('/bots/${currentBot['id']}'),
                  child: Row(
                    children: <Widget>[
                      const Icon(Icons.smart_toy_rounded, color: AppColors.cyan, size: 24),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Text(l10n.currentBot, style: AppTypography.label),
                            Text(valueText(currentBot['name'], fallback: valueText(currentBot['username'])), style: AppTypography.title),
                            Text('${l10n.health} ${finiteNumber(currentBotState?['health'])?.toStringAsFixed(0) ?? '—'} · ${l10n.food} ${finiteNumber(currentBotState?['food'])?.toStringAsFixed(0) ?? '—'}', style: AppTypography.label),
                          ],
                        ),
                      ),
                      const Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
                    ],
                  ),
                ),
              ),
            ),
          if (currentTask != null)
            SliverPadding(
              padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.sm, AppSpacing.page, 0),
              sliver: SliverToBoxAdapter(
                child: GlassPanel(
                  accent: AppColors.blue,
                  onTap: () => context.push('/tasks/${currentTask['id']}'),
                  child: Row(
                    children: <Widget>[
                      const Icon(Icons.route_rounded, color: AppColors.cyan),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
                        Text(valueText(currentTask['name'], fallback: l10n.currentTask), style: AppTypography.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                        if (valueText(currentTask['currentAction']).isNotEmpty) Text(valueText(currentTask['currentAction']), style: AppTypography.micro.copyWith(fontSize: 9, letterSpacing: 0), maxLines: 1, overflow: TextOverflow.ellipsis),
                      ])),
                      Text('${finiteInt(currentTask['progress']) ?? 0}%', style: AppTypography.title.copyWith(color: AppColors.cyan)),
                    ],
                  ),
                ),
              ),
            ),
          SliverPadding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0),
            sliver: SliverToBoxAdapter(child: SectionHeading(l10n.recentActivity, trailing: recent.isEmpty ? null : l10n.viewAll)),
          ),
          if (recent.isEmpty)
            SliverPadding(
              padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0),
              sliver: SliverToBoxAdapter(child: EmptyState(title: l10n.noActivity, message: l10n.noFakeData, icon: Icons.bolt_rounded)),
            )
          else
            SliverPadding(
              padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0),
              sliver: SliverList.builder(
                itemCount: recent.take(4).length,
                itemBuilder: (BuildContext context, int index) => _ActivityTile(row: recent[index]),
              ),
            ),
          SliverPadding(padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom + 92)),
        ],
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({required this.icon, required this.label, required this.accent, required this.onTap});

  final IconData icon;
  final String label;
  final Color accent;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GlassPanel(
        onTap: onTap,
        accent: accent,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.xs),
        child: Row(
          children: <Widget>[
            Icon(icon, color: accent, size: 21),
            const SizedBox(width: AppSpacing.xs),
            Expanded(child: Text(label, style: AppTypography.label.copyWith(color: AppColors.text), maxLines: 2, overflow: TextOverflow.ellipsis)),
            const Icon(Icons.arrow_forward_ios_rounded, color: AppColors.textMuted, size: 12),
          ],
        ),
      );
}

class _ActivityTile extends StatelessWidget {
  const _ActivityTile({required this.row});
  final JsonMap row;

  @override
  Widget build(BuildContext context) {
    final bool error = row['level'] == 'error';
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xs),
      child: GlassPanel(
        accent: error ? AppColors.red : AppColors.blue,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.sm),
        child: Row(
          children: <Widget>[
            Icon(error ? Icons.error_outline_rounded : Icons.bolt_rounded, color: error ? AppColors.red : AppColors.cyan, size: 19),
            const SizedBox(width: AppSpacing.sm),
            Expanded(child: Text(valueText(row['message'], fallback: valueText(row['category'])), style: AppTypography.body.copyWith(fontSize: 12), maxLines: 2, overflow: TextOverflow.ellipsis)),
            const Icon(Icons.chevron_right_rounded, size: 17, color: AppColors.textMuted),
          ],
        ),
      ),
    );
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
