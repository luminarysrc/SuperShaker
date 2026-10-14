## 2024-05-24 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) hidden via CSS `display: none` cannot receive keyboard focus, breaking accessibility for screen reader and keyboard users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2` on the parent `<label>` wrapper to ensure the visual focus indicator is shown when the child input is focused via keyboard.

## 2026-10-14 - Checkbox and File Input Focus Accessibility
**Learning:** In addition to file inputs, hidden checkboxes inside labels face the same keyboard accessibility issue when hidden with `display: none` (like Tailwind's `hidden`). The focus-within technique is required for all hidden interactive input types inside labels.
**Action:** Consistently apply `sr-only` instead of `hidden` and use `focus-within:ring-2 focus-within:ring-lime-500 focus-within:outline-none` on the parent label across the application for any interactive element that is visually masked.
