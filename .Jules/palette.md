## 2024-05-24 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) hidden via CSS `display: none` cannot receive keyboard focus, breaking accessibility for screen reader and keyboard users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2` on the parent `<label>` wrapper to ensure the visual focus indicator is shown when the child input is focused via keyboard.
## 2026-06-22 - [Accessible File Inputs]
**Learning:** Hidden interactive inputs (like `<input type="file">`) should use the `sr-only` class instead of `hidden` so they remain keyboard focusable and accessible to screen readers, while applying focus styles to their parent label elements.
**Action:** Replaced `className="hidden"` with `className="sr-only"` and added `focus-within:ring-2` styles on parent `<label>` elements in components with file inputs.
