## 2024-05-24 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) hidden via CSS `display: none` cannot receive keyboard focus, breaking accessibility for screen reader and keyboard users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2` on the parent `<label>` wrapper to ensure the visual focus indicator is shown when the child input is focused via keyboard.
## 2024-09-23 - Accessible Hidden Inputs
**Learning:** Using `className="hidden"` on `<input>` elements (like type="file" or type="checkbox" mapped to custom visual representations) makes them completely invisible to the accessibility tree and completely unfocusable via keyboard navigation.
**Action:** Instead of `hidden` (`display: none`), use Tailwind's `sr-only` utility class to visually hide the original input while keeping it keyboard-focusable. Apply focus states (e.g., `focus-within:ring-2`) to the surrounding/parent wrapper element (like a `<label>`) so sighted users can see where focus is placed during keyboard navigation.
