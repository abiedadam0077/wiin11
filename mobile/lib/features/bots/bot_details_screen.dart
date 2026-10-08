import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/data/providers.dart';
import '../../core/data/record_helpers.dart';
import '../../core/theme/app_design_system.dart';
import '../../core/widgets/async_view.dart';
import '../../core/widgets/status_colors.dart';
import '../../core/widgets/visuals.dart';
import '../../core/widgets/voxel_image.dart';
import '../../l10n/generated/app_localizations.dart';
import 'bots_screen.dart' show showBotForm;

class BotDetailsScreen extends ConsumerStatefulWidget {
  const BotDetailsScreen({super.key, required this.botId});
  final String botId;

  @override
  ConsumerState<BotDetailsScreen> createState() => _BotDetailsScreenState();
}

class _BotDetailsScreenState extends ConsumerState<BotDetailsScreen> {
  String _section = 'overview';
  final TextEditingController _chat = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _chat.dispose();
    super.dispose();
  }

  Future<void> _sendChat() async {
    final String text = _chat.text.trim();
    if (text.isEmpty || text.length > 256 || _sending) return;
    setState(() => _sending = true);
    try {
      await ref.read(mineBotPlatformProvider).sendCommand(<String, dynamic>{'action': 'chat', 'botId': widget.botId, 'text': text});
      if (mounted) {
        _chat.clear();
        HapticFeedback.selectionClick();
      }
    } catch (error) {
      if (mounted) showFeedback(context, error.toString(), error: true);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _command(JsonMap command) async {
    try {
      await ref.read(mineBotPlatformProvider).sendCommand(<String, dynamic>{...command, 'botId': widget.botId});
    } catch (error) {
      if (mounted) showFeedback(context, error.toString(), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final AsyncValue<List<JsonMap>> botsAsync = ref.watch(recordsProvider('bots'));
    final List<JsonMap> bots = botsAsync.valueOrNull ?? const <JsonMap>[];
    final JsonMap? bot = bots.where((JsonMap row) => row['id'] == widget.botId).firstOrNull;
    final List<JsonMap> states = ref.watch(recordsProvider('bot_states')).valueOrNull ?? const <JsonMap>[];
    final JsonMap? state = states.where((JsonMap row) => (row['botId'] ?? row['id']) == widget.botId).firstOrNull;
    final List<JsonMap> servers = ref.watch(recordsProvider('servers')).valueOrNull ?? const <JsonMap>[];
    final List<JsonMap> skins = ref.watch(recordsProvider('skins')).valueOrNull ?? const <JsonMap>[];
    final List<JsonMap> tasks = ref.watch(recordsProvider('tasks')).valueOrNull ?? const <JsonMap>[];
    final List<JsonMap> logs = ref.watch(recordsProvider('logs')).valueOrNull ?? const <JsonMap>[];

    if (bot == null) {
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.page),
          child: asyncContent(
            context,
            botsAsync,
            data: (_) => EmptyState(title: l10n.noBots, message: l10n.notAvailable, action: NeonButton(label: l10n.navBots, expanded: false, onPressed: () => context.go('/bots'))),
            onRetry: () => ref.invalidate(recordsProvider('bots')),
          ),
        ),
      );
    }

    final JsonMap? server = servers.where((JsonMap row) => row['id'] == bot['serverId']).firstOrNull;
    final JsonMap? skin = skins.where((JsonMap row) => row['id'] == bot['skinId']).firstOrNull;
    final String statusKey = liveBotStatus(state);
    final ({String label, Color color, bool pulse}) badge = statusPresentation(l10n, statusKey);
    final bool live = isFreshSnapshot(state);
    final List<JsonMap> associatedTasks = tasks.where((JsonMap task) => task['botId'] == widget.botId).toList(growable: false);
    final List<JsonMap> associatedLogs = logs.where((JsonMap log) => log['botId'] == widget.botId).toList(growable: false);
    final JsonMap config = bot;

    return CustomScrollView(
      physics: const BouncingScrollPhysics(),
      slivers: <Widget>[
        SliverPadding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 10, AppSpacing.page, 0),
          sliver: SliverToBoxAdapter(
            child: ScreenHeader(
              title: valueText(bot['name'], fallback: valueText(bot['username'], fallback: l10n.botsTitle)),
              subtitle: valueText(server?['name'], fallback: l10n.notAvailable),
              leading: IconButton.filledTonal(onPressed: () => context.pop(), icon: const Icon(Icons.arrow_back_rounded)),
              trailing: StatusBadge(label: badge.label, color: badge.color, pulse: badge.pulse),
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0),
          sliver: SliverToBoxAdapter(
            child: GlassPanel(
              accent: badge.color,
              child: Row(
                children: <Widget>[
                  VoxelImage(path: valueText(skin?['filePath'], fallback: '').isEmpty ? null : valueText(skin?['filePath']), size: 62),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
                      Text(valueText(bot['username'], fallback: l10n.notAvailable), style: AppTypography.title),
                      Text(server == null ? l10n.notAvailable : '${server['host']}:${server['port'] ?? 25565}', style: AppTypography.label, maxLines: 1, overflow: TextOverflow.ellipsis),
                      Text('${valueText(config['authMode'], fallback: 'offline').toUpperCase()} · ${valueText(config['version'], fallback: 'auto')}', style: AppTypography.micro),
                    ]),
                  ),
                  PopupMenuButton<String>(
                    tooltip: l10n.more,
                    onSelected: (String value) {
                      if (value == 'edit') showBotForm(context, ref, servers, existing: bot);
                      if (value == 'reconnect') ref.read(mineBotPlatformProvider).reconnectBot(widget.botId).catchError((Object error) { if (mounted) showFeedback(context, error.toString(), error: true); });
                    },
                    itemBuilder: (BuildContext context) => <PopupMenuEntry<String>>[
                      PopupMenuItem<String>(value: 'edit', child: Text(l10n.edit)),
                      if (<String>{'DISCONNECTED', 'FAILED'}.contains(statusKey)) PopupMenuItem<String>(value: 'reconnect', child: Text(l10n.reconnect)),
                    ],
                    icon: const Icon(Icons.more_vert_rounded),
                  ),
                ],
              ),
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.sm, AppSpacing.page, 0),
          sliver: SliverToBoxAdapter(
            child: SizedBox(
              height: 46,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: <Widget>[
                  _SectionChip(label: l10n.botOverview, selected: _section == 'overview', onTap: () => setState(() => _section = 'overview')),
                  _SectionChip(label: l10n.inventory, selected: _section == 'inventory', onTap: () => context.push('/bots/${widget.botId}/inventory')),
                  _SectionChip(label: l10n.botTasks, selected: _section == 'tasks', onTap: () => setState(() => _section = 'tasks')),
                  _SectionChip(label: l10n.skin, selected: _section == 'skin', onTap: () => setState(() => _section = 'skin')),
                  _SectionChip(label: l10n.logs, selected: _section == 'logs', onTap: () => setState(() => _section = 'logs')),
                  _SectionChip(label: l10n.botSettings, selected: _section == 'settings', onTap: () => setState(() => _section = 'settings')),
                ],
              ),
            ),
          ),
        ),
        if (_section == 'overview') ..._overview(l10n, state, live, associatedTasks)
        else if (_section == 'tasks') ..._tasks(l10n, associatedTasks)
        else if (_section == 'skin') ..._skin(l10n, skin)
        else if (_section == 'logs') ..._logs(l10n, associatedLogs)
        else if (_section == 'settings') ..._settings(l10n, bot, server)
        else ...<Widget>[
          SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: EmptyState(title: l10n.inventory, message: l10n.inventoryReadOnly))),
        ],
        SliverPadding(padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom + 92)),
      ],
    );
  }

  List<Widget> _overview(AppLocalizations l10n, JsonMap? state, bool live, List<JsonMap> tasks) {
    if (!live) {
      return <Widget>[
        SliverPadding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0),
          sliver: SliverToBoxAdapter(child: EmptyState(title: l10n.noLiveSnapshot, message: l10n.snapshotOnly, icon: Icons.sensors_off_rounded)),
        ),
        SliverPadding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0),
          sliver: SliverToBoxAdapter(child: _ConnectionActions(l10n: l10n, status: liveBotStatus(state), onStart: () => _startBot(), onStop: () => _stopBot())),
        ),
      ];
    }
    final JsonMap currentTask = asJsonMap(state?['currentTask']);
    final JsonMap lookTarget = asJsonMap(state?['lookTarget']);
    return <Widget>[
      SliverPadding(
        padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0),
        sliver: SliverToBoxAdapter(child: Row(children: <Widget>[
          Expanded(child: MetricTile(label: l10n.health, value: finiteNumber(state?['health'])?.toStringAsFixed(0) ?? '—', icon: Icons.favorite_rounded, accent: AppColors.red)),
          const SizedBox(width: AppSpacing.xs),
          Expanded(child: MetricTile(label: l10n.food, value: finiteNumber(state?['food'])?.toStringAsFixed(0) ?? '—', icon: Icons.restaurant_rounded, accent: AppColors.amber)),
        ])),
      ),
      SliverPadding(
        padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.xs, AppSpacing.page, 0),
        sliver: SliverToBoxAdapter(child: Row(children: <Widget>[
          Expanded(child: MetricTile(label: l10n.ping, value: finiteInt(state?['pingMs']) == null ? '—' : '${state!['pingMs']}ms', icon: Icons.network_ping_rounded, accent: AppColors.cyan)),
          const SizedBox(width: AppSpacing.xs),
          Expanded(child: MetricTile(label: l10n.uptime, value: formatDuration(state?['uptimeMs']), icon: Icons.timer_outlined, accent: AppColors.purple)),
        ])),
      ),
      SliverPadding(
        padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0),
        sliver: SliverToBoxAdapter(
          child: GlassPanel(
            accent: AppColors.blue,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
              SectionHeading(l10n.position),
              Text(formatPosition(state?['position']), style: AppTypography.title.copyWith(color: AppColors.cyan)),
              const SizedBox(height: AppSpacing.sm),
              Wrap(spacing: AppSpacing.xs, runSpacing: AppSpacing.xs, children: <Widget>[
                _InfoPill(label: l10n.dimension, value: valueText(state?['dimension'], fallback: l10n.notAvailable)),
                _InfoPill(label: l10n.gameMode, value: valueText(state?['gameMode'], fallback: l10n.notAvailable)),
                if (finiteNumber(state?['saturation']) != null) _InfoPill(label: l10n.saturation, value: finiteNumber(state?['saturation'])!.toStringAsFixed(1)),
                if (finiteNumber(state?['oxygen']) != null) _InfoPill(label: l10n.oxygen, value: '${state!['oxygen']}'),
              ]),
              const SizedBox(height: AppSpacing.md),
              Text(l10n.currentLookTarget, style: AppTypography.micro),
              Text(lookTarget.isEmpty ? l10n.noLookTarget : '${valueText(lookTarget['name'])} · ${formatPosition(lookTarget['position'])}', style: AppTypography.label.copyWith(color: AppColors.cyan)),
              const SizedBox(height: AppSpacing.md),
              Text(l10n.liveViewUnavailable, style: AppTypography.label.copyWith(color: AppColors.amber, height: 1.45)),
              if (currentTask.isNotEmpty) ...<Widget>[
                const SizedBox(height: AppSpacing.md),
                Text(l10n.currentTask, style: AppTypography.micro),
                Text('${currentTask['blockName'] ?? ''} · ${currentTask['verifiedCollected'] ?? 0}/${currentTask['count'] ?? 0}', style: AppTypography.body),
              ],
            ]),
          ),
        ),
      ),
      SliverPadding(
        padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0),
        sliver: SliverToBoxAdapter(child: _ConnectionActions(l10n: l10n, status: 'ONLINE', onStart: () {}, onStop: () => _stopBot(), onStopNavigation: () => _command(<String, dynamic>{'action': 'stop-navigation'}), onRespawn: () => _command(<String, dynamic>{'action': 'respawn'}))),
      ),
      SliverPadding(
        padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0),
        sliver: SliverToBoxAdapter(child: _ChatComposer(controller: _chat, onSend: _sendChat, sending: _sending, l10n: l10n)),
      ),
      if (tasks.isNotEmpty)
        SliverPadding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0),
          sliver: SliverToBoxAdapter(child: SectionHeading(l10n.botTasks, trailing: '${tasks.length}')),
        ),
      if (tasks.isNotEmpty)
        SliverPadding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0),
          sliver: SliverList.builder(itemCount: tasks.take(3).length, itemBuilder: (BuildContext context, int index) => _TaskPreview(task: tasks[index], l10n: l10n)),
        ),
    ];
  }

  List<Widget> _tasks(AppLocalizations l10n, List<JsonMap> tasks) => <Widget>[
        SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: SectionHeading(l10n.botTasks, trailing: '${tasks.length}'))),
        if (tasks.isEmpty)
          SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: EmptyState(title: l10n.noTasks, message: l10n.taskSubtitle)))
        else
          SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0), sliver: SliverList.builder(itemCount: tasks.length, itemBuilder: (BuildContext context, int index) => _TaskPreview(task: tasks[index], l10n: l10n))),
        SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.sm, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: NeonButton(label: l10n.createTask, icon: Icons.add_task_rounded, onPressed: () => context.go('/tasks/create')))),
      ];

  List<Widget> _skin(AppLocalizations l10n, JsonMap? skin) => <Widget>[
        SliverPadding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0),
          sliver: SliverToBoxAdapter(
            child: GlassPanel(
              accent: AppColors.purple,
              child: Column(children: <Widget>[
                Text(l10n.supportOnlyLocal, style: AppTypography.label.copyWith(height: 1.4)),
                const SizedBox(height: AppSpacing.sm),
                VoxelImage(path: valueText(skin?['filePath']).isEmpty ? null : valueText(skin?['filePath']), size: 176),
                const SizedBox(height: AppSpacing.sm),
                Text(valueText(skin?['name'], fallback: l10n.noSkins), style: AppTypography.title),
                const SizedBox(height: AppSpacing.sm),
                NeonButton(label: l10n.savedSkins, icon: Icons.face_retouching_natural_rounded, onPressed: () => context.push('/settings/skins')),
              ]),
            ),
          ),
        ),
      ];

  List<Widget> _logs(AppLocalizations l10n, List<JsonMap> logs) => <Widget>[
        SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: SectionHeading(l10n.logs, trailing: '${logs.length}'))),
        if (logs.isEmpty)
          SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: EmptyState(title: l10n.noActivity, message: l10n.noFakeData)))
        else
          SliverPadding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0),
            sliver: SliverList.builder(
              itemCount: logs.take(60).length,
              itemBuilder: (BuildContext context, int index) {
                final JsonMap item = logs[index];
                return Padding(padding: const EdgeInsets.only(bottom: AppSpacing.xs), child: GlassPanel(accent: item['level'] == 'error' ? AppColors.red : AppColors.blue, child: Text(valueText(item['message'], fallback: valueText(item['category'])), style: AppTypography.body)));
              },
            ),
          ),
      ];

  List<Widget> _settings(AppLocalizations l10n, JsonMap bot, JsonMap? server) => <Widget>[
        SliverPadding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0),
          sliver: SliverToBoxAdapter(
            child: GlassPanel(
              accent: AppColors.cyan,
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
                _SettingLine(label: l10n.authMode, value: valueText(bot['authMode'], fallback: 'offline')),
                _SettingLine(label: l10n.gameVersion, value: valueText(bot['version'], fallback: 'auto')),
                _SettingLine(label: l10n.server, value: valueText(server?['name'], fallback: l10n.notAvailable)),
                _SettingLine(label: l10n.autoReconnect, value: bot['reconnect'] == false ? l10n.offline : l10n.online),
                _SettingLine(label: l10n.autoEat, value: bot['autoEat'] == false ? l10n.offline : l10n.online),
                _SettingLine(label: l10n.autoRespawn, value: bot['autoRespawn'] == true ? l10n.online : l10n.offline),
                const SizedBox(height: AppSpacing.sm),
                NeonButton(label: l10n.edit, icon: Icons.edit_rounded, onPressed: () => showBotForm(context, ref, ref.read(recordsProvider('servers')).valueOrNull ?? const <JsonMap>[], existing: bot)),
              ]),
            ),
          ),
        ),
      ];

  Future<void> _startBot() async {
    try {
      await ref.read(mineBotPlatformProvider).connectBot(widget.botId);
      ref.invalidate(engineStatusProvider);
    } catch (error) {
      if (mounted) showFeedback(context, error.toString(), error: true);
    }
  }

  Future<void> _stopBot() async {
    try {
      await ref.read(mineBotPlatformProvider).disconnectBot(widget.botId);
    } catch (error) {
      if (mounted) showFeedback(context, error.toString(), error: true);
    }
  }
}

