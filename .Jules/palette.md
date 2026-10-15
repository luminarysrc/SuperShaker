## 2024-05-24 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) hidden via CSS `display: none` cannot receive keyboard focus, breaking accessibility for screen reader and keyboard users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2` on the parent `<label>` wrapper to ensure the visual focus indicator is shown when the child input is focused via keyboard.

## 2026-10-15 - React Duplicate Attributes
**Learning:** React JSX does not support duplicate attributes like `aria-label`. Having duplicates causes Vite/esbuild warnings and could cause a CI failure when building for production.
**Action:** Always verify that the element does not already have an attribute before adding it, especially for dynamically toggled attributes.
