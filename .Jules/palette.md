## 2024-05-15 - Interactive inputs accessibility
**Learning:** Hidden interactive inputs (such as `<input type="file">` or `<input type="checkbox">`) should use the `sr-only` class instead of `hidden` to remain keyboard focusable.
**Action:** Use `sr-only` on visually hidden inputs and add focus styles (e.g., `focus-within:ring-2 focus-within:ring-lime-500 focus-within:outline-none`) to their parent label elements.
