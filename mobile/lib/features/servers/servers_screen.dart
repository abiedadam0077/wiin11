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
import '../../l10n/generated/app_localizations.dart';

class ServersScreen extends ConsumerStatefulWidget {
  const ServersScreen({super.key});

  @override
  ConsumerState<ServersScreen> createState() => _ServersScreenState();
}

class _ServersScreenState extends ConsumerState<ServersScreen> {
  final TextEditingController _search = TextEditingController();
  final Set<String> _pinging = <String>{};

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _ping(JsonMap server) async {
    final String id = valueText(server['id']);
    if (!_pinging.add(id)) return;
    setState(() {});
    final AppLocalizations l10n = AppLocalizations.of(context);
    showFeedback(context, l10n.pingInProgress);
    try {
      final JsonMap result = await ref.read(mineBotPlatformProvider).pingServer(
            valueText(server['host']),
            finiteInt(server['port']) ?? 25565,
          );
      final JsonMap updated = Map<String, dynamic>.from(server)
        ..['status'] = 'status_reachable'
        ..['pingVersion'] = result['version']
        ..['playersOnline'] = result['playersOnline']
        ..['playersMax'] = result['playersMax']
        ..['latencyMs'] = result['latencyMs']
        ..['description'] = result['description']
        ..['protocol'] = result['protocol']
        ..['lastPingAt'] = result['checkedAt'] ?? DateTime.now().millisecondsSinceEpoch;
      await ref.read(mineBotPlatformProvider).upsert('servers', updated);
      refreshTable(ref, 'servers');
      if (mounted) showFeedback(context, l10n.reachable);
    } catch (error) {
      final JsonMap updated = Map<String, dynamic>.from(server)
        ..['status'] = 'status_failed'
        ..['lastPingReason'] = error.toString()
        ..['lastPingAt'] = DateTime.now().millisecondsSinceEpoch;
      try {
        await ref.read(mineBotPlatformProvider).upsert('servers', updated);
        refreshTable(ref, 'servers');
      } catch (_) {}
      if (mounted) showFeedback(context, '${l10n.pingFailed}: $error', error: true);
    } finally {
      _pinging.remove(id);
      if (mounted) setState(() {});
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final AsyncValue<List<JsonMap>> asyncRows = ref.watch(recordsProvider('servers'));
    final List<JsonMap> rows = asyncRows.valueOrNull ?? const <JsonMap>[];
    final String query = _search.text.trim().toLowerCase();
    final List<JsonMap> visible = rows.where((JsonMap row) => query.isEmpty || '${row['name'] ?? ''} ${row['host'] ?? ''}'.toLowerCase().contains(query)).toList(growable: false);
    final int reachable = rows.where((JsonMap row) => row['status'] == 'status_reachable').length;

    return RefreshIndicator(
      color: AppColors.cyan,
      onRefresh: () => ref.refresh(recordsProvider('servers').future).then<void>((_) {}),
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
        slivers: <Widget>[
          SliverPadding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 10, AppSpacing.page, 0),
            sliver: SliverToBoxAdapter(
              child: ScreenHeader(
                title: l10n.serversTitle,
                subtitle: l10n.manageServers,
                trailing: IconButton.filledTonal(
                  tooltip: l10n.addServer,
                  onPressed: () => _showServerForm(context, ref),
                  icon: const Icon(Icons.add_rounded),
                ),
              ),
            ),
          ),
          SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.sm), sliver: SliverToBoxAdapter(child: SearchField(controller: _search, onChanged: (_) => setState(() {})))),
          SliverPadding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.sm),
            sliver: SliverToBoxAdapter(
              child: Row(
                children: <Widget>[
                  Expanded(child: _ServerSummary(label: l10n.serverCount, value: '${rows.length}', icon: Icons.dns_rounded, color: AppColors.blue)),
                  const SizedBox(width: AppSpacing.xs),
                  Expanded(child: _ServerSummary(label: l10n.reachable, value: '$reachable', icon: Icons.wifi_tethering_rounded, color: AppColors.green)),
                ],
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0),
            sliver: SliverToBoxAdapter(
              child: GlassPanel(
                accent: AppColors.amber,
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.xs),
                child: Row(
                  children: <Widget>[
                    const Icon(Icons.info_outline_rounded, color: AppColors.amber, size: 18),
                    const SizedBox(width: AppSpacing.xs),
                    Expanded(child: Text(l10n.serverPingNotice, style: AppTypography.label.copyWith(fontSize: 10, height: 1.35))),
                  ],
                ),
              ),
            ),
          ),
          if (asyncRows.isLoading && rows.isEmpty)
            const SliverFillRemaining(hasScrollBody: false, child: LoadingState())
          else if (asyncRows.hasError)
            SliverPadding(padding: const EdgeInsets.all(AppSpacing.page), sliver: SliverToBoxAdapter(child: asyncContent(context, asyncRows, data: (_) => const SizedBox.shrink(), onRetry: () => ref.invalidate(recordsProvider('servers')))))
          else if (visible.isEmpty)
            SliverPadding(
              padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0),
              sliver: SliverToBoxAdapter(child: EmptyState(title: l10n.noServers, message: l10n.manageServers, icon: Icons.dns_outlined, action: NeonButton(label: l10n.addServer, icon: Icons.add_rounded, expanded: false, onPressed: () => _showServerForm(context, ref)))),
            )
          else
            SliverPadding(
              padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.sm, AppSpacing.page, 0),
              sliver: SliverList.builder(
                itemCount: visible.length,
                itemBuilder: (BuildContext context, int index) {
                  final JsonMap server = visible[index];
                  final String status = valueText(server['status'], fallback: 'untested').toUpperCase();
                  final ({String label, Color color, bool pulse}) badge = statusPresentation(l10n, status);
                  return Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                    child: GlassPanel(
                      accent: badge.color,
                      onTap: () => context.push('/servers/${server['id']}'),
                      padding: const EdgeInsets.all(AppSpacing.sm),
                      child: Column(
                        children: <Widget>[
                          Row(
                            children: <Widget>[
                              const AccentIcon(Icons.dns_rounded, color: AppColors.cyan),
                              const SizedBox(width: AppSpacing.sm),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: <Widget>[
                                    Text(valueText(server['name'], fallback: l10n.serverName), style: AppTypography.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                                    Text('${server['host'] ?? ''}:${server['port'] ?? 25565} · Java Edition', style: AppTypography.label, maxLines: 1, overflow: TextOverflow.ellipsis),
                                  ],
                                ),
                              ),
                              StatusBadge(label: badge.label, color: badge.color, pulse: false),
                              PopupMenuButton<String>(
                                tooltip: l10n.more,
                                onSelected: (String value) {
                                  if (value == 'edit') _showServerForm(context, ref, existing: server);
                                  if (value == 'delete') _deleteServer(context, ref, server);
                                },
                                itemBuilder: (BuildContext context) => <PopupMenuEntry<String>>[
                                  PopupMenuItem<String>(value: 'edit', child: Text(l10n.edit)),
                                  PopupMenuItem<String>(value: 'delete', child: Text(l10n.delete)),
                                ],
                                icon: const Icon(Icons.more_vert_rounded, color: AppColors.textMuted),
                              ),
                            ],
                          ),
                          if (server['status'] == 'status_reachable') ...<Widget>[
                            const SizedBox(height: AppSpacing.xs),
                            Row(
                              children: <Widget>[
                                _ServerFact(icon: Icons.tag_rounded, label: l10n.serverVersion, value: valueText(server['pingVersion'], fallback: l10n.notAvailable)),
                                _ServerFact(icon: Icons.people_alt_outlined, label: l10n.players, value: '${server['playersOnline'] ?? 0}/${server['playersMax'] ?? 0}'),
                                _ServerFact(icon: Icons.speed_rounded, label: l10n.ping, value: '${server['latencyMs'] ?? '—'}ms'),
                              ],
                            ),
                          ] else if (server['status'] == 'status_failed')
                            Align(alignment: AlignmentDirectional.centerStart, child: Padding(padding: const EdgeInsets.only(top: AppSpacing.xs), child: Text(valueText(server['lastPingReason'], fallback: l10n.unreachable), style: AppTypography.label.copyWith(color: AppColors.red), maxLines: 2, overflow: TextOverflow.ellipsis))),
                          const SizedBox(height: AppSpacing.sm),
                          Row(
                            children: <Widget>[
                              Expanded(child: NeonButton(label: _pinging.contains(valueText(server['id'])) ? l10n.loading : l10n.testPing, icon: Icons.network_ping_rounded, loading: _pinging.contains(valueText(server['id'])), onPressed: _pinging.contains(valueText(server['id'])) ? null : () => _ping(server))),
                              const SizedBox(width: AppSpacing.xs),
                              IconButton.filledTonal(tooltip: l10n.details, onPressed: () => context.push('/servers/${server['id']}'), icon: const Icon(Icons.arrow_forward_rounded)),
                            ],
                          ),
                        ],
                      ),
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
}

class _ServerSummary extends StatelessWidget {
  const _ServerSummary({required this.label, required this.value, required this.icon, required this.color});
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) => GlassPanel(
        accent: color,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.sm),
        child: Row(children: <Widget>[Icon(icon, color: color, size: 18), const SizedBox(width: AppSpacing.xs), Expanded(child: Text(label, style: AppTypography.label, maxLines: 1, overflow: TextOverflow.ellipsis)), Text(value, style: AppTypography.title.copyWith(color: color))]),
      );
}

