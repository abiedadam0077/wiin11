import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../platform/minebot_platform.dart';
import 'record_helpers.dart';

final mineBotPlatformProvider = Provider<MineBotPlatform>((Ref ref) => MineBotPlatform());

final tableRevisionProvider = StateProvider.family<int, String>((Ref ref, String table) => 0);

final recordsProvider = FutureProvider.family<List<JsonMap>, String>((Ref ref, String table) async {
  ref.watch(tableRevisionProvider(table));
  return ref.watch(mineBotPlatformProvider).records(table);
});

final engineStatusProvider = FutureProvider<JsonMap>((Ref ref) => ref.watch(mineBotPlatformProvider).engineStatus());

final engineEventsProvider = StreamProvider<JsonMap>((Ref ref) => ref.watch(mineBotPlatformProvider).events);

void refreshTable(WidgetRef ref, String table) {
  ref.read(tableRevisionProvider(table).notifier).state++;
}

void refreshBotData(WidgetRef ref) {
  for (final String table in <String>['bots', 'bot_states', 'servers', 'tasks', 'logs', 'task_history', 'skins']) {
    refreshTable(ref, table);
  }
}

void refreshForEngineEvent(WidgetRef ref, JsonMap event) {
  final String type = (event['type'] ?? '').toString();
  if (type == 'engine_state') {
    ref.invalidate(engineStatusProvider);
    return;
  }
  if (<String>{'bot_snapshot', 'bot_state', 'bot_error', 'chat_received', 'player', 'entity', 'world'}.contains(type)) {
    refreshTable(ref, 'bot_states');
    if (<String>{'bot_state', 'bot_error'}.contains(type)) refreshTable(ref, 'logs');
  }
  if (<String>{'task_state', 'task_progress'}.contains(type)) {
    refreshTable(ref, 'tasks');
    refreshTable(ref, 'task_history');
  }
  if (<String>{'behavior', 'command_result'}.contains(type)) refreshTable(ref, 'logs');
}
