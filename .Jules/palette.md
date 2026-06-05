## 2026-06-05 - Accessible File Inputs
**Learning:** Using `hidden` or `display: none` on `<input type="file">` removes it from the accessibility tree, making it impossible for keyboard users or screen readers to focus or interact with it.
**Action:** Instead of `hidden`, apply the `sr-only` (screen-reader only) utility class to the input so it remains in the DOM and focusable. Add focus indication styling (like `focus-within:ring-2`) to its parent `<label>` so the visual button receives a focus outline when the hidden input is focused via keyboard.
