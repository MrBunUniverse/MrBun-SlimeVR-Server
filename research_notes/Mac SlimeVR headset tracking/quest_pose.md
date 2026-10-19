# Quest 3S real headset pose to Mac SlimeVR

## Can the current released Quest VRChat send a real HMD pose to the Mac?

### Takeaway
Yes: VRChat has a released, documented OSCQuery output for headset position AND orientation from the VR system. This is the first route to test, and requires neither SteamVR nor a Windows computer. The coordinator's repository investigator independently found the receiving implementation already present in this custom server; this research did not inspect that code.

### Cited Findings
- VRChat 2023.3.1 was released 9 August 2023, build 1332. Its Creators release notes added headset and wrist tracking data output from the VR system over OSC; receiving applications must use OSCQuery. Exact required toggle: `Allow Sending Head and Wrist VR Tracking OSC Data`, under Main Menu > Tracking and IK. Short excerpt: “sending out head and wrist tracking data from the VR system over OSC.” — [VRChat release notes](https://docs.vrchat.com/docs/vrchat-202331)
- The reviewed official VRChat Wiki lists `/tracking/vrsystem/head/pose` as read-only system headset pose, OSC type `,ffffff`: XYZ Cartesian position plus XYZ Euler angles. Wrist siblings are `/tracking/vrsystem/leftwrist/pose` and `/tracking/vrsystem/rightwrist/pose`. Rotation is NOT a quaternion on this wire. — [VRChat OSC wiki](https://wiki.vrchat.com/wiki/OSC)
- The same Wiki states coordinates generally follow Unity: +X right, +Y up, +Z forward, metres; Euler degrees converted internally in ZXY order. This endpoint is separate from avatar parameters such as Upright and avatar eye height. — [VRChat OSC wiki](https://wiki.vrchat.com/wiki/OSC)
- OSCQuery automatically finds applications and opens an output port to compatible receivers. Thus pointing SlimeVR's outgoing OSC at Quest IP alone does not prove reverse headset output works; discovery and the sender's explicit consent toggle matter. — [VRChat release notes](https://docs.vrchat.com/docs/vrchat-202331)
- Official SlimeVR docs explicitly support Quest 3S standalone VRChat, with SlimeVR running on another phone/laptop/PC. In SlimeVR use Settings > OSC > VRChat OSC Trackers, enable OSC, set Quest's LAN address when SlimeVR is on another device; in VRChat enable OSC via Action/Radial Menu > Options > OSC. Then T-pose FBT calibration. — [SlimeVR standalone OSC guide](https://docs.slimevr.dev/server/osc-information.html)
- The VRChat team's OSCQuery implementation targets cross-platform .NET and advertises `_oscjson._tcp` over Zeroconf on the local network. Its Unity example has a Head & Wrist Receiver scene, but the linked ready-made sample download is Windows. Do not tell the user that sample itself is an available native Mac application. — [VRChat community library](https://github.com/vrchat-community/vrc-oscquery-lib)
- A user report hosted on VRChat's feedback site says Quest head/wrist data can fail to transmit despite the toggle showing a destination. This is a first-person user report, not VRChat confirmation that all Quest devices fail. The accessible page showed the report and 2 votes; no staff confirmation, resolution, or reliably exposed status was visible. — [User bug report on VRChat feedback](https://feedback.vrchat.com/bug-reports/p/osc-head-and-wrist-tracking-not-working-inconsistent)

### Inferences
- Best minimal route: Quest native VRChat (running foreground) sends its VR-system HMD pose over OSCQuery-discovered OSC to the existing Mac server, while the server sends computed FBT points back to VRChat. SteamVR's headset device label is unnecessary for the actual head anchor.
- Parent can confidently say this is supported by the protocol and already represented in fork source, but cannot claim working on this exact Quest/Mac without packet/runtime validation.
- First validation should enable the existing bridge and explicit Quest output toggle, keep Quest and Mac on same reachable LAN, verify actual head pose packet reception, then check moving/rotating/crouching changes the correct head in server. mDNS discovery plus HTTP service advertisement and UDP reception all matter; a guest network or VPN could impede discovery.

### Gaps
- No physical Quest 3S test performed. Current VRChat version, toggle's exact localized/current label, packet rate, latency, whether focus loss causes output suspension, and that user's specific Wi-Fi path are unmeasured.
- Official release note says VR-system pose, but does not precisely document its origin under every locomotion/scale/recenter combination. Do not claim raw headset sensor coordinates or immutable stage-space coordinates without tests.

## Which OSC head addresses are proxies or in the wrong direction?

### Takeaway
`/tracking/trackers/head/position` and `/tracking/trackers/head/rotation` are INPUT to VRChat for alignment. They must not be confused with real outgoing `/tracking/vrsystem/head/pose`.

### Cited Findings
- VRChat's tracker docs explicitly describe receiving head data at `/tracking/trackers/head/...`. Position aligns incoming OSC tracking space to the avatar head BONE ROOT, not eye position; it is not a getter for headset coordinates. Rotation supplies tracking-space yaw alignment. Each message is a three-float position or Euler angle vector. — [VRChat OSC tracker documentation](https://docs.vrchat.com/docs/osc-trackers)
- Reviewed official Wiki separately marks tracker-head alignment fields write-only and VR-system head pose read-only. — [VRChat OSC Wiki](https://wiki.vrchat.com/wiki/OSC)
- SlimeVR's overview says the headset supplies its fixed reference point, while body IMUs supply orientation and forward kinematics estimates body positions. — [SlimeVR 101](https://docs.slimevr.dev/slimevr101.html)

### Inferences
- Reading avatar eye-height parameters or reconstructing the avatar bone alone would not meet a request for the real moving headset position and orientation.
- Tests must distinguish translating the body/head in room from merely avatar locomotion; repeated recenter, seated/crouched/lying poses and avatar scaling need checking to avoid mixing coordinate frames or feeding the FBT solver back into itself.
- For a bespoke receiver, verify finite numeric values and vector lengths, convert Euler order/handedness correctly to internal quaternion, expire stale packets, retain tracking-invalid flags where supported, and measure arrival jitter before adding smoothing. These are engineering acceptance conditions, not measurements made in this research.

### Gaps
- Source pages do not provide a guaranteed output rate or delay bound, so none should be invented.

## Could an AI-assisted native companion solve use outside VRChat?

### Takeaway
A Quest app can obtain real headset poses through supported OpenXR and send them to a Mac. That is ordinary bridge engineering while it owns an XR session; promising a universal background sender alongside every other Quest game would exceed the evidence.

### Cited Findings
- Meta says OpenXR is the only supported API for new Quest development; handled runtime data includes head/hand positions, focus/quit requests, and view/stage coordinate transformations. — [Meta OpenXR API background](https://developers.meta.com/vr/documentation/unity/os-openxr-vrapi/)
- Meta provides native sample apps with a common framework for OpenXR session management and rendering. Reusing these is a realistic start for a native pose-to-network sender. — [Meta OpenXR SDK samples](https://developers.meta.com/vr/documentation/native/native-openxr-sdk-sample/)
- Meta's session docs require instance, system, then an XR session with an appropriate Android graphics binding. They do not establish arbitrary background coexistence with another immersive application. — [Meta instances and sessions](https://developers.meta.com/vr/documentation/native/android/mobile-openxr-instance-session/)
- Meta camera-rig docs warn experimental stationary reference origins can change during a session, for example tracking loss, and expose a change notification. Origins cannot simply be assumed permanent across sessions. — [Meta camera configuration](https://developers.meta.com/vr/documentation/unity/unity-ovrcamerarig/)
- scrcpy describes itself as Android video/audio mirroring and keyboard/mouse control. Its stated protocol features do not include exposing a Quest runtime HMD pose feed. — [Official scrcpy repository](https://github.com/Genymobile/scrcpy)

### Inferences
- Minimal fallback prototype: reuse a native OpenXR sample or tiny Unity XR scene, obtain a VIEW-space pose relative to floor/stage reference, stream position/orientation plus sequence/time/validity over LAN, and adapt an existing SlimeVR ingestion path instead of inventing a SteamVR runtime. Validate native foreground operation before considering simultaneous games.
- An LLM can help implement/debug this bridge, but cannot remove runtime lifecycle restrictions or create a supported API simply by generating code. No claim about a particular unreleased/unverified model named Opus 5.5 is needed.
- For VRChat the existing OSCQuery route is smaller and avoids an additional foreground Quest app entirely.
- ADB could install/control a sender or tunnel its transport; ADB or scrcpy alone is not the missing pose provider. Inferring position from cast video is an unnecessary estimation problem when VRChat exposes runtime data.

### Gaps
- No primary Meta page found in this focused pass proving that a third-party Quest background companion can continue full-rate head pose while another immersive app owns focus. Treat this coexistence as unproven rather than simply promising a foreground service fixes it.
- No ready-made, independently verified universal Quest-to-Mac background pose sender identified in the searches. A broad search result mentions a recent macOS WiVRn port, but it was not investigated or recommended here because the existing VRChat route already answers the immediate need.
- No APK built, hardware measured, or code changed.
