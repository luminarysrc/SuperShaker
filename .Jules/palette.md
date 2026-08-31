## 2024-05-24 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) hidden via CSS `display: none` cannot receive keyboard focus, breaking accessibility for screen reader and keyboard users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2` on the parent `<label>` wrapper to ensure the visual focus indicator is shown when the child input is focused via keyboard.
## 2024-10-27 - Keyboard Focus for Hidden Inputs
**Learning:** React/Tailwind inputs hidden via `className="hidden"` are completely removed from the accessibility tree, making them un-focusable via keyboard navigation.
**Action:** Always use `sr-only` instead of `hidden` for interactive inputs (like checkboxes or file uploads) to keep them accessible, and apply `focus-within` styles to their parent label so keyboard users have visual feedback.
