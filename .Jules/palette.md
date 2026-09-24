## 2024-05-24 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) hidden via CSS `display: none` cannot receive keyboard focus, breaking accessibility for screen reader and keyboard users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2` on the parent `<label>` wrapper to ensure the visual focus indicator is shown when the child input is focused via keyboard.

## 2024-05-24 - File Input Accessibility Implementation Details
**Learning:** Testing keyboard focus on elements styled with `sr-only` and `focus-within` using Playwright requires sequentially tabbing to the element, as `locator.focus()` on the parent label may not trigger the expected focus outline. Also when setting `localStorage` to bypass auth in testing, ensure navigation to the application's origin has already occurred.
**Action:** When writing Playwright tests for visually hidden focusable elements, simulate natural user navigation with repeated `page.keyboard.press("Tab")` instead of relying on programmatic focus methods. Always `page.goto(origin)` before interacting with `localStorage`.
