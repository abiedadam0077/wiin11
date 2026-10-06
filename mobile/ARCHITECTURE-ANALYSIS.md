# Native Android architecture and verification boundary

The legacy WebView shell, bridge, HTML/CSS/JavaScript UI, web preview server, and generated source ZIP have been removed from `mobile/`. The native APK source now contains no `android.webkit` references or embedded web UI.

## App and engine boundary

1. `MainActivity` is a native Android Activity built from Android Views. It owns native Arabic navigation, local CRUD forms, server-status ping UI, bot controls, AI planner, and observed state screens.
2. `DatabaseStore` owns local SQLite records. `SecureStore` encrypts the OpenRouter key with AES-GCM and keeps its key in Android Keystore.
3. `BotEngineService` is a foreground Android service. It embeds a pinned Node.js Mobile runtime via JNI and communicates with the Node worker through a one-client loopback TCP socket authenticated by a random per-process token.
4. `mobile/engine/main.js` runs Mineflayer and forwards only JSON events/commands over that loopback channel. Bot state, inventory, vitals, and task progress come from Minecraft events; stale snapshots are not treated as live by the UI.
5. `BotManager` owns protocol sessions, explicit connection lifecycle, reconnection, action validation, navigation and the bounded collection task. `BehaviorEngine` handles survival/emergency priority independently of the task loop. Task completion requires an inventory delta.
6. `OpenRouterClient` performs HTTPS model discovery/planning. AI output is constrained to one collect proposal or unsupported; user acceptance saves a pending task, then the task engine validates and executes it. AI cannot send Minecraft commands.

## Native build

- Android: Java 17 source, min SDK 26, target/compile SDK 35, application ID `com.minebot.ai`.
- ABIs: `arm64-v8a` and `x86_64`.
- Node.js Mobile: `24.20.0-0`, pinned in CI and SHA-256 checked before copying `libnode.so` and headers.
- Minecraft dependencies: Mineflayer `4.39.0`, Pathfinder `2.4.5`, AutoEat `5.0.3`.
- CI runs Node unit tests, Robolectric tests, and creates debug plus debug-certificate-signed release APKs. The latter is only for testing, not Play Store distribution.

## Verification boundary

Node unit tests use protocol/session mocks; they do not prove external server login. The Android tests cover SQLite persistence, native AI-output constraints, a native screen, and a local TCP Minecraft Status handshake. CI run [37541446115](https://github.com/abiedadam0077/wiin11/actions/runs/37541446115) succeeded on 2026-10-06, including unit tests and debug/release APK assembly; the artifacts are in [native release #12](https://github.com/abiedadam0077/wiin11/releases/tag/minebot-ai-native-build-12). This verifies compilation, not on-device JNI runtime startup or Minecraft play. A physical/emulated device plus authorized Java test server is still required to validate OAuth, full login/spawn, background policy, and gameplay. Never infer an ONLINE status from a successful Status Ping or stale database row.
