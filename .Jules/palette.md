## 2023-10-24 - Segmented Controls Accessibility
**Learning:** The app uses custom segmented controls (`ss-segment` class containing `ss-segment-btn` buttons) for toggles like playback speed and view modes, but these lack grouping semantics and state indicators out of the box.
**Action:** When working with `ss-segment`, always ensure the container has `role="group"` and an `aria-label`, and the active button uses `aria-pressed={condition}`.
