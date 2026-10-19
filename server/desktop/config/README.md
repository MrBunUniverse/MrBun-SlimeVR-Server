# Portable Configuration Sentinel

> This file designates the SlimeVR desktop server daemon to operate in portable configuration mode.

### Behavior

When this file is present within the `config/` directory:
* The server daemon stores and loads runtime settings (`vrconfig.yml`) locally alongside the server binary rather than in the user's global system configuration directory (`~/Library/Application Support/` on macOS or `%APPDATA%` on Windows).
* Enables fully self-contained, isolated development and multi-instance testing without polluting host system state.
