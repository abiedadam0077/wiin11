import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/data/providers.dart';
import '../../core/data/record_helpers.dart';
import '../../core/theme/app_design_system.dart';
import '../../core/widgets/async_view.dart';
import '../../core/widgets/visuals.dart';
import '../../core/widgets/voxel_item_icon.dart';
import '../../l10n/generated/app_localizations.dart';

class InventoryScreen extends ConsumerWidget {
  const InventoryScreen({super.key, required this.botId});
  final String botId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final AsyncValue<List<JsonMap>> statesAsync = ref.watch(recordsProvider('bot_states'));
    final List<JsonMap> states = statesAsync.valueOrNull ?? const <JsonMap>[];
    final JsonMap? state = states.where((JsonMap row) => (row['botId'] ?? row['id']) == botId).firstOrNull;
    final List<JsonMap> bots = ref.watch(recordsProvider('bots')).valueOrNull ?? const <JsonMap>[];
    final JsonMap? bot = bots.where((JsonMap row) => row['id'] == botId).firstOrNull;
    final bool live = isFreshSnapshot(state);
    final bool inventoryAvailable = live && state?['inventoryAvailable'] == true && state?['inventorySlots'] is List;
    final List<JsonMap> slots = inventoryAvailable
        ? (state!['inventorySlots'] as List).whereType<Map>().map((Map item) => Map<String, dynamic>.from(item)).toList(growable: false)
        : const <JsonMap>[];
    final List<JsonMap> equipment = inventoryAvailable
        ? (state!['equipmentSlots'] as List? ?? const <dynamic>[]).whereType<Map>().map((Map item) => Map<String, dynamic>.from(item)).toList(growable: false)
        : const <JsonMap>[];
    final List<JsonMap> items = inventoryAvailable
        ? (state!['inventory'] as List? ?? const <dynamic>[]).whereType<Map>().map((Map item) => Map<String, dynamic>.from(item)).toList(growable: false)
        : const <JsonMap>[];
    final List<JsonMap> mainSlots = slots.where((JsonMap slot) => (finiteInt(slot['slot']) ?? 0) >= 9 && (finiteInt(slot['slot']) ?? 0) <= 35).toList(growable: false);
    final List<JsonMap> hotbarSlots = slots.where((JsonMap slot) => (finiteInt(slot['slot']) ?? 0) >= 36 && (finiteInt(slot['slot']) ?? 0) <= 44).toList(growable: false);
    final int total = items.fold<int>(0, (int sum, JsonMap item) => sum + (finiteInt(item['count']) ?? 0));
    final int occupied = slots.where((JsonMap slot) => (finiteInt(slot['count']) ?? 0) > 0).length;

    return CustomScrollView(
      physics: const BouncingScrollPhysics(),
      slivers: <Widget>[
        SliverPadding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 10, AppSpacing.page, 0),
          sliver: SliverToBoxAdapter(child: ScreenHeader(title: l10n.inventory, subtitle: valueText(bot?['name'], fallback: l10n.botsTitle), leading: IconButton.filledTonal(onPressed: () => context.pop(), icon: const Icon(Icons.arrow_back_rounded)))),
        ),
        SliverPadding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0),
          sliver: SliverToBoxAdapter(child: GlassPanel(accent: AppColors.amber, child: Row(children: <Widget>[const Icon(Icons.visibility_outlined, color: AppColors.amber), const SizedBox(width: AppSpacing.sm), Expanded(child: Text(l10n.inventoryReadOnly, style: AppTypography.label.copyWith(height: 1.45)))]))),
        ),
        if (!live)
          SliverPadding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0),
            sliver: SliverToBoxAdapter(child: asyncContent(context, statesAsync, data: (_) => EmptyState(title: l10n.noLiveSnapshot, message: l10n.snapshotOnly, icon: Icons.inventory_2_outlined), onRetry: () => ref.invalidate(recordsProvider('bot_states')))),
          )
        else if (!inventoryAvailable)
          SliverPadding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0),
            sliver: SliverToBoxAdapter(child: GlassPanel(accent: AppColors.amber, child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[const Icon(Icons.inventory_2_outlined, color: AppColors.amber), const SizedBox(width: AppSpacing.sm), Expanded(child: Text(l10n.inventoryUnavailable, style: AppTypography.body.copyWith(height: 1.45)))]))),
          )
        else ...<Widget>[
          SliverPadding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0),
            sliver: SliverToBoxAdapter(child: GlassPanel(accent: AppColors.cyan, child: Row(children: <Widget>[const Icon(Icons.inventory_2_rounded, color: AppColors.cyan, size: 22), const SizedBox(width: AppSpacing.sm), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[Text(l10n.confirmedItems, style: AppTypography.title), Text('${l10n.inventory} · $occupied/36', style: AppTypography.micro.copyWith(fontSize: 9, letterSpacing: 0))])), Text('$total', style: AppTypography.headline.copyWith(color: AppColors.cyan))]))),
          ),
          if (total == 0)
            SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.xs, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: Text(l10n.emptyInventory, style: AppTypography.label.copyWith(color: AppColors.textMuted)))),
          SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: SectionHeading(l10n.armor))),
          SliverPadding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0),
            sliver: SliverToBoxAdapter(
              child: GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 5, crossAxisSpacing: AppSpacing.xs, mainAxisSpacing: AppSpacing.xs, childAspectRatio: 1),
                itemCount: equipment.length,
                itemBuilder: (BuildContext context, int index) => _Slot(item: equipment[index], l10n: l10n),
              ),
            ),
          ),
          SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: SectionHeading(l10n.mainInventory, trailing: '${mainSlots.where((JsonMap row) => (finiteInt(row['count']) ?? 0) > 0).length}/27'))),
          SliverPadding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0),
            sliver: SliverGrid.builder(
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 4, crossAxisSpacing: AppSpacing.xs, mainAxisSpacing: AppSpacing.xs, childAspectRatio: .98),
              itemCount: mainSlots.length,
              itemBuilder: (BuildContext context, int index) => _Slot(item: mainSlots[index], l10n: l10n),
            ),
          ),
          SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: SectionHeading(l10n.hotbar, trailing: '${hotbarSlots.where((JsonMap row) => (finiteInt(row['count']) ?? 0) > 0).length}/9'))),
          SliverPadding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0),
            sliver: SliverGrid.builder(
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 3, crossAxisSpacing: AppSpacing.xs, mainAxisSpacing: AppSpacing.xs, childAspectRatio: 1.08),
              itemCount: hotbarSlots.length,
              itemBuilder: (BuildContext context, int index) {
                final int? selected = finiteInt(state?['selectedHotbarSlot']);
                final int? slot = finiteInt(hotbarSlots[index]['slot']);
                return _Slot(item: hotbarSlots[index], l10n: l10n, highlight: selected != null && slot == selected + 36);
              },
            ),
          ),
        ],
        SliverPadding(padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom + 92)),
      ],
    );
  }
}

