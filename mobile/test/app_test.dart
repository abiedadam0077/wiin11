import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:minebot_ai/app.dart';
import 'package:minebot_ai/core/data/providers.dart';
import 'package:minebot_ai/core/data/record_helpers.dart';
import 'package:minebot_ai/core/localization/locale_provider.dart';
import 'package:minebot_ai/core/platform/minebot_platform.dart';
import 'package:minebot_ai/core/routing/app_router.dart';

class _FakePlatform extends MineBotPlatform {
  final Map<String, List<JsonMap>> tables = <String, List<JsonMap>>{};

  @override
  Stream<JsonMap> get events => const Stream<JsonMap>.empty();

  @override
  Future<List<JsonMap>> records(String table) async => List<JsonMap>.from(tables[table] ?? const <JsonMap>[]);

  @override
  Future<void> upsert(String table, JsonMap record) async {
    final List<JsonMap> rows = tables.putIfAbsent(table, () => <JsonMap>[]);
    rows.removeWhere((JsonMap row) => row['id'] == record['id']);
    rows.add(Map<String, dynamic>.from(record));
  }

  @override
  Future<void> remove(String table, String id) async => tables[table]?.removeWhere((JsonMap row) => row['id'] == id);

  @override
  Future<void> clearTable(String table) async => tables[table]?.clear();

  @override
  Future<int> countRecords(String table) async => tables[table]?.length ?? 0;

  @override
  Future<JsonMap> engineStatus() async => <String, dynamic>{'status': 'STOPPED', 'runtime': '', 'reason': ''};

  @override
  Future<void> connectBot(String botId) async {}

  @override
  Future<void> disconnectBot(String botId) async {}

  @override
  Future<void> reconnectBot(String botId) async {}

  @override
  Future<void> stopAllBots() async {}

  @override
  Future<void> sendCommand(JsonMap command) async {}

  @override
  Future<JsonMap> pingServer(String host, int port) async => <String, dynamic>{};

  @override
  Future<bool> hasApiKey() async => false;

  @override
  Future<void> saveApiKey(String key) async {}

  @override
  Future<void> clearApiKey() async {}

  @override
  Future<List<JsonMap>> discoverFreeModels() async => const <JsonMap>[];

  @override
  Future<JsonMap> createPlan({required String prompt, required String model, required List<JsonMap> models}) async => <String, dynamic>{'action': 'unsupported'};

  @override
  Future<Object?> getPreference(String key) async => false;

  @override
  Future<void> setPreference(String key, Object value) async {}

  @override
  Future<void> requestNotificationPermission() async {}

  @override
  Future<void> openBatterySettings() async {}

  @override
  Future<void> openExternalUrl(String url) async {}
}

Widget _app({Locale locale = const Locale('en'), String initialLocation = '/dashboard', _FakePlatform? platform}) {
  final _FakePlatform activePlatform = platform ?? _FakePlatform();
  return ProviderScope(
    overrides: [
      mineBotPlatformProvider.overrideWith((Ref ref) => activePlatform),
      localeProvider.overrideWith((Ref ref) => locale),
      appRouterProvider.overrideWith((Ref ref) {
        final router = createAppRouter(initialLocation: initialLocation);
        ref.onDispose(router.dispose);
        return router;
      }),
    ],
    child: const MineBotApp(),
  );
}

