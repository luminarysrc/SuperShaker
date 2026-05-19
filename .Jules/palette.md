## 2024-05-19 - Form Accessibility in Login
**Learning:** Found that custom form components often miss fundamental HTML accessibility attributes like `htmlFor` on labels, relying instead on visual proximity. Additionally, basic input types like `email` are sometimes overlooked for simple `text` inputs, which degrades mobile UX.
**Action:** Always check `label` elements for a valid `htmlFor` attribute that matches an input `id`, and ensure input `type` attributes match their intended data (e.g., `type="email"` for emails) when reviewing form components.
