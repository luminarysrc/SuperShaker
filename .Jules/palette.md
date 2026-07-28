## 2024-05-24 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) hidden via CSS `display: none` cannot receive keyboard focus, breaking accessibility for screen reader and keyboard users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2` on the parent `<label>` wrapper to ensure the visual focus indicator is shown when the child input is focused via keyboard.
## 2024-05-25 - Avoid committing dist files
**Learning:** Make sure to never commit build artifacts in `dist/` or database files like `supershaker.db` by checking `git status`.
**Action:** Be mindful of the files you are staging to make sure you do not commit these artifacts.
