## 2024-05-24 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) hidden via CSS `display: none` cannot receive keyboard focus, breaking accessibility for screen reader and keyboard users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2` on the parent `<label>` wrapper to ensure the visual focus indicator is shown when the child input is focused via keyboard.
## 2026-06-19 - Hidden inputs vs Screen Readers\n**Learning:** Using `className="hidden"` on inputs inside `<label>` wrappers completely removes them from keyboard focus and screen readers.\n**Action:** Use Tailwind's `sr-only` class on inputs and add `focus-within` styles to the parent `<label>` to maintain accessibility while visually hiding the input.
