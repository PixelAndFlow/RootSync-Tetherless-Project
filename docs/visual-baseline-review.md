# Mobile visual baseline review

The five modified `integration-learner-flow` PNGs in `e2e/rco-mobile.spec.ts-snapshots` are candidate baselines. They need team review before acceptance.

Open [the side-by-side comparison](./visual-baseline-comparison.html) to review all five candidates against commit `1497e09`. The three Android images are identical to one another, as are the two iPhone images, so there are two distinct visual comparisons.

The candidates show a demo notice, a Staff navigation link, an Exit mission control and a renamed Student profile link. These shift the mission content vertically; the answer and mission navigation areas remain present. The Android candidate retains readable labels and the navigation grid in this static capture; the iPhone candidate shows the same changes. No obvious clipping was visible in either comparison. These observations are not team approval. Review whether the changes are intended and check interaction and focus behavior separately.

The previous team CI run is [Frontend quality 40244986783](https://github.com/PixelAndFlow/RootSync-Tetherless-Project/actions/runs/40244986783). It tested the earlier commit, not the local changes. It reported selector timeouts, a changed answer-color expectation, screenshot differences and staff workflow failures. Run the frontend-quality workflow on a commit containing the fixes and candidate images, then inspect the result before accepting the baselines.

The browser profiles simulate viewport dimensions and do not establish behavior on an actual phone. Check at least one physical Android phone and iPhone when available.
