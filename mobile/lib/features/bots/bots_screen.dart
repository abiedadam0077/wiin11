import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/data/providers.dart';
import '../../core/data/record_helpers.dart';
import '../../core/theme/app_design_system.dart';
import '../../core/widgets/async_view.dart';
import '../../core/widgets/search_field.dart';
import '../../core/widgets/status_colors.dart';
import '../../core/widgets/visuals.dart';
import '../../core/widgets/voxel_image.dart';
import '../../l10n/generated/app_localizations.dart';

class BotsScreen extends ConsumerStatefulWidget {
  const BotsScreen({super.key});

  @override
  ConsumerState<BotsScreen> createState() => _BotsScreenState();
}

class _BotsScreenState extends ConsumerState<BotsScreen> {
  final TextEditingController _search = TextEditingController();
  String _filter = 'all';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final AsyncValue<List<JsonMap>> botsAsync = ref.watch(recordsProvider('bots'));
    final List<JsonMap> bots = botsAsync.valueOrNull ?? const <JsonMap>[];
    final List<JsonMap> states = ref.watch(recordsProvider('bot_states')).valueOrNull ?? const <JsonMap>[];
    final List<JsonMap> servers = ref.watch(recordsProvider('servers')).valueOrNull ?? const <JsonMap>[];
    final List<JsonMap> skins = ref.watch(recordsProvider('skins')).valueOrNull ?? const <JsonMap>[];
    final Map<String, JsonMap> stateById = <String, JsonMap>{for (final JsonMap row in states) valueText(row['botId'] ?? row['id']): row};
    final List<JsonMap> visible = bots.where((JsonMap bot) {
      final JsonMap? state = stateById[valueText(bot['id'])];
      final String status = liveBotStatus(state);
      final bool filterMatches = switch (_filter) {
        'online' => status == 'ONLINE',
        'offline' => status == 'DISCONNECTED',
        'connecting' => <String>{'CONNECTING', 'AUTHENTICATING', 'JOINING'}.contains(status),
        'attention' => <String>{'FAILED', 'DEAD', 'RECONNECTING', 'STALE'}.contains(status),
        _ => true,
      };
      final String query = _search.text.trim().toLowerCase();
      final bool queryMatches = query.isEmpty || '${bot['name'] ?? ''} ${bot['username'] ?? ''}'.toLowerCase().contains(query);
      return filterMatches && queryMatches;
    }).toList(growable: false);
    final List<_FilterChoice> filters = <_FilterChoice>[
      _FilterChoice('all', l10n.filterAll),
      _FilterChoice('online', l10n.filterInWorld),
      _FilterChoice('offline', l10n.filterOffline),
      _FilterChoice('connecting', l10n.filterConnecting),
      _FilterChoice('attention', l10n.filterAttention),
    ];

