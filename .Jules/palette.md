## 2024-05-24 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) hidden via CSS `display: none` cannot receive keyboard focus, breaking accessibility for screen reader and keyboard users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2` on the parent `<label>` wrapper to ensure the visual focus indicator is shown when the child input is focused via keyboard.
## 2025-02-18 - File inputs hidden from keyboard
**Learning:** Hidden interactive inputs (such as `<input type="file">` or `<input type="checkbox">`) inside labels use `className="hidden"`, which completely removes them from the tab order making them inaccessible to keyboard users.
**Action:** Use the `sr-only` class instead of `hidden` on these inputs to keep them in the DOM and focusable, and apply focus styling (like `focus-within:ring-2 focus-within:ring-lime-500 focus-within:outline-none`) to the parent label so users can see when the hidden input has focus.
