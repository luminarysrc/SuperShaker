## 2024-05-24 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) hidden via CSS `display: none` cannot receive keyboard focus, breaking accessibility for screen reader and keyboard users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2` on the parent `<label>` wrapper to ensure the visual focus indicator is shown when the child input is focused via keyboard.

## 2024-05-24 - Interactive hidden inputs accessibility
**Learning:** Using `className="hidden"` (display: none) on interactive inputs like file uploads or checkboxes completely removes them from the keyboard tab order, breaking accessibility.
**Action:** Always use `className="sr-only"` to visually hide interactive inputs while keeping them keyboard focusable. Add focus styles (e.g., `focus-within:ring-2`) to their parent `<label>` element so sighted keyboard users know they have focus.
