## 2024-05-24 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) hidden via CSS `display: none` cannot receive keyboard focus, breaking accessibility for screen reader and keyboard users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2` on the parent `<label>` wrapper to ensure the visual focus indicator is shown when the child input is focused via keyboard.

## 2024-05-24 - Checkbox Input Accessibility
**Learning:** Custom UI checkboxes that visually hide the native `<input type="checkbox">` via `display: none` (or Tailwind's `hidden`) break keyboard focus navigation and screen reader support.
**Action:** Similar to file inputs, use `sr-only` instead of `hidden` on the native checkbox input, and apply `focus-within:ring-2` to the parent `<label>` to ensure keyboard navigation remains functional and visible.
