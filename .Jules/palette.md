## 2024-05-24 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) hidden via CSS `display: none` cannot receive keyboard focus, breaking accessibility for screen reader and keyboard users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2` on the parent `<label>` wrapper to ensure the visual focus indicator is shown when the child input is focused via keyboard.

## 2024-06-28 - Focus Styling on Hidden Inputs
**Learning:** Adding `sr-only` to hidden inputs (`type="file"`, `type="checkbox"`) makes them focusable for keyboard navigation. However, without a visual indicator on the parent, users cannot see the focus.
**Action:** Always add `focus-within:ring-2 focus-within:ring-lime-500 focus-within:outline-none` to the wrapping `<label>` element to display a visible focus ring. Additionally, verify there are no duplicate `aria-label` attributes, as they can cause warnings in Vite and impact build tools.
