import 'dart:convert';

import 'package:flutter/services.dart';

class MinecraftBlockOption {
  const MinecraftBlockOption({required this.blockId, required this.displayName, required this.category, required this.outputItemId, required this.outputDisplayName});

  final String blockId;
  final String displayName;
  final String category;
  final String outputItemId;
  final String outputDisplayName;

  factory MinecraftBlockOption.fromJson(Map<String, dynamic> json) => MinecraftBlockOption(
        blockId: (json['blockName'] ?? '').toString(),
        displayName: (json['displayName'] ?? '').toString(),
        category: (json['category'] ?? 'other').toString(),
        outputItemId: (json['outputItemName'] ?? '').toString(),
        outputDisplayName: (json['outputDisplayName'] ?? '').toString(),
      );
}

class MinecraftCollectCatalog {
  MinecraftCollectCatalog._();

  static const String version = '1.21.4';
  static Future<List<MinecraftBlockOption>>? _cache;

  static Future<List<MinecraftBlockOption>> load() {
    return _cache ??= _load();
  }

  static Future<List<MinecraftBlockOption>> _load() async {
    final String raw = await rootBundle.loadString('assets/minecraft/collect_targets_1.21.4.json');
    final dynamic decoded = jsonDecode(raw);
    if (decoded is! Map || decoded['targets'] is! List) throw const FormatException('Invalid Minecraft collection catalogue.');
    return (decoded['targets'] as List)
        .whereType<Map>()
        .map((Map value) => MinecraftBlockOption.fromJson(Map<String, dynamic>.from(value)))
        .where((MinecraftBlockOption item) => item.blockId.startsWith('minecraft:') && item.outputItemId.isNotEmpty)
        .toList(growable: false);
  }
}
