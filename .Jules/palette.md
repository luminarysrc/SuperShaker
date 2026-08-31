## 2024-05-24 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) hidden via CSS `display: none` cannot receive keyboard focus, breaking accessibility for screen reader and keyboard users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2` on the parent `<label>` wrapper to ensure the visual focus indicator is shown when the child input is focused via keyboard.

## 2026-07-19 - Visually hidden inputs need to remain focusable
**Learning:** `className="hidden"` on file inputs (or custom checkboxes) removes them from the tab order and accessibility tree. This breaks keyboard navigation for interactive elements where the UI relies on a `<label>` wrapping a hidden input.
**Action:** Always use `sr-only` instead of `hidden` for interactive inputs, and apply `focus-within:ring-2 focus-within:ring-lime-500 focus-within:outline-none` to the parent `<label>` to ensure visible keyboard focus states.
