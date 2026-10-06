# Third-party notices

The Android application uses Android platform APIs and bundles the following runtime components through the pinned Android build:

- Node.js Mobile Android runtime `24.20.0-0` (MIT for Node.js Mobile changes and upstream Node.js; the runtime archive also contains applicable Node.js bundled-component notices).
- Mineflayer `4.39.0` (MIT).
- mineflayer-pathfinder `2.4.5` (MIT).
- mineflayer-auto-eat `5.0.3` (MIT).
- Transitive Node.js packages listed in `engine/package-lock.json`; their licenses and notices must be included in any redistributable binary as required by their respective packages.
- Robolectric `4.14.1` and JUnit `4.13.2` are test-only dependencies and are not packaged in the APK.

The Android APK contains no WebView-based UI or web preview assets. Check upstream license files and the Node.js Mobile archive notices when preparing any public/production release; this file is not a substitute for a full generated license inventory.