class _SectionChip extends StatelessWidget {
  const _SectionChip({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(padding: const EdgeInsetsDirectional.only(end: AppSpacing.xs), child: ChoiceChip(label: Text(label), selected: selected, onSelected: (_) => onTap()));
}

class _InfoPill extends StatelessWidget {
  const _InfoPill({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7), decoration: BoxDecoration(color: AppColors.backgroundRaised, borderRadius: BorderRadius.circular(AppRadius.pill), border: Border.all(color: AppColors.outline)), child: Text('$label · $value', style: AppTypography.label.copyWith(color: AppColors.text), maxLines: 1, overflow: TextOverflow.ellipsis));
}

class _ConnectionActions extends StatelessWidget {
  const _ConnectionActions({required this.l10n, required this.status, required this.onStart, required this.onStop, this.onStopNavigation, this.onRespawn});
  final AppLocalizations l10n;
  final String status;
  final VoidCallback onStart;
  final VoidCallback onStop;
  final VoidCallback? onStopNavigation;
  final VoidCallback? onRespawn;

  @override
  Widget build(BuildContext context) {
    final bool inProgress = <String>{'CONNECTING', 'AUTHENTICATING', 'JOINING', 'RECONNECTING'}.contains(status);
    final bool connected = status == 'ONLINE';
    final bool stale = status == 'STALE';
    final bool dead = status == 'DEAD';
    return GlassPanel(
      accent: AppColors.cyan,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: <Widget>[
        if (connected) ...<Widget>[
          NeonButton(label: l10n.stopNavigation, icon: Icons.stop_circle_outlined, secondary: true, onPressed: onStopNavigation),
          const SizedBox(height: AppSpacing.xs),
          NeonButton(label: l10n.stop, icon: Icons.power_settings_new_rounded, secondary: true, onPressed: onStop),
        ] else if (dead && onRespawn != null)
          NeonButton(label: l10n.requestRespawn, icon: Icons.restart_alt_rounded, onPressed: onRespawn)
        else if (stale || inProgress)
          NeonButton(label: stale ? l10n.stale : l10n.stop, icon: Icons.stop_rounded, secondary: true, onPressed: onStop)
        else
          NeonButton(label: l10n.start, icon: Icons.play_arrow_rounded, onPressed: onStart),
      ]),
    );
  }
}

class _ChatComposer extends StatelessWidget {
  const _ChatComposer({required this.controller, required this.onSend, required this.sending, required this.l10n});
  final TextEditingController controller;
  final VoidCallback onSend;
  final bool sending;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) => GlassPanel(
        accent: AppColors.purple,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
          Text(l10n.sendChat, style: AppTypography.title),
          const SizedBox(height: AppSpacing.xs),
          TextField(controller: controller, maxLength: 256, textInputAction: TextInputAction.send, onSubmitted: (_) => onSend(), decoration: InputDecoration(hintText: l10n.message, counterText: '')),
          const SizedBox(height: AppSpacing.xs),
          NeonButton(label: l10n.send, icon: Icons.send_rounded, loading: sending, onPressed: sending ? null : onSend),
        ]),
      );
}