    return RefreshIndicator(
      color: AppColors.cyan,
      onRefresh: () async {
        await Future.wait<Object?>(<Future<Object?>>[
          ref.refresh(recordsProvider('bots').future),
          ref.refresh(recordsProvider('bot_states').future),
          ref.refresh(recordsProvider('servers').future),
        ]);
      },
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
        slivers: <Widget>[
          SliverPadding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 10, AppSpacing.page, 0),
            sliver: SliverToBoxAdapter(
              child: ScreenHeader(
                title: l10n.botsTitle,
                subtitle: l10n.manageBots,
                trailing: IconButton.filledTonal(
                  tooltip: l10n.addBot,
                  onPressed: () => showBotForm(context, ref, servers),
                  icon: const Icon(Icons.add_rounded),
                ),
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0),
            sliver: SliverToBoxAdapter(child: SearchField(controller: _search, hint: l10n.searchBots, onChanged: (_) => setState(() {}))),
          ),
          SliverToBoxAdapter(
            child: SizedBox(
              height: 52,
              child: ListView.separated(
                padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.xs, AppSpacing.page, AppSpacing.xs),
                scrollDirection: Axis.horizontal,
                itemCount: filters.length,
                separatorBuilder: (_, __) => const SizedBox(width: AppSpacing.xs),
                itemBuilder: (BuildContext context, int index) {
                  final _FilterChoice item = filters[index];
                  final bool selected = _filter == item.key;
                  return FilterChip(
                    label: Text(item.label),
                    selected: selected,
                    showCheckmark: false,
                    onSelected: (_) => setState(() => _filter = item.key),
                  );
                },
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0),
            sliver: SliverToBoxAdapter(
              child: Row(
                children: <Widget>[
                  Text(l10n.botProfiles, style: AppTypography.label),
                  const Spacer(),
                  Text('${visible.length}', style: AppTypography.label.copyWith(color: AppColors.cyan)),
                ],
              ),
            ),
          ),
          if (botsAsync.isLoading && bots.isEmpty)
            const SliverFillRemaining(hasScrollBody: false, child: LoadingState())
          else if (botsAsync.hasError)
            SliverPadding(
              padding: const EdgeInsets.all(AppSpacing.page),
              sliver: SliverToBoxAdapter(child: asyncContent(context, botsAsync, data: (_) => const SizedBox.shrink(), onRetry: () => ref.invalidate(recordsProvider('bots')))),
            )
          else if (visible.isEmpty)
            SliverPadding(
              padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0),
              sliver: SliverToBoxAdapter(
                child: EmptyState(
                  title: bots.isEmpty ? l10n.noBots : l10n.noBotsFiltered,
                  message: bots.isEmpty ? l10n.createFirstBot : l10n.noBotsFiltered,
                  icon: Icons.smart_toy_outlined,
                  action: bots.isEmpty
                      ? NeonButton(label: l10n.addBot, icon: Icons.add_rounded, expanded: false, onPressed: () => showBotForm(context, ref, servers))
                      : null,
                ),
              ),
            )
          else
            SliverPadding(
              padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.xs, AppSpacing.page, 0),
              sliver: SliverList.builder(
                itemCount: visible.length,
                itemBuilder: (BuildContext context, int index) {
                  final JsonMap bot = visible[index];
                  final JsonMap? state = stateById[valueText(bot['id'])];
                  final JsonMap? server = servers.where((JsonMap row) => row['id'] == bot['serverId']).firstOrNull;
                  final JsonMap? skin = skins.where((JsonMap row) => row['id'] == bot['skinId']).firstOrNull;
                  return Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                    child: BotProfileCard(
                      bot: bot,
                      state: state,
                      server: server,
                      skin: skin,
                      onOpen: () => context.push('/bots/${bot['id']}'),
                      onStart: () => _connect(context, ref, bot),
                      onStop: () => _stop(context, ref, bot),
                      onReconnect: () => _reconnect(context, ref, bot),
                      onEdit: () => showBotForm(context, ref, servers, existing: bot),
                      onDelete: () => _delete(context, ref, bot, state, tasks: ref.read(recordsProvider('tasks')).valueOrNull ?? const <JsonMap>[]),
                    ),
                  );
                },
              ),
            ),
          SliverPadding(padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom + 94)),
        ],
      ),
    );
  }

  Future<void> _connect(BuildContext context, WidgetRef ref, JsonMap bot) async {
    try {
      await ref.read(mineBotPlatformProvider).connectBot(valueText(bot['id']));
      showFeedback(context, AppLocalizations.of(context).engineStarting);
      ref.invalidate(engineStatusProvider);
    } catch (error) {
      if (context.mounted) showFeedback(context, error.toString(), error: true);
    }
  }

  Future<void> _stop(BuildContext context, WidgetRef ref, JsonMap bot) async {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final bool? confirm = await showDialog<bool>(
      context: context,
      builder: (BuildContext context) => AlertDialog(
        icon: const Icon(Icons.power_settings_new_rounded, color: AppColors.amber),
        title: Text(l10n.stopBotTitle),
        content: Text(l10n.stopBotBody),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l10n.cancel)),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(l10n.stop)),
        ],
      ),
    );
    if (confirm != true) return;
    try {
      await ref.read(mineBotPlatformProvider).disconnectBot(valueText(bot['id']));
      if (context.mounted) showFeedback(context, l10n.stop);
    } catch (error) {
      if (context.mounted) showFeedback(context, error.toString(), error: true);
    }
  }

  Future<void> _reconnect(BuildContext context, WidgetRef ref, JsonMap bot) async {
    try {
      await ref.read(mineBotPlatformProvider).reconnectBot(valueText(bot['id']));
      if (context.mounted) showFeedback(context, AppLocalizations.of(context).engineStarting);
    } catch (error) {
      if (context.mounted) showFeedback(context, error.toString(), error: true);
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, JsonMap bot, JsonMap? state, {required List<JsonMap> tasks}) async {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final String status = liveBotStatus(state);
    if (<String>{'ONLINE', 'STALE', 'CONNECTING', 'AUTHENTICATING', 'JOINING', 'RECONNECTING', 'DEAD'}.contains(status)) {
      showFeedback(context, l10n.stopBotBody, error: true);
      return;
    }
    final bool? confirm = await showDialog<bool>(
      context: context,
      builder: (BuildContext context) => AlertDialog(
        title: Text(l10n.deleteBotTitle),
        content: Text(l10n.deleteBotBody),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l10n.cancel)),
          FilledButton.tonal(onPressed: () => Navigator.pop(context, true), child: Text(l10n.delete)),
        ],
      ),
    );
    if (confirm != true) return;
    try {
      final platform = ref.read(mineBotPlatformProvider);
      for (final JsonMap task in tasks.where((JsonMap task) => task['botId'] == bot['id'] && !isTerminalTask((task['status'] ?? '').toString()))) {
        final JsonMap updated = Map<String, dynamic>.from(task)..['botId'] = '';
        await platform.upsert('tasks', updated);
      }
      await platform.remove('bots', valueText(bot['id']));
      await platform.remove('bot_states', valueText(bot['id']));
      refreshBotData(ref);
      if (context.mounted) showFeedback(context, l10n.delete);
    } catch (error) {
      if (context.mounted) showFeedback(context, error.toString(), error: true);
    }
  }
}