class _Slot extends StatelessWidget {
  const _Slot({required this.item, required this.l10n, this.highlight = false});
  final JsonMap item;
  final AppLocalizations l10n;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final int count = finiteInt(item['count']) ?? 0;
    final int? maxStack = finiteInt(item['maxStackSize']);
    final bool empty = count <= 0 || item['name'] == null;
    final String id = valueText(item['name']);
    final String name = valueText(item['displayName'], fallback: empty ? l10n.emptySlot : id);
    return Semantics(
      button: !empty,
      label: empty ? '${l10n.emptySlot} ${item['slot'] ?? ''}' : '$name, $count${maxStack == null ? '' : ' / $maxStack'}',
      child: Material(
        color: empty ? AppColors.backgroundRaised.withValues(alpha: .72) : AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: InkWell(
          borderRadius: BorderRadius.circular(AppRadius.md),
          onTap: empty ? null : () => _showDetails(context, id, name, count, maxStack),
          child: Container(
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(AppRadius.md), border: Border.all(color: highlight ? AppColors.amber.withValues(alpha: .68) : empty ? AppColors.outline.withValues(alpha: .42) : AppColors.cyan.withValues(alpha: .36))),
            padding: const EdgeInsets.all(AppSpacing.xs),
            child: Stack(children: <Widget>[
              Align(alignment: AlignmentDirectional.topStart, child: Text('${item['slot'] ?? ''}', style: AppTypography.micro.copyWith(fontSize: 8, letterSpacing: 0))),
              Center(child: empty ? Icon(Icons.crop_square_rounded, size: 21, color: AppColors.textMuted.withValues(alpha: .35)) : Column(mainAxisAlignment: MainAxisAlignment.center, children: <Widget>[
                VoxelItemIcon(itemId: id, size: 33),
                const SizedBox(height: 4),
                Text(name, style: AppTypography.micro.copyWith(fontSize: 8, letterSpacing: 0), maxLines: 2, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center),
              ])),
              if (!empty) Align(alignment: AlignmentDirectional.bottomEnd, child: DecoratedBox(decoration: BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.circular(5)), child: Padding(padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2), child: Text('$count', style: AppTypography.micro.copyWith(color: AppColors.text, fontSize: 8, letterSpacing: 0))))),
            ]),
          ),
        ),
      ),
    );
  }

  void _showDetails(BuildContext context, String id, String name, int count, int? maxStack) {
    showDialog<void>(
      context: context,
      builder: (BuildContext context) => AlertDialog(
        icon: VoxelItemIcon(itemId: id, size: 54),
        title: Text(name),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
          Text('minecraft:$id', style: AppTypography.label),
          const SizedBox(height: AppSpacing.xs),
          Text('${l10n.stackDetails}: $count${maxStack == null ? '' : ' / $maxStack'}', style: AppTypography.body),
          Text('${l10n.maxStack}: ${maxStack ?? '—'}', style: AppTypography.label),
          Text('${l10n.slotLabel}: ${item['slot'] ?? '—'}', style: AppTypography.label),
        ]),
        actions: <Widget>[TextButton(onPressed: () => Navigator.pop(context), child: Text(l10n.cancel))],
      ),
    );
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