void _setPhoneSize(WidgetTester tester) {
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues(<String, Object>{'minebot_locale': 'en'}));

  testWidgets('dashboard shows only local records and five main destinations', (WidgetTester tester) async {
    _setPhoneSize(tester);
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();

    expect(find.text('MineBot AI'), findsOneWidget);
    expect(find.text('Quick actions'), findsOneWidget);
    expect(find.text('Home'), findsOneWidget);
    expect(find.text('Bots'), findsOneWidget);
    expect(find.text('Tasks'), findsOneWidget);
    expect(find.text('Servers'), findsNWidgets(2));
    expect(find.text('Settings'), findsOneWidget);
    expect(find.text('0'), findsWidgets);
    expect(find.text('Online'), findsNothing);
  });

  testWidgets('all five navigation branches remain reachable', (WidgetTester tester) async {
    _setPhoneSize(tester);
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();

    await tester.tap(find.text('Bots').last);
    await tester.pumpAndSettle();
    expect(find.text('Bot network'), findsOneWidget);

    await tester.tap(find.text('Tasks').last);
    await tester.pumpAndSettle();
    expect(find.text('Mission control'), findsOneWidget);

    await tester.tap(find.text('Servers').last);
    await tester.pumpAndSettle();
    expect(find.text('Server grid'), findsOneWidget);

    await tester.tap(find.text('Settings').last);
    await tester.pumpAndSettle();
    expect(find.text('System settings'), findsWidgets);

    await tester.tap(find.text('Home').last);
    await tester.pumpAndSettle();
    expect(find.text('Quick actions'), findsOneWidget);
  });

  testWidgets('Arabic is right-to-left and can be changed to French', (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues(<String, Object>{'minebot_locale': 'ar'});
    _setPhoneSize(tester);
    await tester.pumpWidget(_app(locale: const Locale('ar')));
    await tester.pumpAndSettle();
    expect(Directionality.of(tester.element(find.byType(Scaffold).first)), TextDirection.rtl);
    expect(find.text('لوحة التحكم بعالمك'), findsOneWidget);

    await tester.tap(find.text('الإعدادات').last);
    await tester.pumpAndSettle();
    final Finder french = find.text('Français');
    await tester.ensureVisible(french);
    await tester.tap(french);
    await tester.pumpAndSettle();
    expect(find.text('Réglages système'), findsWidgets);
  });

  testWidgets('task builder labels non-wired categories instead of enabling them', (WidgetTester tester) async {
    _setPhoneSize(tester);
    await tester.pumpWidget(_app(initialLocation: '/tasks/create'));
    await tester.pumpAndSettle();
    expect(find.text('Supported · collect_block'), findsOneWidget);
    expect(find.text('Coming soon'), findsWidgets);
    expect(find.text('Combat'), findsOneWidget);
    expect(find.text('Gathering'), findsOneWidget);
  });

  testWidgets('block picker searches real 1.21.4 metadata and shows the different stone drop', (WidgetTester tester) async {
    final _FakePlatform platform = _FakePlatform();
    platform.tables['bots'] = <JsonMap>[<String, dynamic>{'id': 'bot-1', 'name': 'Miner'}];
    _setPhoneSize(tester);
    await tester.pumpWidget(_app(platform: platform, initialLocation: '/tasks/create'));
    await tester.pumpAndSettle();

    final Finder continueButton = find.text('Continue');
    await tester.ensureVisible(continueButton);
    await tester.pumpAndSettle();
    await tester.tap(continueButton);
    await tester.pumpAndSettle();
    final Finder pickerButton = find.byTooltip('Choose a block');
    await tester.ensureVisible(pickerButton);
    await tester.pumpAndSettle();
    await tester.tap(pickerButton);
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, 'minecraft:stone');
    await tester.pumpAndSettle();
    expect(find.text('Stone'), findsOneWidget);
    expect(find.text('minecraft:stone'), findsWidgets);
    final Finder stoneOption = find.text('Stone');
    await tester.ensureVisible(stoneOption);
    await tester.tap(stoneOption);
    await tester.pumpAndSettle();
    expect(find.textContaining('cobblestone'), findsWidgets);
  });

  testWidgets('inventory screen refuses to render empty slots when slot data is unavailable', (WidgetTester tester) async {
    final _FakePlatform platform = _FakePlatform();
    final int now = DateTime.now().millisecondsSinceEpoch;
    platform.tables['bots'] = <JsonMap>[<String, dynamic>{'id': 'bot-1', 'name': 'Miner'}];
    platform.tables['bot_states'] = <JsonMap>[<String, dynamic>{'id': 'bot-1', 'botId': 'bot-1', 'status': 'ONLINE', 'type': 'bot_snapshot', 'observedAt': now, 'inventoryAvailable': false}];
    _setPhoneSize(tester);
    await tester.pumpWidget(_app(platform: platform, initialLocation: '/bots/bot-1/inventory'));
    await tester.pumpAndSettle();

    expect(find.text('Bot telemetry arrived, but the engine did not provide inventory slots. An empty grid will not be shown as real inventory.'), findsOneWidget);
    expect(find.textContaining('/36'), findsNothing);
    expect(find.byType(GridView), findsNothing);
  });

  testWidgets('inventory-full task cards show the actual drop and pause reason', (WidgetTester tester) async {
    final _FakePlatform platform = _FakePlatform();
    final int now = DateTime.now().millisecondsSinceEpoch;
    platform.tables['bots'] = <JsonMap>[
      <String, dynamic>{'id': 'bot-1', 'name': 'Miner', 'serverId': 'server-1'},
    ];
    platform.tables['servers'] = <JsonMap>[
      <String, dynamic>{'id': 'server-1', 'name': 'Test server'},
    ];
    platform.tables['bot_states'] = <JsonMap>[
      <String, dynamic>{'id': 'bot-1', 'botId': 'bot-1', 'status': 'ONLINE', 'type': 'bot_snapshot', 'observedAt': now},
    ];
    platform.tables['tasks'] = <JsonMap>[
      <String, dynamic>{
        'id': 'task-1', 'name': 'Collect dirt', 'type': 'collect', 'blockName': 'minecraft:grass_block',
        'outputItemName': 'dirt', 'count': 20, 'verifiedCollected': 8, 'progress': 40,
        'botId': 'bot-1', 'status': 'paused', 'stage': 'INVENTORY_FULL', 'runtimePriority': 'INVENTORY_FULL',
        'durationMs': 9500, 'currentAction': 'Free a slot, then resume.', 'lastReason': 'Minecraft inventory has no empty slot.',
        'updatedAt': now,
      },
    ];
    _setPhoneSize(tester);
    await tester.pumpWidget(_app(platform: platform, initialLocation: '/tasks'));
    await tester.pumpAndSettle();

    expect(find.text('Inventory full'), findsOneWidget);
    expect(find.textContaining('8/20'), findsOneWidget);
    expect(find.textContaining('dirt'), findsWidgets);
    expect(find.text('Minecraft inventory has no empty slot.'), findsOneWidget);
    expect(find.textContaining('9s'), findsOneWidget);
  });

  testWidgets('AI planner explains approval boundary without creating a task', (WidgetTester tester) async {
    _setPhoneSize(tester);
    await tester.pumpWidget(_app(initialLocation: '/tasks/planner'));
    await tester.pumpAndSettle();
    expect(find.textContaining('AI never sends a game command directly'), findsOneWidget);
    expect(find.text('Add an OpenRouter key to discover models.'), findsWidgets);
    expect(find.text('Approve and save'), findsNothing);
  });
}
