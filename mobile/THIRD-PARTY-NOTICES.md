# Third-party notices

## Runtime Android app

The Android application source uses Android platform APIs (WebView, SQLite, Android Keystore, notifications) and does not bundle third-party runtime libraries.

## Development and tests

- `esbuild` — MIT License. Used only to bundle the local web UI.
- `happy-dom` — MIT License. Used only by automated UI tests.
- Node.js built-in `node:sqlite`, `node:http`, and `node:net` are used by the local preview/test server.

See package metadata and upstream project notices for the full license texts. These development tools are not shipped in the Android APK.
