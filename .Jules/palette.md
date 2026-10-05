## 2024-05-24 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) hidden via CSS `display: none` cannot receive keyboard focus, breaking accessibility for screen reader and keyboard users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2` on the parent `<label>` wrapper to ensure the visual focus indicator is shown when the child input is focused via keyboard.
## 2024-05-18 - Keyboard Accessibility for Hidden Inputs
**Learning:** When hiding interactive inputs like `<input type="file">` or `<input type="checkbox">` for styling purposes (e.g. relying on a styled parent `<label>`), using `display: none` or the Tailwind `hidden` class removes them from the accessibility tree and prevents them from receiving keyboard focus. This breaks tab navigation.
**Action:** Use the `sr-only` class instead of `hidden`. This keeps the input keyboard focusable while visually hiding it. To show focus state visually, add `focus-within:ring-2 focus-within:ring-lime-500 focus-within:outline-none` (or similar focus styles) to the parent `<label>` element so it lights up when the invisible input receives focus.
