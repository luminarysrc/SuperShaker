## 2024-05-24 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) hidden via CSS `display: none` cannot receive keyboard focus, breaking accessibility for screen reader and keyboard users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2` on the parent `<label>` wrapper to ensure the visual focus indicator is shown when the child input is focused via keyboard.

## 2024-05-19 - Keyboard Accessibility for Hidden Inputs
**Learning:** Native `input type="file"` and `input type="checkbox"` elements that are hidden using `display: none` (e.g., Tailwind's `hidden` class) are removed from the accessibility tree and cannot receive keyboard focus, completely breaking keyboard navigation for users relying on it.
**Action:** Always use the `sr-only` class instead of `hidden` to visually hide interactive inputs while keeping them in the DOM and focusable. Additionally, apply `focus-within:ring-2 focus-within:ring-lime-500 focus-within:outline-none` (or similar standard focus rings) to their parent `<label>` element so that sighted keyboard users have clear visual feedback when the hidden input receives focus.
