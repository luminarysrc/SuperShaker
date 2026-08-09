## 2024-08-09 - Accessible File Inputs and Checkboxes
**Learning:** Using `className="hidden"` on `<input type="file">` and `<input type="checkbox">` elements removes them from the accessibility tree, making them unfocusable via keyboard navigation.
**Action:** Use `className="sr-only"` instead of `hidden` to keep elements accessible to screen readers and keyboard users, and apply `focus-within:ring-2 focus-within:ring-lime-500 focus-within:outline-none` to their parent `<label>` elements so focus is visibly indicated.
