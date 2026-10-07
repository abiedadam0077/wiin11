typedef JsonMap = Map<String, dynamic>;

JsonMap asJsonMap(Object? value) => value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

String valueText(Object? value, {String fallback = ''}) {
  if (value == null) return fallback;
  final String result = value.toString().trim();
  return result.isEmpty ? fallback : result;
}

double? finiteNumber(Object? value) {
  if (value is! num) return null;
  final double result = value.toDouble();
  return result.isFinite ? result : null;
}

int? finiteInt(Object? value) {
  final double? result = finiteNumber(value);
  return result == null ? null : result.round();
}

int timestampMillis(JsonMap row, [String key = 'observedAt']) {
  final int? direct = finiteInt(row[key]);
  if (direct != null && direct > 0) return direct;
  final int? fallback = finiteInt(row['at'] ?? row['updatedAt'] ?? row['createdAt']);
  return fallback ?? 0;
}

bool isFreshSnapshot(JsonMap? state, {Duration maxAge = const Duration(seconds: 20)}) {
  if (state == null || state['status'] != 'ONLINE' || state['type'] != 'bot_snapshot') return false;
  final int observedAt = timestampMillis(state);
  final int age = DateTime.now().millisecondsSinceEpoch - observedAt;
  return observedAt > 0 && age >= -2_000 && age <= maxAge.inMilliseconds;
}

String liveBotStatus(JsonMap? state) {
  if (state == null) return 'DISCONNECTED';
  final String status = valueText(state['status'], fallback: 'DISCONNECTED').toUpperCase();
  if (status == 'ONLINE' && !isFreshSnapshot(state)) return 'STALE';
  return status;
}

bool isTerminalTask(String status) => const <String>{'completed', 'failed', 'cancelled'}.contains(status.toLowerCase());

String formatDuration(Object? milliseconds) {
  final int? value = finiteInt(milliseconds);
  if (value == null || value < 0) return '—';
  final Duration duration = Duration(milliseconds: value);
  if (duration.inHours > 0) return '${duration.inHours}h ${(duration.inMinutes % 60).toString().padLeft(2, '0')}m';
  if (duration.inMinutes > 0) return '${duration.inMinutes}m ${(duration.inSeconds % 60).toString().padLeft(2, '0')}s';
  return '${duration.inSeconds}s';
}

String formatPosition(Object? raw) {
  final JsonMap position = asJsonMap(raw);
  if (position.isEmpty) return '—';
  final double? x = finiteNumber(position['x']);
  final double? y = finiteNumber(position['y']);
  final double? z = finiteNumber(position['z']);
  if (x == null || y == null || z == null) return '—';
  return 'X ${x.toStringAsFixed(1)} · Y ${y.toStringAsFixed(1)} · Z ${z.toStringAsFixed(1)}';
}

String taskStatusKey(String status) {
  switch (status.toLowerCase()) {
    case 'running':
      return 'tabActive';
    case 'pending':
    case 'interrupted':
      return 'tabQueued';
    case 'paused':
      return 'tabWaiting';
    case 'completed':
      return 'tabCompleted';
    case 'failed':
    case 'cancelled':
      return 'tabFailed';
    default:
      return 'tabWaiting';
  }
}
