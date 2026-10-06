## 2024-05-24 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) hidden via CSS `display: none` cannot receive keyboard focus, breaking accessibility for screen reader and keyboard users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2` on the parent `<label>` wrapper to ensure the visual focus indicator is shown when the child input is focused via keyboard.

## 2026-10-06 - File Input Accessibility Refinement
**Learning:** The previous learning about file inputs and `sr-only` is effective, but it is easy to miss applying `focus-within:ring-2` to all labels that wrap file inputs, especially in complex components with multiple file uploads.
**Action:** Always verify all file inputs in modified files for `sr-only` and `focus-within` styling simultaneously.