class _ServerFact extends StatelessWidget {
  const _ServerFact({required this.icon, required this.label, required this.value});
  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Row(
          children: <Widget>[
            Icon(icon, size: 14, color: AppColors.cyan),
            const SizedBox(width: 5),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[Text(label, style: AppTypography.micro.copyWith(fontSize: 8, letterSpacing: .1)), Text(value, style: AppTypography.label.copyWith(color: AppColors.text), maxLines: 1, overflow: TextOverflow.ellipsis)])),
          ],
        ),
      );
}

Future<void> _showServerForm(BuildContext context, WidgetRef ref, {JsonMap? existing}) async {
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (BuildContext context) => _ServerFormSheet(existing: existing),
  );
  refreshTable(ref, 'servers');
}

class _ServerFormSheet extends ConsumerStatefulWidget {
  const _ServerFormSheet({this.existing});
  final JsonMap? existing;

  @override
  ConsumerState<_ServerFormSheet> createState() => _ServerFormSheetState();
}

class _ServerFormSheetState extends ConsumerState<_ServerFormSheet> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  late final TextEditingController _name = TextEditingController(text: valueText(widget.existing?['name']));
  late final TextEditingController _host = TextEditingController(text: valueText(widget.existing?['host']));
  late final TextEditingController _port = TextEditingController(text: valueText(widget.existing?['port'], fallback: '25565'));
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    _host.dispose();
    _port.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    final JsonMap record = <String, dynamic>{
      ...?widget.existing,
      'id': valueText(widget.existing?['id'], fallback: 'server-${DateTime.now().microsecondsSinceEpoch}'),
      'name': _name.text.trim(),
      'host': _host.text.trim(),
      'port': int.parse(_port.text.trim().isEmpty ? '25565' : _port.text.trim()),
      'status': 'untested',
      'createdAt': widget.existing?['createdAt'] ?? DateTime.now().millisecondsSinceEpoch,
      'updatedAt': DateTime.now().millisecondsSinceEpoch,
    };
    for (final String key in <String>['pingVersion', 'playersOnline', 'playersMax', 'latencyMs', 'description', 'protocol', 'lastPingAt', 'lastPingReason']) {
      record.remove(key);
    }
    try {
      await ref.read(mineBotPlatformProvider).upsert('servers', record);
      refreshTable(ref, 'servers');
      if (mounted) {
        HapticFeedback.lightImpact();
        showFeedback(context, AppLocalizations.of(context).serverSaved);
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
    final EdgeInsets keyboard = MediaQuery.viewInsetsOf(context);
    return Padding(
      padding: EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.sm, AppSpacing.page, keyboard.bottom + AppSpacing.lg),
      child: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              ScreenHeader(title: widget.existing == null ? l10n.addServer : l10n.edit, compact: true),
              TextFormField(controller: _name, textCapitalization: TextCapitalization.words, decoration: InputDecoration(labelText: l10n.serverName, prefixIcon: const Icon(Icons.dns_rounded)), validator: (String? value) => value == null || value.trim().isEmpty ? l10n.serverName : null),
              const SizedBox(height: AppSpacing.sm),
              TextFormField(
                controller: _host,
                keyboardType: TextInputType.url,
                decoration: InputDecoration(labelText: l10n.host, prefixIcon: const Icon(Icons.language_rounded)),
                validator: (String? value) {
                  final String host = value?.trim() ?? '';
                  if (host.isEmpty || host.length > 253 || RegExp(r'[\s/\\?#@]').hasMatch(host)) return l10n.host;
                  return null;
                },
              ),
              const SizedBox(height: AppSpacing.sm),
              TextFormField(controller: _port, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: l10n.port, prefixIcon: const Icon(Icons.numbers_rounded)), validator: (String? value) { final int? port = int.tryParse(value ?? ''); return port != null && port >= 1 && port <= 65535 ? null : l10n.port; }),
              const SizedBox(height: AppSpacing.md),
              NeonButton(label: l10n.save, icon: Icons.save_rounded, loading: _saving, onPressed: _saving ? null : _save),
            ],
          ),
        ),
      ),
    );
  }
}

