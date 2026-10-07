import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:path_provider/path_provider.dart';

import '../../core/data/providers.dart';
import '../../core/data/record_helpers.dart';
import '../../core/theme/app_design_system.dart';
import '../../core/widgets/async_view.dart';
import '../../core/widgets/visuals.dart';
import '../../core/widgets/voxel_image.dart';
import '../../l10n/generated/app_localizations.dart';

class SkinManagerScreen extends ConsumerStatefulWidget {
  const SkinManagerScreen({super.key});

  @override
  ConsumerState<SkinManagerScreen> createState() => _SkinManagerScreenState();
}

class _SkinManagerScreenState extends ConsumerState<SkinManagerScreen> {
  bool _importing = false;
  String _botId = '';

  Future<void> _importSkin() async {
    final AppLocalizations l10n = AppLocalizations.of(context);
    if (_importing) return;
    setState(() => _importing = true);
    try {
      final PlatformFile? selected = await FilePicker.pickFile(type: FileType.custom, allowedExtensions: <String>['png']);
      if (selected == null) return;
      final int? selectedLength = selected.lengthSync() ?? await selected.length();
      if (selectedLength != null && (selectedLength <= 0 || selectedLength > 2 * 1024 * 1024)) throw StateError(l10n.skinFileLimit);
      final Uint8List bytes = await selected.readAsBytes();
      if (bytes.isEmpty || bytes.length > 2 * 1024 * 1024) throw StateError(l10n.skinFileLimit);
      final ui.Codec codec = await ui.instantiateImageCodec(bytes);
      final ui.FrameInfo frame = await codec.getNextFrame();
      final int width = frame.image.width;
      final int height = frame.image.height;
      frame.image.dispose();
      codec.dispose();
      if (width != 64 || (height != 64 && height != 32)) throw StateError(l10n.skinRequirements);
      final Directory appDir = await getApplicationDocumentsDirectory();
      final Directory directory = Directory('${appDir.path}/skins');
      await directory.create(recursive: true);
      final String id = 'skin-${DateTime.now().microsecondsSinceEpoch}';
      final File target = File('${directory.path}/$id.png');
      await target.writeAsBytes(bytes, flush: true);
      final String name = selected.name.isEmpty ? 'Minecraft Skin.png' : selected.name;
      await ref.read(mineBotPlatformProvider).upsert('skins', <String, dynamic>{'id': id, 'name': name, 'filePath': target.path, 'width': width, 'height': height, 'createdAt': DateTime.now().millisecondsSinceEpoch});
      refreshTable(ref, 'skins');
      if (mounted) {
        HapticFeedback.selectionClick();
        showFeedback(context, l10n.successSaved);
      }
    } catch (error) {
      if (mounted) showFeedback(context, error.toString(), error: true);
    } finally {
      if (mounted) setState(() => _importing = false);
    }
  }

  Future<void> _assign(JsonMap skin) async {
    final List<JsonMap> bots = ref.read(recordsProvider('bots')).valueOrNull ?? const <JsonMap>[];
    final JsonMap? bot = bots.where((JsonMap row) => row['id'] == _botId).firstOrNull;
    if (bot == null) return;
    try {
      final JsonMap updated = Map<String, dynamic>.from(bot)..['skinId'] = skin['id'];
      await ref.read(mineBotPlatformProvider).upsert('bots', updated);
      refreshTable(ref, 'bots');
      if (mounted) showFeedback(context, AppLocalizations.of(context).skinPreviewSaved);
    } catch (error) {
      if (mounted) showFeedback(context, error.toString(), error: true);
    }
  }

