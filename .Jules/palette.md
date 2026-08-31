## 2024-05-24 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) hidden via CSS `display: none` cannot receive keyboard focus, breaking accessibility for screen reader and keyboard users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2` on the parent `<label>` wrapper to ensure the visual focus indicator is shown when the child input is focused via keyboard.
## 2024-06-24 - Accessible File Upload Inputs
**Learning:** React components sometimes use standard `hidden` classes on `<input type="file">` wrapped inside `<label>` tags to style file upload buttons. However, `hidden` elements are completely removed from the accessibility tree and keyboard tab order, breaking keyboard navigation.
**Action:** Use `sr-only` instead of `hidden` for file inputs. Apply `focus-within:ring-2 focus-within:outline-none` and appropriate visual styles to the parent `<label>` to display focus rings when the hidden input is focused via keyboard.
