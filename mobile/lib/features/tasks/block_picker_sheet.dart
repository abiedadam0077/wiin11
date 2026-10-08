import 'package:flutter/material.dart';

import '../../core/data/minecraft_collect_catalog.dart';
import '../../core/theme/app_design_system.dart';
import '../../core/widgets/voxel_item_icon.dart';
import '../../l10n/generated/app_localizations.dart';

class BlockPickerSheet extends StatefulWidget {
  const BlockPickerSheet({super.key, required this.options, required this.l10n});

  final List<MinecraftBlockOption> options;
  final AppLocalizations l10n;

  @override
  State<BlockPickerSheet> createState() => _BlockPickerSheetState();
}

class _BlockPickerSheetState extends State<BlockPickerSheet> {
  final TextEditingController _search = TextEditingController();
  String _category = 'all';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = widget.l10n;
    final String query = _search.text.trim().toLowerCase();
    final List<MinecraftBlockOption> visible = widget.options.where((MinecraftBlockOption option) {
      final bool matchesCategory = _category == 'all' || option.category == _category;
      final String haystack = '${option.blockId} ${option.displayName} ${option.outputItemId} ${option.outputDisplayName}'.toLowerCase();
      return matchesCategory && (query.isEmpty || haystack.contains(query));
    }).toList(growable: false);
    final List<({String key, String label})> categories = <({String key, String label})>[
      (key: 'all', label: l10n.filterAll),
      (key: 'terrain', label: l10n.terrain),
      (key: 'ores', label: l10n.ores),
      (key: 'wood', label: l10n.wood),
      (key: 'plants', label: l10n.plants),
      (key: 'other', label: l10n.other),
    ];

    return SafeArea(
      top: false,
      child: AnimatedPadding(
        duration: AppMotion.standard,
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
        child: SizedBox(
          height: MediaQuery.sizeOf(context).height * .84,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Padding(
                padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, AppSpacing.xs),
                child: Row(children: <Widget>[const Icon(Icons.widgets_rounded, color: AppColors.cyan), const SizedBox(width: AppSpacing.sm), Expanded(child: Text(l10n.itemPicker, style: AppTypography.title)), IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close_rounded))]),
              ),
              Padding(
                padding: const EdgeInsetsDirectional.symmetric(horizontal: AppSpacing.page),
                child: TextField(
                  controller: _search,
                  autofocus: true,
                  textCapitalization: TextCapitalization.none,
                  autocorrect: false,
                  onChanged: (_) => setState(() {}),
                  decoration: InputDecoration(labelText: l10n.searchBlocksByNameOrId, prefixIcon: const Icon(Icons.search_rounded), suffixIcon: _search.text.isEmpty ? null : IconButton(onPressed: () { _search.clear(); setState(() {}); }, icon: const Icon(Icons.clear_rounded))),
                ),
              ),
              SizedBox(
                height: 52,
                child: ListView.separated(
                  padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.xs, AppSpacing.page, AppSpacing.xs),
                  scrollDirection: Axis.horizontal,
                  itemCount: categories.length,
                  separatorBuilder: (_, __) => const SizedBox(width: AppSpacing.xs),
                  itemBuilder: (BuildContext context, int index) {
                    final ({String key, String label}) item = categories[index];
                    return FilterChip(label: Text(item.label), selected: _category == item.key, showCheckmark: false, onSelected: (_) => setState(() => _category = item.key));
                  },
                ),
              ),
              Padding(
                padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.xs),
                child: Text('${l10n.catalogBuiltFor} · ${MinecraftCollectCatalog.version} · ${visible.length}', style: AppTypography.micro.copyWith(fontSize: 9, letterSpacing: 0)),
              ),
              Expanded(
                child: visible.isEmpty
                    ? Center(child: Padding(padding: const EdgeInsets.all(AppSpacing.page), child: Text(l10n.catalogEmpty, textAlign: TextAlign.center, style: AppTypography.label)))
                    : ListView.separated(
                        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                        padding: EdgeInsets.fromLTRB(AppSpacing.page, 0, AppSpacing.page, MediaQuery.paddingOf(context).bottom + AppSpacing.md),
                        itemCount: visible.length,
                        separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.xs),
                        itemBuilder: (BuildContext context, int index) {
                          final MinecraftBlockOption option = visible[index];
                          return Material(
                            color: AppColors.surface,
                            borderRadius: BorderRadius.circular(AppRadius.md),
                            child: InkWell(
                              borderRadius: BorderRadius.circular(AppRadius.md),
                              onTap: () => Navigator.pop(context, option),
                              child: Padding(
                                padding: const EdgeInsetsDirectional.all(AppSpacing.sm),
                                child: Row(children: <Widget>[
                                  VoxelItemIcon(itemId: option.blockId, size: 42),
                                  const SizedBox(width: AppSpacing.sm),
                                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
                                    Text(option.displayName, style: AppTypography.body.copyWith(fontWeight: FontWeight.w700), maxLines: 1, overflow: TextOverflow.ellipsis),
                                    Text(option.blockId, style: AppTypography.micro.copyWith(fontSize: 9, letterSpacing: 0), maxLines: 1, overflow: TextOverflow.ellipsis),
                                    Text('${l10n.catalogDrop}: ${option.outputDisplayName} · ${option.outputItemId}', style: AppTypography.label.copyWith(color: AppColors.cyan, fontSize: 10), maxLines: 1, overflow: TextOverflow.ellipsis),
                                  ])),
                                  const Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
                                ]),
                              ),
                            ),
                          );
                        },
                      ),
              ),
              Padding(
                padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.xs, AppSpacing.page, AppSpacing.sm),
                child: Text(l10n.catalogNotice, style: AppTypography.micro.copyWith(fontSize: 9, letterSpacing: 0, height: 1.4)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
