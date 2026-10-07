import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

final localeProvider = StateProvider<Locale>((Ref ref) => const Locale('ar'));

Future<void> persistLocale(WidgetRef ref, String languageCode) async {
  final Locale locale = Locale(languageCode);
  ref.read(localeProvider.notifier).state = locale;
  final SharedPreferences preferences = await SharedPreferences.getInstance();
  await preferences.setString('minebot_locale', languageCode);
}

Future<Locale> readSavedLocale() async {
  final SharedPreferences preferences = await SharedPreferences.getInstance();
  final String? saved = preferences.getString('minebot_locale');
  if (const <String>{'ar', 'en', 'fr'}.contains(saved)) return Locale(saved!);
  return const Locale('ar');
}
