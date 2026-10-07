import 'package:flutter_test/flutter_test.dart';

import 'package:minebot_ai/core/data/record_helpers.dart';

void main() {
  test('only a recent ONLINE bot_snapshot counts as a live in-world session', () {
    final int now = DateTime.now().millisecondsSinceEpoch;
    final JsonMap fresh = <String, dynamic>{'status': 'ONLINE', 'type': 'bot_snapshot', 'observedAt': now};
    final JsonMap stale = <String, dynamic>{'status': 'ONLINE', 'type': 'bot_snapshot', 'observedAt': now - const Duration(seconds: 45).inMilliseconds};
    final JsonMap transition = <String, dynamic>{'status': 'ONLINE', 'type': 'bot_state', 'at': now};

    expect(isFreshSnapshot(fresh), isTrue);
    expect(liveBotStatus(fresh), 'ONLINE');
    expect(isFreshSnapshot(stale), isFalse);
    expect(liveBotStatus(stale), 'STALE');
    expect(isFreshSnapshot(transition), isFalse);
    expect(liveBotStatus(transition), 'STALE');
  });

  test('timestamps and task terminal states stay data-derived', () {
    expect(timestampMillis(<String, dynamic>{'observedAt': 42}), 42);
    expect(timestampMillis(<String, dynamic>{'createdAt': 18}), 18);
    expect(isTerminalTask('completed'), isTrue);
    expect(isTerminalTask('cancelled'), isTrue);
    expect(isTerminalTask('pending'), isFalse);
    expect(isTerminalTask('interrupted'), isFalse);
  });
}
