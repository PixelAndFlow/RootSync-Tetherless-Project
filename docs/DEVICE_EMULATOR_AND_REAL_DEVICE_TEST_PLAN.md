# Device emulator and real-device test plan

## Purpose and current boundary

The automated Playwright suite catches responsive, keyboard, touch-target, route, and visual regressions on five RCO-representative viewports. It is Chromium simulation only. It does not certify Android runtime behavior, iOS Safari/WebKit, memory pressure, storage eviction, installed-PWA restart, or multi-day DDIL behavior.

This plan adds the next testing layers without making premature DDIL or backend assumptions.

## Recommended tools

| Need | Recommended tool | Why |
| --- | --- | --- |
| Local Android browser checks on Windows | Android Studio Device Manager / Android Emulator | Free local AVDs with controllable Android version, RAM, storage, rotation, and network conditions. |
| iOS Safari behavior | Xcode Simulator on a Mac | The Apple-supported simulator route; use it for layout and Safari/WebKit checks, but confirm final behavior on hardware. |
| Real iOS and Android browser testing from Windows | BrowserStack Live with Local Testing | Runs a local or staging web app on real cloud devices, including iOS Safari, without committing private source files or publishing the app. |
| Current automated visual/regression checks | Playwright in this repository | Fast repeatable checks on the RCO viewport profiles; keep this as the first gate. |

No Moodle source code or dependency is required for this frontend testing plan.

## Android Studio setup on this Windows machine

Install Android Studio and use **Tools → Device Manager** to create these AVDs. Android's Device Manager supports configurable hardware profiles, including RAM and internal storage, so these are useful RCO stress approximations—not certification of the exact retail models.

| AVD | Target profile | Minimum setup | Test focus |
| --- | --- | --- | --- |
| `RCO-Android10-2GB` | Android 10 / 360 × 800 | API 29, 2 GB RAM, 5 GB free internal storage before test | Minimum Android support and low-memory UI behavior. |
| `RCO-Android11-Go` | Android 11 Go-class / 360 × 720 | API 30, 2 GB RAM, 5 GB free internal storage before test | Dense layout, keyboard, slow/network-limited behavior. |
| `RCO-Android12-3GB` | Android 12 / 360 × 800 | API 31, 3 GB RAM, 5 GB free internal storage before test | Preferred Android baseline. |

To open the local Vite development server in an Android Emulator:

```text
npm run dev -- --host 0.0.0.0
```

Then browse to `http://10.0.2.2:5173/#/learner` inside the emulator. `10.0.2.2` is the Android Emulator alias for the Windows host loopback interface; it is not the address to use on a physical phone.

For a physical Android phone on the same trusted network, use the computer's LAN address and a temporary, deliberately exposed development server only. Do not expose private RCO materials or a development server to the public internet.

## iPhone and iOS Safari

Xcode Simulator runs on a Mac. This Windows computer cannot run Apple’s simulator locally. Use one of these paths:

1. A team Mac with Xcode Simulator for iPhone 8-/SE2-sized Safari checks.
2. BrowserStack Live with Local Testing for real iPhone Safari while the app remains local/private.
3. A physical iPhone for final acceptance, especially after service-worker and DDIL work begins.

Apple notes that simulators do not replicate every physical-device performance or hardware feature, so the final acceptance pass remains a real-device activity.

## BrowserStack Live recommendation

If the team has budget or academic access, use **BrowserStack Live** (not App Live) during the current web-app phase. Its Local Testing tunnel can expose `localhost`, staging, or private-network sites to a selected real mobile browser. Do not upload RCO source documents, learner data, production tokens, or private fixtures. Use only the de-identified frontend mock data already in this repository.

Suggested real-device sessions:

1. iPhone 8 or closest supported iPhone, iOS 16.4+ Safari.
2. iPhone SE (2nd generation) or closest supported iPhone, iOS 16.4+ Safari.
3. Android 10 device, Chrome.
4. Android 11+ device, Chrome, with offline/network-throttled checks where supported.

BrowserStack Live can record a session and offers network simulation. Save only defect evidence that contains no learner or private RCO information.

## Manual acceptance script

Run this after every major UI change and again after DDIL/API integration:

1. Complete a mission with one wrong answer; confirm first score is preserved.
2. Practice the missed question; confirm mastery changes without changing the first score.
3. Open correct, missed, and all-answer review; confirm review is read-only.
4. Toggle Spanish Assist, high contrast, and reduced motion; refresh and confirm the local display choices persist.
5. Navigate by keyboard and screen reader: skip link, setup fields, answer feedback, next-question focus, flag toggle, and debrief links.
6. Check portrait and landscape at the RCO minimum profile; confirm no horizontal scroll or clipped controls.
7. Test offline and reconnection messaging. Once Naquan's DDIL implementation is connected, add force-close/restart, multi-day offline, storage-pressure, duplicate-event, and conflict checks.

## Sources

- [Android Device Manager / AVD documentation](https://developer.android.com/studio/run/managing-avds)
- [Android Emulator host networking (`10.0.2.2`)](https://developer.android.com/studio/run/emulator-networking-address)
- [Apple: simulated and physical device testing](https://developer.apple.com/documentation/Xcode/running-your-app-on-simulated-or-physical-devices)
- [BrowserStack Live overview](https://www.browserstack.com/docs/live)
- [BrowserStack Local Testing for private web apps](https://www.browserstack.com/docs/live/local-testing)
- [BrowserStack network simulation on real devices](https://www.browserstack.com/docs/live/network/network-simulation)
