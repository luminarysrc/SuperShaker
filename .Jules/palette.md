## 2024-05-24 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) hidden via CSS `display: none` cannot receive keyboard focus, breaking accessibility for screen reader and keyboard users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2` on the parent `<label>` wrapper to ensure the visual focus indicator is shown when the child input is focused via keyboard.

## $(date +%Y-%m-%d) - File Input Accessibility
**Learning:** Found a pattern where `<input type="file">` elements were using `className="hidden"` (display: none). This removes them from the accessibility tree entirely, making them impossible to reach via keyboard navigation.
**Action:** Use `className="sr-only"` for visually hidden inputs that need to remain keyboard accessible. Apply `focus-within` styles on their visible wrapping `<label>` to visually indicate keyboard focus to the user.
