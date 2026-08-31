## 2024-05-24 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) hidden via CSS `display: none` cannot receive keyboard focus, breaking accessibility for screen reader and keyboard users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2` on the parent `<label>` wrapper to ensure the visual focus indicator is shown when the child input is focused via keyboard.
## 2026-06-15 - Keyboard Accessible File Inputs
**Learning:** Using `className="hidden"` (`display: none`) on `<input type="file">` elements removes them from the accessibility tree, making them unfocusable via keyboard navigation.
**Action:** Always use `className="sr-only"` for file inputs and apply `focus-within:ring-2 focus-within:ring-[color] focus-within:outline-none` utilities to their parent `<label>` elements so that sighted keyboard users receive visible focus feedback.
