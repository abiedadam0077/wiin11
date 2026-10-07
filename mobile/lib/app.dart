import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/localization/locale_provider.dart';
import 'core/routing/app_router.dart';
import 'core/theme/app_design_system.dart';
import 'core/widgets/app_shell.dart';
import 'l10n/generated/app_localizations.dart';

class MineBotApp extends ConsumerStatefulWidget {
  const MineBotApp({super.key});

  @override
  ConsumerState<MineBotApp> createState() => _MineBotAppState();
}

class _MineBotAppState extends ConsumerState<MineBotApp> {
  @override
  void initState() {
    super.initState();
    unawaited(_restoreLocale());
  }

  Future<void> _restoreLocale() async {
    try {
      final Locale saved = await readSavedLocale();
      if (mounted) ref.read(localeProvider.notifier).state = saved;
    } catch (_) {
      // Arabic is the safe built-in fallback if local preferences are unavailable.
    }
  }

  @override
  Widget build(BuildContext context) {
    final Locale locale = ref.watch(localeProvider);
    final router = ref.watch(appRouterProvider);
    return MaterialApp.router(
      title: 'MineBot AI',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      darkTheme: buildAppTheme(),
      themeMode: ThemeMode.dark,
      locale: locale,
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      routerConfig: router,
      builder: (BuildContext context, Widget? child) => EngineEventObserver(
        child: child ?? const SizedBox.shrink(),
      ),
    );
  }
}
