## 2024-05-18 - Missing ARIA Labels and Focus States on Icon-Only Buttons
**Learning:** I found a consistent accessibility issue pattern across this app's components: icon-only buttons (like those in the sidebar and toolbars) lack `aria-label` attributes and proper keyboard focus states (`focus:outline-none` is often used without a visible alternative).
**Action:** When working on UI components in this app, always ensure icon-only buttons include an `aria-label` and visible keyboard focus states (e.g., using Tailwind's `focus-visible:ring-2 focus-visible:outline-none`).