  Future<void> _delete(JsonMap skin) async {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final bool? confirm = await showDialog<bool>(context: context, builder: (BuildContext context) => AlertDialog(
      title: Text(l10n.deleteSkinTitle),
      content: Text(l10n.deleteSkinBody),
      actions: <Widget>[
        TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l10n.cancel)),
        FilledButton.tonal(onPressed: () => Navigator.pop(context, true), child: Text(l10n.delete)),
      ],
    ));
    if (confirm != true) return;
    try {
      final List<JsonMap> bots = await ref.read(recordsProvider('bots').future);
      for (final JsonMap bot in bots.where((JsonMap row) => row['skinId'] == skin['id'])) {
        final JsonMap updated = Map<String, dynamic>.from(bot)..remove('skinId');
        await ref.read(mineBotPlatformProvider).upsert('bots', updated);
      }
      await ref.read(mineBotPlatformProvider).remove('skins', valueText(skin['id']));
      final String path = valueText(skin['filePath']);
      if (path.isNotEmpty) {
        final File image = File(path);
        if (await image.exists()) await image.delete();
      }
      refreshTable(ref, 'skins');
      refreshTable(ref, 'bots');
      if (mounted) showFeedback(context, l10n.delete);
    } catch (error) {
      if (mounted) showFeedback(context, error.toString(), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final AsyncValue<List<JsonMap>> skinsAsync = ref.watch(recordsProvider('skins'));
    final List<JsonMap> skins = skinsAsync.valueOrNull ?? const <JsonMap>[];
    final List<JsonMap> bots = ref.watch(recordsProvider('bots')).valueOrNull ?? const <JsonMap>[];
    if (_botId.isEmpty && bots.isNotEmpty) _botId = valueText(bots.first['id']);
    final JsonMap? selectedBot = bots.where((JsonMap row) => row['id'] == _botId).firstOrNull;
    final JsonMap? currentSkin = skins.where((JsonMap row) => row['id'] == selectedBot?['skinId']).firstOrNull;
    return CustomScrollView(
      physics: const BouncingScrollPhysics(),
      slivers: <Widget>[
        SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 10, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: ScreenHeader(title: l10n.skinManager, subtitle: l10n.supportOnlyLocal, leading: IconButton.filledTonal(onPressed: () => context.pop(), icon: const Icon(Icons.arrow_back_rounded)), trailing: IconButton.filledTonal(tooltip: l10n.uploadSkin, onPressed: _importSkin, icon: const Icon(Icons.add_rounded))))),
        SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: GlassPanel(accent: AppColors.amber, child: Row(children: <Widget>[const Icon(Icons.info_outline_rounded, color: AppColors.amber), const SizedBox(width: AppSpacing.sm), Expanded(child: Text(l10n.skinRequirements, style: AppTypography.label.copyWith(height: 1.45)))])))),
        if (bots.isNotEmpty) ...<Widget>[
          SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: DropdownButtonFormField<String>(value: _botId, decoration: InputDecoration(labelText: l10n.assignedBot), isExpanded: true, items: bots.map((JsonMap bot) => DropdownMenuItem<String>(value: valueText(bot['id']), child: Text(valueText(bot['name'], fallback: valueText(bot['username'])), overflow: TextOverflow.ellipsis))).toList(growable: false), onChanged: (String? value) => setState(() => _botId = value ?? '')))),
          SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.sm, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: GlassPanel(accent: AppColors.purple, child: Column(children: <Widget>[Text(l10n.currentSkin, style: AppTypography.label), const SizedBox(height: AppSpacing.sm), VoxelImage(path: valueText(currentSkin?['filePath']).isEmpty ? null : valueText(currentSkin?['filePath']), size: 116), const SizedBox(height: AppSpacing.xs), Text(valueText(currentSkin?['name'], fallback: l10n.noSkins), style: AppTypography.title), Text(l10n.supportOnlyLocal, textAlign: TextAlign.center, style: AppTypography.label), if (currentSkin != null) TextButton.icon(onPressed: () async { final JsonMap updated = Map<String, dynamic>.from(selectedBot!)..remove('skinId'); await ref.read(mineBotPlatformProvider).upsert('bots', updated); refreshTable(ref, 'bots'); }, icon: const Icon(Icons.remove_circle_outline_rounded), label: Text(l10n.removeLocalSkin))])))),
        ],
        SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.md, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: SectionHeading(l10n.savedSkins, trailing: '${skins.length}'))),
        if (_importing)
          const SliverPadding(padding: EdgeInsets.all(AppSpacing.page), sliver: SliverToBoxAdapter(child: LoadingState()))
        else if (skinsAsync.hasError)
          SliverPadding(padding: const EdgeInsets.all(AppSpacing.page), sliver: SliverToBoxAdapter(child: asyncContent(context, skinsAsync, data: (_) => const SizedBox.shrink(), onRetry: () => ref.invalidate(recordsProvider('skins')))))
        else if (skins.isEmpty)
          SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: EmptyState(title: l10n.noSkins, message: l10n.skinRequirements, icon: Icons.face_retouching_natural_rounded, action: NeonButton(label: l10n.uploadSkin, icon: Icons.upload_file_rounded, expanded: false, onPressed: _importSkin))))
        else
          SliverPadding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0),
            sliver: SliverList.builder(
              itemCount: skins.length,
              itemBuilder: (BuildContext context, int index) {
                final JsonMap skin = skins[index];
                final bool active = skin['id'] == selectedBot?['skinId'];
                return Padding(padding: const EdgeInsets.only(bottom: AppSpacing.sm), child: GlassPanel(accent: active ? AppColors.green : AppColors.purple, child: Row(children: <Widget>[VoxelImage(path: valueText(skin['filePath']), size: 64), const SizedBox(width: AppSpacing.sm), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[Text(valueText(skin['name']), style: AppTypography.title, maxLines: 1, overflow: TextOverflow.ellipsis), Text('${skin['width'] ?? 64}×${skin['height'] ?? 64} PNG', style: AppTypography.label), if (active) StatusBadge(label: l10n.currentSkin, color: AppColors.green)])), IconButton(tooltip: l10n.applyLocalSkin, onPressed: selectedBot == null ? null : () => _assign(skin), icon: const Icon(Icons.check_circle_outline_rounded, color: AppColors.cyan)), IconButton(tooltip: l10n.delete, onPressed: () => _delete(skin), icon: const Icon(Icons.delete_outline_rounded, color: AppColors.red))])));
              },
            ),
          ),
        SliverPadding(padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, AppSpacing.sm, AppSpacing.page, 0), sliver: SliverToBoxAdapter(child: NeonButton(label: _importing ? l10n.loading : l10n.uploadSkin, icon: Icons.upload_file_rounded, loading: _importing, secondary: true, onPressed: _importing ? null : _importSkin))),
        SliverPadding(padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom + 92)),
      ],
    );
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
