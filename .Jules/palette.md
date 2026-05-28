## 2023-10-24 - Segmented Controls Accessibility
**Learning:** The app uses custom segmented controls (`ss-segment` class containing `ss-segment-btn` buttons) for toggles like playback speed and view modes, but these lack grouping semantics and state indicators out of the box.
**Action:** When working with `ss-segment`, always ensure the container has `role="group"` and an `aria-label`, and the active button uses `aria-pressed={condition}`.
## 2024-05-25 - [Accessible File Upload Button Pattern]
**Learning:** For accessible file upload buttons consisting of a visually hidden file input wrapped in a label, hiding the input via `display: none` (`hidden` class in Tailwind) breaks keyboard accessibility since it cannot receive focus.
**Action:** Use the visually-hidden approach (e.g., `sr-only` class) on the input, and style the parent label with `focus-within:` classes to show a focus indicator when the invisible input receives keyboard focus.
