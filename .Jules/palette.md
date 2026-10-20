## 2024-05-24 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) hidden via CSS `display: none` cannot receive keyboard focus, breaking accessibility for screen reader and keyboard users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2` on the parent `<label>` wrapper to ensure the visual focus indicator is shown when the child input is focused via keyboard.
## 2024-10-21 - Hidden file inputs
**Learning:** Hidden interactive inputs (such as `<input type="file">` or `<input type="checkbox">`) should use the `sr-only` class instead of `hidden` to remain keyboard focusable, with focus styles applied to their parent label element (e.g., via `focus-within:ring-2 focus-within:ring-lime-500 focus-within:outline-none`).
**Action:** When creating file upload labels, always apply `focus-within` on the label and `sr-only` on the nested input to ensure it remains accessible to keyboard navigation.
