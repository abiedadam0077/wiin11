import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/generated/app_localizations.dart';
import '../theme/app_design_system.dart';
import 'visuals.dart';

Widget asyncContent<T>(
  BuildContext context,
  AsyncValue<T> value, {
  required Widget Function(T value) data,
  VoidCallback? onRetry,
}) =>
    value.when(
      loading: () => const Padding(padding: EdgeInsets.all(AppSpacing.xl), child: LoadingState()),
      error: (Object error, StackTrace stack) => EmptyState(
        title: AppLocalizations.of(context).errorTitle,
        message: error.toString(),
        icon: Icons.cloud_off_rounded,
        action: onRetry == null
            ? null
            : TextButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh_rounded), label: Text(AppLocalizations.of(context).retry)),
      ),
      data: data,
    );

void showFeedback(BuildContext context, String message, {bool error = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(message),
        behavior: SnackBarBehavior.floating,
        backgroundColor: error ? const Color(0xFF742944) : AppColors.surfaceRaised,
        showCloseIcon: true,
      ),
    );
}
