## 2024-05-24 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) hidden via CSS `display: none` cannot receive keyboard focus, breaking accessibility for screen reader and keyboard users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2` on the parent `<label>` wrapper to ensure the visual focus indicator is shown when the child input is focused via keyboard.

## 2024-05-24 - Hidden File Input Accessibility
**Learning:** Hidden interactive inputs (such as `<input type="file">`) should use the `sr-only` class instead of `hidden` to remain keyboard focusable, with focus styles applied to their parent label element.
**Action:** Ensure all hidden inputs are visually hidden but keyboard accessible using `sr-only`, and that their parent labels have appropriate `focus-within` styles (e.g., `focus-within:ring-2 focus-within:ring-lime-500 focus-within:outline-none`).
