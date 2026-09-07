## 2024-05-24 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) hidden via CSS `display: none` cannot receive keyboard focus, breaking accessibility for screen reader and keyboard users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2` on the parent `<label>` wrapper to ensure the visual focus indicator is shown when the child input is focused via keyboard.
## 2024-05-18 - Improved keyboard accessibility for file inputs and checkboxes
**Learning:** The application previously used Tailwind's `hidden` class to visually hide `<input type="file">` and `<input type="checkbox">` elements. This inadvertently removed them from the document flow and tab order, making them inaccessible to screen readers and keyboard navigation.
**Action:** When hiding input elements that need to remain interactive via labels, use the `sr-only` class instead of `hidden`. To ensure clear visual feedback for keyboard users, add focus-within styles (e.g., `focus-within:ring-2 focus-within:ring-lime-500`) to the parent label element so the focus ring appears when the hidden input receives focus.
