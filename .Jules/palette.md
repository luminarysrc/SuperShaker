## 2024-05-24 - File Input Accessibility
**Learning:** File inputs (`<input type="file">`) hidden via CSS `display: none` cannot receive keyboard focus, breaking accessibility for screen reader and keyboard users.
**Action:** Use visually hidden utility classes (`sr-only`) on the input, and use `focus-within:ring-2` on the parent `<label>` wrapper to ensure the visual focus indicator is shown when the child input is focused via keyboard.

## 2024-07-04 - [File Inputs Keyboard Accessibility]
**Learning:** Found an accessibility issue pattern across components where interactive hidden inputs (like `<input type="file" className="hidden" />`) were not keyboard focusable, preventing users from navigating them via keyboard.
**Action:** Replace `hidden` class with `sr-only` to preserve keyboard focusability for visually hidden interactive inputs. Add `focus-within` styles (e.g., `focus-within:ring-2 focus-within:ring-lime-500 focus-within:outline-none`) to their parent wrapper (`<label>`) so sighted users get clear visual focus indicators.