Future<void> _deleteServer(BuildContext context, WidgetRef ref, JsonMap server) async {
  final AppLocalizations l10n = AppLocalizations.of(context);
  final bool? confirmed = await showDialog<bool>(
    context: context,
    builder: (BuildContext context) => AlertDialog(
      title: Text(l10n.delete),
      content: Text('${l10n.serverName}: ${server['name'] ?? ''}'),
      actions: <Widget>[
        TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l10n.cancel)),
        FilledButton.tonal(onPressed: () => Navigator.pop(context, true), child: Text(l10n.delete)),
      ],
    ),
  );
  if (confirmed != true) return;
  try {
    final List<JsonMap> bots = await ref.read(recordsProvider('bots').future);
    final List<JsonMap> states = await ref.read(recordsProvider('bot_states').future);
    for (final JsonMap bot in bots.where((JsonMap row) => row['serverId'] == server['id'])) {
      final JsonMap? state = states.where((JsonMap row) => (row['botId'] ?? row['id']) == bot['id']).firstOrNull;
      if (state != null && <String>{'ONLINE', 'STALE', 'CONNECTING', 'AUTHENTICATING', 'JOINING', 'RECONNECTING', 'DEAD'}.contains(liveBotStatus(state))) {
        if (context.mounted) showFeedback(context, l10n.stopBotBody, error: true);
        return;
      }
    }
    for (final JsonMap bot in bots.where((JsonMap row) => row['serverId'] == server['id'])) {
      final JsonMap updated = Map<String, dynamic>.from(bot)..['serverId'] = '';
      await ref.read(mineBotPlatformProvider).upsert('bots', updated);
    }
    await ref.read(mineBotPlatformProvider).remove('servers', valueText(server['id']));
    refreshTable(ref, 'servers');
    refreshTable(ref, 'bots');
    if (context.mounted) showFeedback(context, l10n.delete);
  } catch (error) {
    if (context.mounted) showFeedback(context, error.toString(), error: true);
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
