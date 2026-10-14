## 2024-05-24 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) hidden via CSS `display: none` cannot receive keyboard focus, breaking accessibility for screen reader and keyboard users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2` on the parent `<label>` wrapper to ensure the visual focus indicator is shown when the child input is focused via keyboard.
## 2025-01-24 - Interactive Inputs Hidden by Default Class
**Learning:** Using `hidden` (which translates to `display: none`) on interactive file upload inputs (`<input type="file">`) or checkboxes removes them from the focus order, making them inaccessible to keyboard and screen reader users.
**Action:** Always use the `sr-only` class to hide interactive inputs visually while keeping them accessible. Apply focus styles (e.g., `focus-within:ring-2 focus-within:ring-lime-500 focus-within:outline-none`) to their parent wrapper (like a `<label>`) to show a visual focus state when the hidden input receives focus.
