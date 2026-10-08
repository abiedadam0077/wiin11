# Third-party notices

The Android build contains the Flutter engine and Flutter/Dart packages resolved by `pubspec.lock` (Flutter SDK/localizations, Riverpod, GoRouter, `intl`, `file_picker`, `path_provider`, `shared_preferences`, and transitive dependencies). Use `flutter pub licenses` to produce the full notice inventory for a redistributable build; this hand-maintained summary is not a substitute for each package's full license.

The embedded Node.js/Mineflayer runtime and dependencies include:

- Node.js Mobile Android runtime `24.20.0-0` (Node.js Mobile and upstream Node.js licenses, plus the notices distributed in the pinned runtime archive).
- Mineflayer `4.39.0`, mineflayer-pathfinder `2.4.5`, mineflayer-auto-eat `5.0.3`, mineflayer-collectblock `1.6.0`, and mineflayer-tool `1.2.0` (MIT; verify upstream license files when redistributing).
- `minecraft-data` `3.117.0`. Its Minecraft `1.21.4` block/drop identifiers are used only for picker suggestions in `assets/minecraft/collect_targets_1.21.4.json`; the generator is `engine/scripts/generate-collect-targets.js`. TaskEngine always validates against the connected server data. The package code is published under MIT, but upstream notes that some dataset records have other source provenance (including wiki-derived data); review upstream notices and source licensing before redistributing the dataset. This project includes no Minecraft textures, skins, models, or other Mojang game graphics.
- Transitive Node packages resolved in `engine/package-lock.json`; retain their required notices for redistribution.
- Robolectric `4.14.1` and JUnit `4.13.2` are test-only dependencies, not packaged into the application.

The UI is Flutter/Dart with a narrow native Android bridge; it does not use a WebView or include a web-rendered game preview. Before any public/production distribution, regenerate and audit the Flutter and Node license inventories and include all required notices.