class BotProfileCard extends StatelessWidget {
  const BotProfileCard({
    super.key,
    required this.bot,
    required this.state,
    required this.server,
    required this.skin,
    required this.onOpen,
    required this.onStart,
    required this.onStop,
    required this.onReconnect,
    required this.onEdit,
    required this.onDelete,
  });

  final JsonMap bot;
  final JsonMap? state;
  final JsonMap? server;
  final JsonMap? skin;
  final VoidCallback onOpen;
  final VoidCallback onStart;
  final VoidCallback onStop;
  final VoidCallback onReconnect;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final String status = liveBotStatus(state);
    final ({String label, Color color, bool pulse}) appearance = statusPresentation(l10n, status);
    final bool live = isFreshSnapshot(state);
    final JsonMap? currentServer = server;
    final String serverText = currentServer == null ? l10n.notAvailable : '${currentServer['name'] ?? ''} · ${currentServer['host'] ?? ''}:${currentServer['port'] ?? 25565}';
    final String skinPath = valueText(skin?['filePath']);
    final int? ping = live ? finiteInt(state?['pingMs']) : null;
    return GlassPanel(
      accent: appearance.color,
      padding: const EdgeInsets.all(AppSpacing.sm),
      onTap: onOpen,
      child: Column(
        children: <Widget>[
          Row(
            children: <Widget>[
              VoxelImage(path: skinPath.isEmpty ? null : skinPath, size: 58),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Row(
                      children: <Widget>[
                        Expanded(child: Text(valueText(bot['name'], fallback: valueText(bot['username'], fallback: l10n.botsTitle)), style: AppTypography.title, maxLines: 1, overflow: TextOverflow.ellipsis)),
                        StatusBadge(label: appearance.label, color: appearance.color, pulse: appearance.pulse),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(valueText(bot['username'], fallback: l10n.notAvailable), style: AppTypography.label, maxLines: 1, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 3),
                    Row(
                      children: <Widget>[
                        const Icon(Icons.dns_outlined, color: AppColors.textMuted, size: 13),
                        const SizedBox(width: 4),
                        Expanded(child: Text(serverText, style: AppTypography.label.copyWith(fontSize: 10), maxLines: 1, overflow: TextOverflow.ellipsis)),
                      ],
                    ),
                  ],
                ),
              ),
              PopupMenuButton<String>(
                tooltip: l10n.more,
                onSelected: (String action) {
                  switch (action) {
                    case 'edit':
                      onEdit();
                      break;
                    case 'reconnect':
                      onReconnect();
                      break;
                    case 'delete':
                      onDelete();
                      break;
                  }
                },
                itemBuilder: (BuildContext context) => <PopupMenuEntry<String>>[
                  PopupMenuItem<String>(value: 'edit', child: Text(l10n.edit)),
                  if (<String>{'DISCONNECTED', 'FAILED'}.contains(status)) PopupMenuItem<String>(value: 'reconnect', child: Text(l10n.reconnect)),
                  PopupMenuItem<String>(value: 'delete', child: Text(l10n.delete)),
                ],
                icon: const Icon(Icons.more_vert_rounded, color: AppColors.textMuted),
              ),
            ],
          ),
          if (live) ...<Widget>[
            const SizedBox(height: AppSpacing.sm),
            Row(
              children: <Widget>[
                _Vital(label: l10n.health, value: finiteNumber(state?['health'])?.toStringAsFixed(0) ?? '—', color: AppColors.red, icon: Icons.favorite_rounded),
                const SizedBox(width: AppSpacing.xs),
                _Vital(label: l10n.food, value: finiteNumber(state?['food'])?.toStringAsFixed(0) ?? '—', color: AppColors.amber, icon: Icons.restaurant_rounded),
                const SizedBox(width: AppSpacing.xs),
                _Vital(label: l10n.ping, value: ping == null ? '—' : '${ping}ms', color: AppColors.cyan, icon: Icons.network_ping_rounded),
                const SizedBox(width: AppSpacing.xs),
                _Vital(label: l10n.uptime, value: formatDuration(state?['uptimeMs']), color: AppColors.purple, icon: Icons.timer_outlined),
              ],
            ),
            if (asJsonMap(state?['currentTask']).isNotEmpty) ...<Widget>[
              const SizedBox(height: AppSpacing.xs),
              Align(alignment: AlignmentDirectional.centerStart, child: Text('${l10n.currentTask}: ${asJsonMap(state?['currentTask'])['blockName'] ?? ''}', style: AppTypography.label, maxLines: 1, overflow: TextOverflow.ellipsis)),
            ],
          ],
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: <Widget>[
              Expanded(
                child: NeonButton(
                  label: <String>{'ONLINE', 'STALE', 'CONNECTING', 'AUTHENTICATING', 'JOINING', 'RECONNECTING', 'DEAD'}.contains(status) ? (status == 'DEAD' ? l10n.details : l10n.stop) : l10n.start,
                  icon: <String>{'ONLINE', 'STALE', 'CONNECTING', 'AUTHENTICATING', 'JOINING', 'RECONNECTING'}.contains(status) ? Icons.stop_rounded : status == 'DEAD' ? Icons.info_outline_rounded : Icons.play_arrow_rounded,
                  secondary: <String>{'ONLINE', 'STALE', 'CONNECTING', 'AUTHENTICATING', 'JOINING', 'RECONNECTING', 'DEAD'}.contains(status),
                  onPressed: status == 'DEAD' ? onOpen : <String>{'ONLINE', 'STALE', 'CONNECTING', 'AUTHENTICATING', 'JOINING', 'RECONNECTING'}.contains(status) ? onStop : onStart,
                ),
              ),
              const SizedBox(width: AppSpacing.xs),
              IconButton.filledTonal(
                tooltip: l10n.details,
                onPressed: onOpen,
                icon: const Icon(Icons.arrow_forward_rounded),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Vital extends StatelessWidget {
  const _Vital({required this.label, required this.value, required this.color, required this.icon});
  final String label;
  final String value;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Container(
          constraints: const BoxConstraints(minHeight: 52),
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
          decoration: BoxDecoration(color: AppColors.backgroundRaised.withValues(alpha: .72), borderRadius: BorderRadius.circular(AppRadius.sm)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: <Widget>[
              Row(children: <Widget>[Icon(icon, size: 12, color: color), const SizedBox(width: 3), Flexible(child: Text(label, style: AppTypography.micro.copyWith(fontSize: 8, letterSpacing: 0), maxLines: 1, overflow: TextOverflow.ellipsis))]),
              const SizedBox(height: 3),
              Text(value, style: AppTypography.title.copyWith(color: color, fontSize: 12), maxLines: 1, overflow: TextOverflow.ellipsis),
            ],
          ),
        ),
      );
}

class _FilterChoice {
  const _FilterChoice(this.key, this.label);
  final String key;
  final String label;
}

Future<void> showBotForm(BuildContext context, WidgetRef ref, List<JsonMap> servers, {JsonMap? existing}) async {
  if (servers.isEmpty) {
    showFeedback(context, AppLocalizations.of(context).selectServer, error: true);
    context.go('/servers');
    return;
  }
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (BuildContext context) => _BotFormSheet(servers: servers, existing: existing),
  );
  refreshBotData(ref);
}

class _BotFormSheet extends ConsumerStatefulWidget {
  const _BotFormSheet({required this.servers, this.existing});

  final List<JsonMap> servers;
  final JsonMap? existing;

  @override
  ConsumerState<_BotFormSheet> createState() => _BotFormSheetState();
}

class _BotFormSheetState extends ConsumerState<_BotFormSheet> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  late final TextEditingController _name = TextEditingController(text: valueText(widget.existing?['name']));
  late final TextEditingController _username = TextEditingController(text: valueText(widget.existing?['username']));
  late final TextEditingController _version = TextEditingController(text: valueText(widget.existing?['version'], fallback: 'auto'));
  late String _serverId = valueText(widget.existing?['serverId'], fallback: valueText(widget.servers.first['id']));
  late String _auth = valueText(widget.existing?['authMode'], fallback: 'offline');
  late bool _reconnect = widget.existing?['reconnect'] != false;
  late bool _autoEat = widget.existing?['autoEat'] != false;
  late bool _autoRespawn = widget.existing?['autoRespawn'] == true;
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    _username.dispose();
    _version.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    final String id = valueText(widget.existing?['id'], fallback: 'bot-${DateTime.now().microsecondsSinceEpoch}');
    final JsonMap record = <String, dynamic>{
      ...?widget.existing,
      'id': id,
      'name': _name.text.trim(),
      'username': _username.text.trim(),
      'serverId': _serverId,
      'version': _version.text.trim().isEmpty ? 'auto' : _version.text.trim(),
      'authMode': _auth,
      'reconnect': _reconnect,
      'autoEat': _autoEat,
      'autoRespawn': _autoRespawn,
      'status': valueText(widget.existing?['status'], fallback: 'configured'),
      'createdAt': widget.existing?['createdAt'] ?? DateTime.now().millisecondsSinceEpoch,
      'updatedAt': DateTime.now().millisecondsSinceEpoch,
    };
    try {
      await ref.read(mineBotPlatformProvider).upsert('bots', record);
      refreshTable(ref, 'bots');
      if (mounted) {
        HapticFeedback.lightImpact();
        showFeedback(context, AppLocalizations.of(context).botSaved);
        Navigator.pop(context);
      }
    } catch (error) {
      if (mounted) showFeedback(context, error.toString(), error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final EdgeInsets viewInsets = MediaQuery.viewInsetsOf(context);
    return Padding(
      padding: EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.sm, AppSpacing.page, viewInsets.bottom + AppSpacing.lg),
      child: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              ScreenHeader(title: widget.existing == null ? l10n.addBot : l10n.edit, compact: true),
              TextFormField(
                controller: _name,
                textCapitalization: TextCapitalization.words,
                textInputAction: TextInputAction.next,
                decoration: InputDecoration(labelText: l10n.botName, prefixIcon: const Icon(Icons.badge_outlined)),
                validator: (String? value) => value == null || value.trim().isEmpty ? l10n.botName : null,
              ),
              const SizedBox(height: AppSpacing.sm),
              TextFormField(
                controller: _username,
                textInputAction: TextInputAction.next,
                decoration: InputDecoration(labelText: l10n.username, prefixIcon: const Icon(Icons.person_outline_rounded)),
                validator: (String? value) {
                  final String text = value?.trim() ?? '';
                  if (_auth == 'offline' && !RegExp(r'^[A-Za-z0-9_]{3,16}$').hasMatch(text)) return l10n.offlineMode;
                  if (_auth == 'microsoft' && (text.isEmpty || text.length > 254 || RegExp(r'\s').hasMatch(text))) return l10n.microsoftMode;
                  return null;
                },
              ),
              const SizedBox(height: AppSpacing.sm),
              DropdownButtonFormField<String>(
                value: _serverId,
                isExpanded: true,
                decoration: InputDecoration(labelText: l10n.server),
                items: widget.servers.map((JsonMap server) => DropdownMenuItem<String>(value: valueText(server['id']), child: Text('${server['name'] ?? ''} · ${server['host'] ?? ''}', overflow: TextOverflow.ellipsis))).toList(),
                onChanged: (String? value) => setState(() => _serverId = value ?? _serverId),
              ),
              const SizedBox(height: AppSpacing.sm),
              DropdownButtonFormField<String>(
                value: _auth,
                decoration: InputDecoration(labelText: l10n.authMode),
                items: <DropdownMenuItem<String>>[
                  DropdownMenuItem<String>(value: 'offline', child: Text(l10n.offlineMode, maxLines: 1, overflow: TextOverflow.ellipsis)),
                  DropdownMenuItem<String>(value: 'microsoft', child: Text(l10n.microsoftMode, maxLines: 1, overflow: TextOverflow.ellipsis)),
                ],
                onChanged: (String? value) => setState(() => _auth = value ?? 'offline'),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(l10n.authNoPassword, style: AppTypography.label.copyWith(height: 1.4)),
              const SizedBox(height: AppSpacing.sm),
              TextFormField(
                controller: _version,
                textInputAction: TextInputAction.done,
                decoration: InputDecoration(labelText: l10n.gameVersion, prefixIcon: const Icon(Icons.tag_rounded)),
                validator: (String? value) => RegExp(r'^(auto|1\.(8|9|1[0-9]|20|21)(\.\d{1,2})?)$').hasMatch((value ?? '').trim()) ? null : l10n.gameVersion,
              ),
              SwitchListTile.adaptive(contentPadding: EdgeInsets.zero, value: _reconnect, title: Text(l10n.autoReconnect, style: AppTypography.body), onChanged: (bool value) => setState(() => _reconnect = value)),
              SwitchListTile.adaptive(contentPadding: EdgeInsets.zero, value: _autoEat, title: Text(l10n.autoEat, style: AppTypography.body), onChanged: (bool value) => setState(() => _autoEat = value)),
              SwitchListTile.adaptive(contentPadding: EdgeInsets.zero, value: _autoRespawn, title: Text(l10n.autoRespawn, style: AppTypography.body), onChanged: (bool value) => setState(() => _autoRespawn = value)),
              NeonButton(label: l10n.saveProfile, icon: Icons.save_rounded, loading: _saving, onPressed: _saving ? null : _save),
            ],
          ),
        ),
      ),
    );
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