class _TaskPreview extends StatelessWidget {
  const _TaskPreview({required this.task, required this.l10n});
  final JsonMap task;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final int progress = (finiteInt(task['progress']) ?? 0).clamp(0, 100).toInt();
    final String status = valueText(task['status'], fallback: 'pending');
    final Color color = switch (status.toLowerCase()) {
      'running' => AppColors.blue,
      'completed' => AppColors.green,
      'failed' || 'cancelled' => AppColors.red,
      'paused' => AppColors.amber,
      _ => AppColors.purple,
    };
    return Padding(padding: const EdgeInsets.only(bottom: AppSpacing.xs), child: GlassPanel(accent: color, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[Row(children: <Widget>[Expanded(child: Text(valueText(task['name'], fallback: l10n.taskName), style: AppTypography.title)), StatusBadge(label: status, color: color)]), const SizedBox(height: AppSpacing.xs), Text('${task['verifiedCollected'] ?? 0}/${task['count'] ?? 0} · ${task['blockName'] ?? ''}', style: AppTypography.label), const SizedBox(height: AppSpacing.xs), LinearProgressIndicator(value: progress / 100, color: color, backgroundColor: AppColors.surfaceRaised)])));
  }
}

class _SettingLine extends StatelessWidget {
  const _SettingLine({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs), child: Row(children: <Widget>[Expanded(child: Text(label, style: AppTypography.label)), Text(value, style: AppTypography.body.copyWith(color: AppColors.cyan))]));
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
