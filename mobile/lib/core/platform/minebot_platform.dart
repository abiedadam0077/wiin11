import 'dart:async';
import 'dart:convert';

import 'package:flutter/services.dart';

import '../data/record_helpers.dart';

/// Strict typed boundary to Android's local SQLite, Android Keystore, and the
/// foreground Minecraft service. No web view or browser backend is involved.
class MineBotPlatform {
  MineBotPlatform({MethodChannel? methods, EventChannel? events})
      : _methods = methods ?? const MethodChannel('com.minebot.ai/native'),
        _events = events ?? const EventChannel('com.minebot.ai/events');

  final MethodChannel _methods;
  final EventChannel _events;

  Stream<JsonMap> get events => _events.receiveBroadcastStream().map((dynamic event) {
        if (event is Map) return Map<String, dynamic>.from(event);
        return <String, dynamic>{};
      });

  Future<List<JsonMap>> records(String table) async {
    final String raw = await _methods.invokeMethod<String>(
          'readRecords',
          <String, Object?>{'table': table},
        ) ??
        '[]';
    final dynamic decoded = jsonDecode(raw);
    if (decoded is! List) return const <JsonMap>[];
    return decoded.whereType<Map>().map((Map item) => Map<String, dynamic>.from(item)).toList(growable: false);
  }

  Future<void> upsert(String table, JsonMap record) async {
    final String response = await _methods.invokeMethod<String>(
          'upsertRecord',
          <String, Object?>{'table': table, 'json': jsonEncode(record)},
        ) ??
        '{"ok":false}';
    final dynamic decoded = jsonDecode(response);
    if (decoded is Map && decoded['ok'] != true) {
      throw StateError((decoded['error'] ?? 'Local storage operation failed').toString());
    }
  }

  Future<void> remove(String table, String id) async {
    final String response = await _methods.invokeMethod<String>(
          'removeRecord',
          <String, Object?>{'table': table, 'id': id},
        ) ??
        '{"ok":false}';
    final dynamic decoded = jsonDecode(response);
    if (decoded is Map && decoded['ok'] != true) {
      throw StateError((decoded['error'] ?? 'Local storage operation failed').toString());
    }
  }

  Future<void> clearTable(String table) async {
    final String response = await _methods.invokeMethod<String>('clearRecords', <String, Object?>{'table': table}) ?? '{"ok":false}';
    final dynamic decoded = jsonDecode(response);
    if (decoded is Map && decoded['ok'] != true) {
      throw StateError((decoded['error'] ?? 'Local storage operation failed').toString());
    }
  }

  Future<int> countRecords(String table) async => await _methods.invokeMethod<int>('countRecords', <String, Object?>{'table': table}) ?? 0;

  Future<JsonMap> engineStatus() async => Map<String, dynamic>.from(await _methods.invokeMapMethod<String, dynamic>('getEngineStatus') ?? const <String, dynamic>{});

  Future<void> connectBot(String botId) => _methods.invokeMethod<void>('connectBot', <String, Object?>{'botId': botId});

  Future<void> disconnectBot(String botId) => _methods.invokeMethod<void>('disconnectBot', <String, Object?>{'botId': botId});

  Future<void> reconnectBot(String botId) => _methods.invokeMethod<void>('reconnectBot', <String, Object?>{'botId': botId});

  Future<void> stopAllBots() => _methods.invokeMethod<void>('stopAllBots');

  Future<void> sendCommand(JsonMap command) => _methods.invokeMethod<void>(
        'sendCommand',
        <String, Object?>{'json': jsonEncode(command)},
      );

  Future<JsonMap> pingServer(String host, int port) async => Map<String, dynamic>.from(
        await _methods.invokeMapMethod<String, dynamic>(
              'pingServer',
              <String, Object?>{'host': host, 'port': port},
            ) ??
            const <String, dynamic>{},
      );

  Future<bool> hasApiKey() async => await _methods.invokeMethod<bool>('hasApiKey') ?? false;

  /// The key crosses the in-process platform channel only to be encrypted by
  /// Android Keystore. It is never read back into Dart or included in events.
  Future<void> saveApiKey(String key) => _methods.invokeMethod<void>('saveApiKey', <String, Object?>{'key': key});

  Future<void> clearApiKey() => _methods.invokeMethod<void>('clearApiKey');

  Future<List<JsonMap>> discoverFreeModels() async {
    final String raw = await _methods.invokeMethod<String>('discoverFreeModels') ?? '[]';
    final dynamic decoded = jsonDecode(raw);
    if (decoded is! List) return const <JsonMap>[];
    return decoded.whereType<Map>().map((Map item) => Map<String, dynamic>.from(item)).toList(growable: false);
  }

  Future<JsonMap> createPlan({required String prompt, required String model, required List<JsonMap> models}) async {
    final String raw = await _methods.invokeMethod<String>(
          'createPlan',
          <String, Object?>{
            'prompt': prompt,
            'model': model,
            'modelsJson': jsonEncode(models),
          },
        ) ??
        '{}';
    return Map<String, dynamic>.from(jsonDecode(raw) as Map);
  }

  Future<Object?> getPreference(String key) => _methods.invokeMethod<Object?>('getPreference', <String, Object?>{'key': key});

  Future<void> setPreference(String key, Object value) => _methods.invokeMethod<void>(
        'setPreference',
        <String, Object?>{'key': key, 'value': value},
      );

  Future<void> requestNotificationPermission() => _methods.invokeMethod<void>('requestNotificationPermission');

  Future<void> openExternalUrl(String url) => _methods.invokeMethod<void>('openExternalUrl', <String, Object?>{'url': url});
}
