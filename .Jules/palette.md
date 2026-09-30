## 2024-05-24 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) hidden via CSS `display: none` cannot receive keyboard focus, breaking accessibility for screen reader and keyboard users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2` on the parent `<label>` wrapper to ensure the visual focus indicator is shown when the child input is focused via keyboard.

## 2026-09-30 - Add aria-label and focus states to tab controls
**Learning:** Abbreviated tab names like "S1" or "✂ Off1" intended for compactness on small screens are confusing for screen readers and lack keyboard focus indicators.
**Action:** Expand abbreviated tabs with explicit `aria-label`s (e.g., "Sheet 1", "Offcut 1") and add `focus-visible` outline classes to ensure clarity for keyboard and screen reader users.
