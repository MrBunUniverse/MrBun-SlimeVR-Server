# SJ SlimeVR Server

A personal fork of the [SlimeVR server](https://github.com/SlimeVR/SlimeVR-Server) for full-body tracking. It has a redesigned desktop app, some tracker reliability changes, and tools for using a Meta Quest with VRChat.

**This is an early work in progress.** Things are unfinished and change often. It is only tested on macOS. It is not an official SlimeVR release and is not affiliated with the SlimeVR team.

## What's in the repo

| Folder | What it is |
| :--- | :--- |
| `server/` | The tracking server, written in Kotlin. It takes tracker data over UDP and sends out poses and OSC. |
| `gui/` | The desktop app, built with Electron, React and TypeScript. |
| `solarxr-protocol/` | The message format between the server and the app. A submodule, from [SJ-SolarXR-Protocol](https://github.com/MrBunUniverse/SJ-SolarXR-Protocol). |
| `bindings-provider/` | OpenVR bindings. |
| `docs/` | Notes and guides. Start at [`docs/README.md`](docs/README.md). |

## What's different from upstream

- A new desktop interface.
- Tracker reconnect handling and drift compensation.
- Meta Quest and VRChat OSC tools.
- More tests.

Still missing: Windows and Linux testing, installers, and more polish. See the [changelog](CHANGELOG.md) for details.

## Setup

You need JDK 17 or newer, Node.js 22 (see `.node-version`), and [pnpm](https://pnpm.io).

```bash
git clone --recurse-submodules https://github.com/MrBunUniverse/SJ-SlimeVR-Server-Custom.git
cd SJ-SlimeVR-Server-Custom
pnpm install
```

On macOS, you can start and stop everything with:

```bash
./scripts/"Launch SlimeVR.command"
./scripts/"Stop SlimeVR.command"
```

## Development

```bash
./gradlew :server:desktop:shadowJar   # build the server
./gradlew :server:core:test           # run server tests
cd gui && pnpm run lint               # type check, lint, formatting
cd gui && pnpm test                   # run app tests (Node 22)
cd gui && pnpm run gui                # run the app in development mode
```

See the [contributing guide](docs/CONTRIBUTING.md) for more.

## Credits and license

Based on the work of the [SlimeVR](https://slimevr.dev) project and its contributors. SlimeVR is a trademark of its owners; see [docs/TRADEMARK.md](docs/TRADEMARK.md).

The root [LICENSE](LICENSE) is Apache 2.0. Server code is MIT, and new contributions are licensed under both, as upstream does. Details are in [`docs/licenses/`](docs/licenses) and [`server/LICENSE.md`](server/LICENSE.md).
