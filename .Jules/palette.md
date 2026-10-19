## 2024-05-24 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) hidden via CSS `display: none` cannot receive keyboard focus, breaking accessibility for screen reader and keyboard users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2` on the parent `<label>` wrapper to ensure the visual focus indicator is shown when the child input is focused via keyboard.
## 2026-10-19 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) and checkboxes visually hidden using `display: none` (e.g. Tailwind's `hidden`) are entirely removed from the accessibility tree, making them unreachable via keyboard `Tab` navigation. This breaks accessibility for screen reader and keyboard-only users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2 focus-within:ring-lime-500 focus-within:outline-none` on the parent `<label>` wrapper. This ensures the input remains keyboard focusable, and when focused, the visible focus indicator is displayed on the parent element.
