## 2025-05-24 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) and custom checkboxes hidden via CSS `display: none` cannot receive keyboard focus, breaking accessibility for screen reader and keyboard users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2 focus-within:ring-lime-500` on the parent `<label>` wrapper to ensure the visual focus indicator is shown when the child input is focused via keyboard.
