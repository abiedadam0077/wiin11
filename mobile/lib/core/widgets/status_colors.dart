import 'package:flutter/material.dart';

import '../../l10n/generated/app_localizations.dart';
import '../theme/app_design_system.dart';

({String label, Color color, bool pulse}) statusPresentation(AppLocalizations l10n, String status) {
  switch (status.toUpperCase()) {
    case 'ONLINE':
      return (label: l10n.online, color: AppColors.green, pulse: true);
    case 'CONNECTING':
      return (label: l10n.connecting, color: AppColors.cyan, pulse: true);
    case 'AUTHENTICATING':
      return (label: l10n.authenticating, color: AppColors.blue, pulse: true);
    case 'JOINING':
      return (label: l10n.joining, color: AppColors.blue, pulse: true);
    case 'RECONNECTING':
      return (label: l10n.reconnecting, color: AppColors.amber, pulse: true);
    case 'FAILED':
      return (label: l10n.failed, color: AppColors.red, pulse: false);
    case 'DEAD':
      return (label: l10n.dead, color: AppColors.red, pulse: false);
    case 'STALE':
      return (label: l10n.stale, color: AppColors.amber, pulse: false);
    case 'STATUS_REACHABLE':
      return (label: l10n.reachable, color: AppColors.green, pulse: false);
    case 'STATUS_FAILED':
      return (label: l10n.unreachable, color: AppColors.red, pulse: false);
    default:
      return (label: l10n.offline, color: AppColors.textMuted, pulse: false);
  }
}
