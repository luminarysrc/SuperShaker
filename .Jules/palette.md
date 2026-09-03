## 2024-05-24 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) hidden via CSS `display: none` cannot receive keyboard focus, breaking accessibility for screen reader and keyboard users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2` on the parent `<label>` wrapper to ensure the visual focus indicator is shown when the child input is focused via keyboard.

## 2025-01-20 - Accessible visually hidden inputs
**Learning:** Using `className="hidden"` on visually hidden interactive inputs (like file uploads or custom checkboxes) completely removes them from the accessibility tree, making them unfocusable via keyboard.
**Action:** Use `className="sr-only"` on the input instead, and apply focus styles (e.g. `focus-within:ring-2 focus-within:ring-lime-500 focus-within:outline-none`) to their parent `<label>` element.
