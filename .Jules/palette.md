## 2024-05-24 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) hidden via CSS `display: none` cannot receive keyboard focus, breaking accessibility for screen reader and keyboard users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2` on the parent `<label>` wrapper to ensure the visual focus indicator is shown when the child input is focused via keyboard.
## 2024-05-24 - File Input Accessibility Applied
**Learning:** Implementing the sr-only technique on file inputs requires ensuring the parent label has appropriate focus-within styles, otherwise the visual focus indicator is lost when navigating with the keyboard.
**Action:** Always verify parent element styles when replacing 'hidden' with 'sr-only' on inputs.
