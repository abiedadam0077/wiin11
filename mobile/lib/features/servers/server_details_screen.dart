import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/data/providers.dart';
import '../../core/data/record_helpers.dart';
import '../../core/theme/app_design_system.dart';
import '../../core/widgets/async_view.dart';
import '../../core/widgets/status_colors.dart';
import '../../core/widgets/visuals.dart';
import '../../l10n/generated/app_localizations.dart';

class ServerDetailsScreen extends ConsumerWidget {
  const ServerDetailsScreen({super.key, required this.serverId});
  final String serverId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final AsyncValue<List<JsonMap>> serversAsync = ref.watch(recordsProvider('servers'));
    final List<JsonMap> servers = serversAsync.valueOrNull ?? const <JsonMap>[];
    final JsonMap? server = servers.where((JsonMap row) => row['id'] == serverId).firstOrNull;
    final List<JsonMap> bots = ref.watch(recordsProvider('bots')).valueOrNull ?? const <JsonMap>[];
    final List<JsonMap> states = ref.watch(recordsProvider('bot_states')).valueOrNull ?? const <JsonMap>[];
    if (server == null) {
      return SafeArea(child: Padding(padding: const EdgeInsets.all(AppSpacing.page), child: asyncContent(context, serversAsync, data: (_) => EmptyState(title: l10n.noServers, message: l10n.notAvailable, action: NeonButton(label: l10n.navServers, expanded: false, onPressed: () => context.go('/servers'))), onRetry: () => ref.invalidate(recordsProvider('servers')))));
    }
    final String rawStatus = valueText(server['status'], fallback: 'untested').toUpperCase();
    final ({String label, Color color, bool pulse}) status = statusPresentation(l10n, rawStatus);
    final List<JsonMap> linkedBots = bots.where((JsonMap row) => row['serverId'] == serverId).toList(growable: false);
    return CustomScrollView(
      physics: const BouncingScrollPhysics(),
      slivers: <Widget>[
        SliverPadding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 10, AppSpacing.page, 0),
          sliver: SliverToBoxAdapter(
            child: ScreenHeader(
              title: valueText(server['name'], fallback: l10n.serverName),
              subtitle: l10n.serversTitle,
              leading: IconButton.filledTonal(onPressed: () => context.pop(), icon: const Icon(Icons.arrow_back_rounded)),
              trailing: StatusBadge(label: status.label, color: status.color),
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.xs, AppSpacing.page, 0),
          sliver: SliverToBoxAdapter(
            child: GlassPanel(
              accent: status.color,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Row(children: <Widget>[const AccentIcon(Icons.dns_rounded), const SizedBox(width: AppSpacing.sm), Expanded(child: Text('${server['host'] ?? ''}:${server['port'] ?? 25565}', style: AppTypography.title))]),
                  const SizedBox(height: AppSpacing.xs),
                  Text(l10n.serverPingNotice, style: AppTypography.label.copyWith(height: 1.45)),
                  if (server['status'] == 'status_reachable') ...<Widget>[
                    const SizedBox(height: AppSpacing.md),
                    Row(children: <Widget>[
                      _Fact(label: l10n.serverVersion, value: valueText(server['pingVersion'], fallback: l10n.notAvailable), icon: Icons.tag_rounded),
                      _Fact(label: l10n.players, value: '${server['playersOnline'] ?? 0}/${server['playersMax'] ?? 0}', icon: Icons.people_alt_outlined),
                      _Fact(label: l10n.ping, value: '${server['latencyMs'] ?? '—'}ms', icon: Icons.speed_rounded),
                    ]),
                    if (valueText(server['description']).isNotEmpty) ...<Widget>[
                      const SizedBox(height: AppSpacing.sm),
                      Text(l10n.motd, style: AppTypography.micro),
                      const SizedBox(height: 4),
                      Text(valueText(server['description']), style: AppTypography.body.copyWith(fontSize: 12)),
                    ],
                  ] else if (server['status'] == 'status_failed') ...<Widget>[
                    const SizedBox(height: AppSpacing.sm),
                    Text(valueText(server['lastPingReason'], fallback: l10n.unreachable), style: AppTypography.label.copyWith(color: AppColors.red)),
                  ],
                  if (server['lastPingAt'] != null) ...<Widget>[
                    const SizedBox(height: AppSpacing.sm),
                    Text('${l10n.lastPing}: ${DateTime.fromMillisecondsSinceEpoch(finiteInt(server['lastPingAt']) ?? 0).toLocal()}', style: AppTypography.label),
                  ],
                ],
              ),
            ),
          ),
        ),
        SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: SectionHeading(l10n.linkedBots, trailing: '${linkedBots.length}'))),
        if (linkedBots.isEmpty)
          SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: EmptyState(title: l10n.noLinkedBots, message: l10n.manageBots, icon: Icons.smart_toy_outlined)))
        else
          SliverPadding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0),
            sliver: SliverList.builder(
              itemCount: linkedBots.length,
              itemBuilder: (BuildContext context, int index) {
                final JsonMap bot = linkedBots[index];
                final JsonMap? state = states.where((JsonMap row) => (row['botId'] ?? row['id']) == bot['id']).firstOrNull;
                final ({String label, Color color, bool pulse}) badge = statusPresentation(l10n, liveBotStatus(state));
                return Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                  child: GlassPanel(
                    accent: badge.color,
                    onTap: () => context.push('/bots/${bot['id']}'),
                    child: Row(children: <Widget>[const Icon(Icons.smart_toy_rounded, color: AppColors.cyan), const SizedBox(width: AppSpacing.sm), Expanded(child: Text(valueText(bot['name'], fallback: valueText(bot['username'])), style: AppTypography.title)), StatusBadge(label: badge.label, color: badge.color)]),
                  ),
                );
              },
            ),
          ),
        SliverPadding(padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom + 92)),
      ],
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.label, required this.value, required this.icon});
  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Row(children: <Widget>[Icon(icon, size: 15, color: AppColors.cyan), const SizedBox(width: 5), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[Text(label, style: AppTypography.micro.copyWith(fontSize: 8)), Text(value, style: AppTypography.label.copyWith(color: AppColors.text), maxLines: 1, overflow: TextOverflow.ellipsis)]))]),
      );
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
