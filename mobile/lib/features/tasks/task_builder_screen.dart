import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/data/minecraft_collect_catalog.dart';
import '../../core/data/providers.dart';
import '../../core/data/record_helpers.dart';
import '../../core/theme/app_design_system.dart';
import '../../core/widgets/async_view.dart';
import '../../core/widgets/visuals.dart';
import '../../core/widgets/voxel_item_icon.dart';
import '../../l10n/generated/app_localizations.dart';
import 'block_picker_sheet.dart';

class TaskBuilderScreen extends ConsumerStatefulWidget {
  const TaskBuilderScreen({super.key});

  @override
  ConsumerState<TaskBuilderScreen> createState() => _TaskBuilderScreenState();
}

class _TaskBuilderScreenState extends ConsumerState<TaskBuilderScreen> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _block = TextEditingController();
  final TextEditingController _amount = TextEditingController(text: '1');
  late final Future<List<MinecraftBlockOption>> _catalog;
  MinecraftBlockOption? _selectedOption;
  int _step = 0;
  String _category = 'gathering';
  String _botId = '';
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _catalog = MinecraftCollectCatalog.load();
  }

  @override
  void dispose() {
    _block.dispose();
    _amount.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final List<JsonMap> bots = ref.watch(recordsProvider('bots')).valueOrNull ?? const <JsonMap>[];
    final List<JsonMap> servers = ref.watch(recordsProvider('servers')).valueOrNull ?? const <JsonMap>[];
    final List<_Category> categories = <_Category>[
      _Category('gathering', l10n.gathering, Icons.inventory_2_outlined, true),
      _Category('mining', l10n.mining, Icons.construction_rounded, false),
      _Category('building', l10n.building, Icons.view_in_ar_rounded, false),
      _Category('protection', l10n.protection, Icons.shield_outlined, false),
      _Category('farming', l10n.farming, Icons.grass_rounded, false),
      _Category('exploration', l10n.exploration, Icons.explore_outlined, false),
      _Category('follow', l10n.follow, Icons.directions_walk_rounded, false),
      _Category('storage', l10n.storage, Icons.inventory_outlined, false),
      _Category('combat', l10n.combat, Icons.sports_martial_arts_rounded, false),
      _Category('crafting', l10n.crafting, Icons.build_circle_outlined, false),
      _Category('transport', l10n.transport, Icons.local_shipping_outlined, false),
      _Category('survival', l10n.survival, Icons.health_and_safety_outlined, false),
      _Category('customAi', l10n.customAi, Icons.auto_awesome_outlined, false),
    ];
    if (_botId.isEmpty && bots.isNotEmpty) _botId = valueText(bots.first['id']);
    return Scaffold(
      backgroundColor: Colors.transparent,
      resizeToAvoidBottomInset: true,
      body: CustomScrollView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        physics: const BouncingScrollPhysics(),
        slivers: <Widget>[
          SliverPadding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 10, AppSpacing.page, 0),
            sliver: SliverToBoxAdapter(child: ScreenHeader(title: l10n.taskBuilderTitle, subtitle: _step == 0 ? l10n.stepCategory : _step == 1 ? l10n.stepTarget : l10n.stepReview, leading: IconButton.filledTonal(onPressed: () => context.pop(), icon: const Icon(Icons.arrow_back_rounded)))),
          ),
          SliverPadding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.md),
            sliver: SliverToBoxAdapter(child: _StepIndicator(step: _step, l10n: l10n)),
          ),
          if (_step == 0)
            SliverPadding(
              padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0),
              sliver: SliverToBoxAdapter(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
                  Text(l10n.selectCategory, style: AppTypography.title),
                  const SizedBox(height: AppSpacing.sm),
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: MediaQuery.sizeOf(context).width > 520 ? 3 : 2, crossAxisSpacing: AppSpacing.xs, mainAxisSpacing: AppSpacing.xs, childAspectRatio: 1.72),
                    itemCount: categories.length,
                    itemBuilder: (BuildContext context, int index) {
                      final _Category category = categories[index];
                      final bool selected = category.key == _category;
                      return Opacity(
                        opacity: category.supported ? 1 : .66,
                        child: GlassPanel(
                          accent: category.supported ? AppColors.cyan : AppColors.textMuted,
                          onTap: category.supported ? () => setState(() => _category = category.key) : null,
                          padding: const EdgeInsets.all(AppSpacing.sm),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
                            Row(children: <Widget>[Icon(category.icon, color: category.supported ? AppColors.cyan : AppColors.textMuted, size: 19), const Spacer(), if (selected) const Icon(Icons.check_circle_rounded, color: AppColors.green, size: 17)]),
                            const Spacer(),
                            Text(category.label, style: AppTypography.body.copyWith(fontWeight: FontWeight.w700), maxLines: 1, overflow: TextOverflow.ellipsis),
                            Text(category.supported ? l10n.collectEnabled : l10n.comingSoon, style: AppTypography.micro.copyWith(color: category.supported ? AppColors.green : AppColors.amber, fontSize: 8, letterSpacing: 0), maxLines: 1, overflow: TextOverflow.ellipsis),
                          ]),
                        ),
                      );
                    },
                  ),
                  const SizedBox(height: AppSpacing.md),
                  GlassPanel(accent: AppColors.amber, child: Row(children: <Widget>[const Icon(Icons.info_outline_rounded, color: AppColors.amber), const SizedBox(width: AppSpacing.sm), Expanded(child: Text(l10n.taskFeatureBoundary, style: AppTypography.label.copyWith(height: 1.4)))])),
                  const SizedBox(height: AppSpacing.md),
                  NeonButton(label: l10n.continueLabel, icon: Icons.arrow_forward_rounded, onPressed: () => setState(() => _step = 1)),
                ]),
              ),
            )
          else if (_step == 1)
            SliverPadding(
              padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0),
              sliver: SliverToBoxAdapter(
                child: Form(
                  key: _formKey,
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: <Widget>[
                    GlassPanel(accent: AppColors.cyan, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
                      Text('${l10n.gathering} · collect_block', style: AppTypography.title),
                      const SizedBox(height: AppSpacing.xs),
                      Text(l10n.gatherDescription, style: AppTypography.label.copyWith(height: 1.45)),
                      const SizedBox(height: AppSpacing.md),
                      Row(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
                        Expanded(child: TextFormField(
                          controller: _block,
                          textCapitalization: TextCapitalization.none,
                          autocorrect: false,
                          maxLength: 74,
                          scrollPadding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom + 48),
                          onChanged: (String value) { if (_selectedOption != null && value.trim() != _selectedOption!.blockId) setState(() => _selectedOption = null); },
                          decoration: InputDecoration(labelText: l10n.manualBlockId, hintText: 'minecraft:dirt', prefixIcon: const Icon(Icons.widgets_outlined), counterText: ''),
                          validator: (String? value) => RegExp(r'^(?:minecraft:)?[a-z0-9_]{1,64}$').hasMatch((value ?? '').trim()) ? null : l10n.invalidBlockName,
                        )),
                        const SizedBox(width: AppSpacing.xs),
                        Padding(padding: const EdgeInsets.only(top: 4), child: IconButton.filledTonal(tooltip: l10n.itemPicker, onPressed: _openBlockPicker, icon: const Icon(Icons.search_rounded))),
                      ]),
                      if (_selectedOption != null) ...<Widget>[
                        const SizedBox(height: AppSpacing.xs),
                        GlassPanel(accent: AppColors.cyan, padding: const EdgeInsets.all(AppSpacing.sm), child: Row(children: <Widget>[
                          VoxelItemIcon(itemId: _selectedOption!.outputItemId, size: 38),
                          const SizedBox(width: AppSpacing.sm),
                          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
                            Text(_selectedOption!.displayName, style: AppTypography.body.copyWith(fontWeight: FontWeight.w700)),
                            Text('${l10n.catalogDrop}: ${_selectedOption!.outputDisplayName} · ${_selectedOption!.outputItemId}', style: AppTypography.label.copyWith(color: AppColors.cyan), maxLines: 2, overflow: TextOverflow.ellipsis),
                          ])),
                        ])),
                      ] else ...<Widget>[
                        const SizedBox(height: AppSpacing.xs),
                        Text(l10n.catalogNotice, style: AppTypography.micro.copyWith(fontSize: 9, letterSpacing: 0, height: 1.4)),
                      ],
                      const SizedBox(height: AppSpacing.sm),
                      TextFormField(controller: _amount, keyboardType: TextInputType.number, scrollPadding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom + 48), inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.digitsOnly], decoration: InputDecoration(labelText: l10n.quantity, prefixIcon: const Icon(Icons.numbers_rounded), helperText: l10n.quantityRange), validator: (String? value) { final int? amount = int.tryParse(value ?? ''); return amount != null && amount >= 1 && amount <= 320 ? null : l10n.quantityRange; }),
                      const SizedBox(height: AppSpacing.sm),
                      if (bots.isEmpty) ...<Widget>[
                        EmptyState(title: l10n.noBots, message: l10n.createFirstBot, icon: Icons.smart_toy_outlined, action: NeonButton(label: l10n.addBot, icon: Icons.add_rounded, expanded: false, onPressed: () => context.go('/bots'))),
                      ] else DropdownButtonFormField<String>(
                        value: _botId,
                        isExpanded: true,
                        decoration: InputDecoration(labelText: l10n.assignedBot, prefixIcon: const Icon(Icons.smart_toy_outlined)),
                        items: bots.map((JsonMap bot) => DropdownMenuItem<String>(value: valueText(bot['id']), child: Text(valueText(bot['name'], fallback: valueText(bot['username'])), overflow: TextOverflow.ellipsis))).toList(growable: false),
                        onChanged: (String? value) => setState(() => _botId = value ?? ''),
                        validator: (String? value) => bots.any((JsonMap bot) => bot['id'] == value) ? null : l10n.selectBot,
                      ),
                    ])),
                    const SizedBox(height: AppSpacing.md),
                    NeonButton(label: l10n.continueLabel, icon: Icons.arrow_forward_rounded, onPressed: bots.isEmpty ? null : () { if (_formKey.currentState!.validate()) { FocusScope.of(context).unfocus(); setState(() => _step = 2); } }),
                  ]),
                ),
              ),
            )
          else
            SliverPadding(
              padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.page, 0, AppSpacing.page, 0),
              sliver: SliverToBoxAdapter(
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: <Widget>[
                  GlassPanel(accent: AppColors.green, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
                    Row(children: <Widget>[const Icon(Icons.fact_check_rounded, color: AppColors.green), const SizedBox(width: AppSpacing.sm), Expanded(child: Text(l10n.reviewTask, style: AppTypography.title))]),
                    const SizedBox(height: AppSpacing.md),
                    _ReviewLine(label: l10n.stepCategory, value: l10n.gathering),
                    _ReviewLine(label: l10n.selectBlock, value: _block.text.trim()),
                    if (_selectedOption != null) _ReviewLine(label: l10n.catalogDrop, value: '${_selectedOption!.outputDisplayName} · ${_selectedOption!.outputItemId}'),
                    if (_selectedOption == null) Padding(padding: const EdgeInsetsDirectional.only(start: AppSpacing.page, bottom: AppSpacing.xs), child: Text(l10n.catalogNotice, style: AppTypography.micro.copyWith(fontSize: 9, letterSpacing: 0, height: 1.4))),
                    _ReviewLine(label: l10n.quantity, value: _amount.text.trim()),
                    _ReviewLine(label: l10n.assignedBot, value: valueText(bots.where((JsonMap bot) => bot['id'] == _botId).firstOrNull?['name'], fallback: _botId)),
                    _ReviewLine(label: l10n.server, value: valueText(servers.where((JsonMap server) => server['id'] == bots.where((JsonMap bot) => bot['id'] == _botId).firstOrNull?['serverId']).firstOrNull?['name'], fallback: l10n.notAvailable)),
                    const SizedBox(height: AppSpacing.sm),
                    Text(l10n.taskFeatureBoundary, style: AppTypography.label.copyWith(height: 1.45)),
                    const SizedBox(height: AppSpacing.xs),
                    Text(l10n.noAutoExecution, style: AppTypography.label.copyWith(color: AppColors.amber, height: 1.45)),
                  ])),
                  const SizedBox(height: AppSpacing.md),
                  NeonButton(label: _saving ? l10n.saving : l10n.savePending, icon: Icons.queue_rounded, loading: _saving, onPressed: _saving ? null : _save),
                  const SizedBox(height: AppSpacing.xs),
                  OutlinedButton.icon(onPressed: () => setState(() => _step = 1), icon: const Icon(Icons.edit_outlined), label: Text(l10n.edit)),
                ]),
              ),
            ),
          SliverPadding(padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom + MediaQuery.viewInsetsOf(context).bottom + 92)),
        ],
      ),
    );
  }

  Future<void> _openBlockPicker() async {
    final AppLocalizations l10n = AppLocalizations.of(context);
    try {
      final List<MinecraftBlockOption> options = await _catalog;
      if (!mounted) return;
      final MinecraftBlockOption? selected = await showModalBottomSheet<MinecraftBlockOption>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (BuildContext context) => BlockPickerSheet(options: options, l10n: l10n),
      );
      if (selected != null && mounted) {
        FocusScope.of(context).unfocus();
        setState(() {
          _selectedOption = selected;
          _block.value = TextEditingValue(text: selected.blockId, selection: TextSelection.collapsed(offset: selected.blockId.length));
        });
      }
    } catch (error) {
      if (mounted) showFeedback(context, '${l10n.itemPicker}: $error', error: true);
    }
  }

  Future<void> _save() async {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final int? parsedCount = int.tryParse(_amount.text.trim());
    final bool valid = RegExp(r'^(?:minecraft:)?[a-z0-9_]{1,64}$').hasMatch(_block.text.trim())
        && parsedCount != null && parsedCount >= 1 && parsedCount <= 320
        && _botId.isNotEmpty;
    if (!valid) {
      setState(() => _step = 1);
      return;
    }
    setState(() => _saving = true);
    final String id = 'task-${DateTime.now().microsecondsSinceEpoch}';
    final int now = DateTime.now().millisecondsSinceEpoch;
    final int count = parsedCount;
    final JsonMap task = <String, dynamic>{
      'id': id,
      'name': '${l10n.gathering}: ${count} × ${_block.text.trim()}',
      'description': l10n.gatherDescription,
      'type': 'collect',
      'blockName': _block.text.trim().toLowerCase(),
      'count': count,
      'botId': _botId,
      'status': 'pending',
      'progress': 0,
      'verifiedCollected': 0,
      'source': 'manual',
      'priority': 'normal',
      'createdAt': now,
      'updatedAt': now,
    };
    try {
      final platform = ref.read(mineBotPlatformProvider);
      await platform.upsert('tasks', task);
      await platform.upsert('task_history', <String, dynamic>{'id': '$id-created', 'taskId': id, 'botId': _botId, 'status': 'PENDING', 'message': l10n.taskSavedPending, 'createdAt': now});
      refreshTable(ref, 'tasks');
      refreshTable(ref, 'task_history');
      if (mounted) {
        HapticFeedback.mediumImpact();
        showFeedback(context, l10n.taskSavedPending);
        context.go('/tasks');
      }
    } catch (error) {
      if (mounted) showFeedback(context, error.toString(), error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

class _StepIndicator extends StatelessWidget {
  const _StepIndicator({required this.step, required this.l10n});
  final int step;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final List<String> labels = <String>[l10n.stepCategory, l10n.stepTarget, l10n.stepReview];
    return Row(children: List<Widget>.generate(labels.length, (int index) => Expanded(child: Padding(padding: const EdgeInsetsDirectional.only(end: AppSpacing.xs), child: Column(children: <Widget>[
      AnimatedContainer(duration: AppMotion.standard, height: 4, decoration: BoxDecoration(color: index <= step ? AppColors.cyan : AppColors.surfaceRaised, borderRadius: BorderRadius.circular(AppRadius.pill), boxShadow: index == step ? AppShadows.glowCyan : null)),
      const SizedBox(height: 5),
      Text(labels[index], style: AppTypography.micro.copyWith(color: index == step ? AppColors.cyan : AppColors.textMuted, fontSize: 8, letterSpacing: 0), maxLines: 1, overflow: TextOverflow.ellipsis),
    ])))));
  }
}

class _Category {
  const _Category(this.key, this.label, this.icon, this.supported);
  final String key;
  final String label;
  final IconData icon;
  final bool supported;
}

class _ReviewLine extends StatelessWidget {
  const _ReviewLine({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[Expanded(child: Text(label, style: AppTypography.label)), const SizedBox(width: AppSpacing.sm), Flexible(child: Text(value, textAlign: TextAlign.end, style: AppTypography.body.copyWith(fontWeight: FontWeight.w600)))]));
}
