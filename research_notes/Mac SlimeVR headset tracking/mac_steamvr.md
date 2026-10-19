# Apple Silicon Mac PCVR and SteamVR headset tracking

## Can the Mac and Quest alone run actual SteamVR?

### Takeaway
Valve SteamVR on this M3 MacBook Air is not a supported working path. Real PCVR is a separate question: alternative Apple Silicon runtimes now have downloadable builds and can run selected Windows VR games while bypassing SteamVR.

### Cited Findings
- Valve's 2020 Supported Platforms announcement ended macOS support to focus on Windows and Linux. The announcement's current Steam News wrapper rendered poorly in browsing, but the official community announcement/search index still identifies it. [Valve announcement](https://store.steampowered.com/news/app/250820/view/2216278054495230717), [official announcement discussion/date](https://steamcommunity.com/app/250820/eventcomments/2268069450210517571?l=schinese&snr=2_groupannouncements_detail_).
- Valve describes the public OpenVR repository as an SDK containing API and samples, with the runtime supplied separately through SteamVR. Compiling bindings or finding an old macOS API library therefore does not install a functioning SteamVR runtime. [Valve OpenVR README](https://github.com/ValveSoftware/openvr/blob/master/README.md).
- Upstream ALVR supports Quest 3S clients but marks macOS server support unavailable; its supported host operating systems are Windows and Linux. [ALVR README](https://github.com/alvr-org/ALVR).
- CodeWeavers' current SteamVR compatibility entry rates Mac support Limited Functionality and mentions the macos_default beta branch. This is not proof of a working modern Apple Silicon Quest streaming/SlimeVR-driver setup. [CodeWeavers compatibility](https://www.codeweavers.com/compatibility/crossover/steamvr).
- A Parallels forum first-person experiment reported partial Oculus/Virtual Desktop VR on Apple Silicon while explicitly saying SteamVR did not work. This is historical user evidence, not current vendor certification. [Parallels experiment](https://forum.parallels.com/threads/now-working-a-bit-pc-vr-with-meta-quest-2-parallels-and-virtual-desktop-on-m1-apple-silicon.357718/).

### Inferences
- Steam installation, an OpenVR SDK build, a SteamVR window opening in Wine, and live headset tracking inside a supported SteamVR compositor/driver stack are different acceptance criteria.
- No reliable evidence found of a current, complete Valve SteamVR + Quest 3S + SlimeVR driver stack working on the user's M3 Air through Wine/CrossOver/Parallels. Do not claim a mathematical impossibility; say no supported or verified working route was found.

### Gaps
- No hands-on installation or headset test was performed. Exact user's RAM/macOS/thermal performance untested.
- Did not inspect every historical OpenVR macOS binary; the SDK/runtime distinction is the relevant conclusive point.

## What released alternative Mac PCVR stacks exist?

### Takeaway
MoltenVR is the closest existing consumer-facing experiment; BasaltVR is the open-source engineering route. Both implement their own OpenXR path rather than resurrecting Valve SteamVR.

### Cited Findings
- MoltenVR's current README describes Windows VR games under Wine, D3D11-to-Metal translation, a custom OpenXR runtime and stock ALVR headset client; it lists full head/controller 6DoF, buttons and haptics. It explicitly answers that it is not SteamVR for Mac. Listed verified games include Alyx, Beat Saber and native Minecraft/Vivecraft. These are project author claims, not our benchmark results. macOS 14+ and Apple Silicon are required. Distribution is binary-only; a free seven-day trial and limited free mode are described. [MoltenVR project](https://github.com/MoltenVR/MoltenVR-Preview).
- The latest-release link currently resolves to MoltenVR v1.0.2, with July 29 displayed. Release notes include Vivecraft compatibility work, controller binding fixes and per-eye scale fixes. [MoltenVR v1.0.2](https://github.com/MoltenVR/MoltenVR-Preview/releases/tag/v1.0.2).
- BasaltVR publishes 0.1.0 as a developer pre-release, with July 29 displayed. Its Apple Silicon app requires macOS 14+, is ad-hoc signed, and excludes required Wine/ALVR/OpenComposite and games. The runtime is experimental/non-conformant and targets Beat Saber narrowly. This is a released engineering preview, not a turnkey consumer solution. [Basalt release](https://github.com/frenchbaguetteman/BasaltVR/releases/tag/v0.1.0).
- Basalt's README records testing on M3 Max with Quest 3. It combines Wine, DXMT, OpenComposite, its own OpenXR runtime, a native Metal/VideoToolbox streamer and ALVR. [Basalt README](https://github.com/frenchbaguetteman/BasaltVR).

### Inferences
- The projects demonstrate PCVR on Apple Silicon can be engineered by replacing missing runtime/compositor/transport boundaries and reusing existing translation stacks.
- M3 Max + Quest 3 results do not establish M3 MacBook Air + Quest 3S performance. A narrowly selected lightweight game and reduced resolution would be an experiment, not guaranteed support.
- Do not spend time inventing a whole PCVR stack before evaluating the released alternatives. Closed-source MoltenVR is harder to extend locally than Basalt.

### Gaps
- No general game compatibility guarantee, no independent sustained M3 Air benchmark, and no confirmed Quest 3S-specific test found in these primary documents.
- Latest refers to release redirects/pages seen during this research; not an assertion that a later future release cannot exist.

## Could an AI-assisted bridge get genuine headset motion into the Mac SlimeVR app?

### Takeaway
Yes, this is a realistic bounded engineering project: export actual Quest head pose already received by an alternative runtime, then feed an existing SlimeVR pose input. This does not require running Valve SteamVR. Sending SlimeVR's solved body back as compatible trackers to arbitrary PCVR games is a second, substantially larger and unverified task.

### Cited Findings
- Basalt architecture's native daemon already owns pose/input state and receives Quest tracking over ALVR. Its M4 path normalizes the ALVR quaternion, forwards head pose through HEAD_POSE on its control channel, handles freshness and resolves OpenXR VIEW/LOCAL spaces. The architecture names BasaltCore/RuntimeLink.swift and the PE control protocol as the boundary. [Basalt architecture](https://github.com/frenchbaguetteman/BasaltVR/blob/main/docs/ARCHITECTURE.md).
- Basalt's runtime README documents xrLocateViews/xrLocateSpace using fresh ALVR head pose, Touch grip pose/input/haptics, and explicit clearing of stale location tracking flags. It advertises narrowly implemented OpenXR graphics/input support, not arbitrary SteamVR driver loading. [Basalt runtime](https://github.com/frenchbaguetteman/BasaltVR/tree/main/runtime).
- Basalt's streamer can receive headset uplink over USB ADB forwarding or Wi-Fi. Its plain desktop preview is only a transport test; correct 3D head motion comes through the pose-aware per-eye runtime path. This distinction guards against claiming a streamed flat desktop proves PCVR. [Basalt streamer guide](https://github.com/frenchbaguetteman/BasaltVR/blob/main/docs/STREAMER.md).
- SlimeVR upstream advertises OSC Trackers integration for VRChat standalone/PCVR and bidirectional VMC tracking integration. [SlimeVR server README](https://github.com/SlimeVR/SlimeVR-Server).

### Inferences
- Feasible minimal design: Quest ALVR client -> Basalt head-pose event -> small exporter -> this fork's existing OSC or VMC pose input -> real Head/HMD tracking in SlimeVR. The local-repository agent found an existing VRChat head-pose OSC route; use that knowledge to choose the least invasive input rather than adding a new protocol.
- This would carry the headset's genuine measured six-degree motion. Calling its source SteamVR would be misleading because SteamVR is absent.
- Required proof: axis/quaternion conversion, meters and origin, recentering, timestamps/freshness, disconnect invalidation, rate/latency and real headset movement while the target VR session runs. No need to solve game rendering just to display/use head pose.
- For Mac PCVR full-body tracking, exporting head pose into SlimeVR is only half the chain. A game must consume SlimeVR body poses through a supported game protocol or an implemented custom-runtime tracker extension/OpenVR shim. Stock SlimeVR's SteamVR driver cannot be presumed to load into Molten/Basalt; no source here confirms that path or existing FBT extensions.
- A strong coding model could help build and test the bounded bridge, but cannot guarantee frame timing, runtime compatibility or sustained performance. Do not promise that a named model can invent complete Valve runtime support. Do not confirm the user's Opus 5.5 model name without a separate official-source check.

### Gaps
- No existing documented SlimeVR connector or supported external pose export API was found in MoltenVR. Its binary-only runtime would likely require maintainer collaboration.
- No verified plug-and-play SlimeVR FBT injection support found in Basalt/Molten. Exact OpenXR tracker extension absence was not exhaustively audited.
- Individual Basalt source files failed browser fetch; architecture and runtime documentation are the available primary evidence, so exact code hook must be verified during implementation.
