## 2024-05-24 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) hidden via CSS `display: none` cannot receive keyboard focus, breaking accessibility for screen reader and keyboard users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2` on the parent `<label>` wrapper to ensure the visual focus indicator is shown when the child input is focused via keyboard.

## 2024-05-18 - Keyboard Navigation for File Inputs
**Learning:** Using `className="hidden"` on `<input type="file">` inside a styled `<label>` prevents the input from being keyboard-focusable. Testing focus state of visually hidden elements with Playwright is tricky and sometimes requires manually evaluating JS `focus()` calls or very precise tabbing depending on layout timing and dialog states.
**Action:** Always use `sr-only` instead of `hidden` for interactive inputs, and apply `focus-within:ring-2` to their parent wrapping elements to ensure visible focus indicators.
