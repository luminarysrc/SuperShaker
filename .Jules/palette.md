## 2026-06-03 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) hidden via CSS `display: none` (e.g. using Tailwind's `hidden`) cannot receive keyboard focus, breaking accessibility for screen reader and keyboard users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2` on the parent `<label>` wrapper to ensure the visual focus indicator is shown when the hidden child input is focused via keyboard navigation.
