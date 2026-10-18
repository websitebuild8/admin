# Shared appearance — 19 October 2026

The appearance button offers **Light**, **Dark** and **System**. It sits beside
the logo on the homepage, partner application and Rider header. Admin and Partner
workspaces place it beside the sidebar logo (open the navigation menu on mobile).
Its 44-pixel square trigger keeps the sun/moon/monitor icon centered without
inheriting the select control's default spacing.
System is the default. The choice applies to the homepage, Admin, Partner and
Rider portals, registration, sign-in, settings, dialogs and invoice documents.
Pages without a shared header have an appearance button in the top corner.

The preference is saved on the current browser/device under `igo-appearance`,
survives reloads and synchronizes between tabs on the same website. It does not
change the user's role, permissions or database records. Separate devices can
keep their own preference. Mobile browser/PWA theme colors follow the selected
appearance as well.

## Palette and implementation

Dark mode uses a charcoal canvas (`#11151b`), layered blue-grey surfaces,
soft white foregrounds, muted supporting text and a restrained yellow accent.
Success, warning and error colors use separate tinted surfaces and readable
text. Logos and images retain their original colors; no image inversion/filter
is applied. External Google Maps content remains controlled by Google.

`src/components/theme/provider.tsx` uses the existing `next-themes` dependency
with a root `class` attribute, system detection and its early initialization
script. The root HTML warning suppression is limited to the theme-managed
element. The shadcn/Base UI select supports keyboard and touch interaction with
44-pixel appearance triggers. Selection UI waits for hydration without replacing
page content. Mode changes temporarily disable transitions; the existing
reduced-motion behavior remains intact.

`src/app/theme.css` defines the shared semantic dark colors and portal styles.
The five feature stylesheets reference these roles with their exact previous
light colors as fallbacks. Portalled menus, dialogs, skeletons and toasts also
use the shared shadcn tokens. Native controls use `color-scheme`; autofill,
selection, focus rings and higher-contrast preferences have explicit styling.
Clerk's default theme follows the root color scheme, including its account menu.

Dark tokens apply to screen media only. Existing light invoice print rules are
preserved, and appearance controls are hidden from printing. Invoice due and
partial-payment badges use a warning treatment on screen. A stale invoice-footer
sentence referring to parcel payments/payouts was removed to match the existing
no-cash-on-delivery service. Amounts, verification and invoice eligibility logic
are unchanged.

Phone headers retain room for theme, notifications, role switching and the
profile menu. Very narrow dashboard screens use one summary-card column so
currency values do not break in the middle of a number.

## Verification

- Shared normal text/background pairs were checked with the WCAG contrast
  formula. All 12 key pairs meet 4.5:1; the lowest is 4.91:1. This is a palette
  check, not a complete accessibility audit or certification.
- Removing the new color-token references produces byte-for-byte identical
  originals for all five feature stylesheets. This verifies the preserved light
  colors and print declarations; the added control and narrow-screen layouts
  are intentional additions.
- The actual local production app was checked with the existing signed-in
  session in Admin, Partner and Rider. Tables, cards, role switching, an existing
  package-details dialog and the Clerk account menu use dark surfaces.
- A production-page reload preserved dark mode before the theme selector
  hydrated, with no recorded hydration/browser errors. A second tab opened with
  the saved theme; changing it to Light updated the Rider tab. System matched
  the browser's actual dark system preference. OS preference changes were not
  manually simulated. The original System selection was restored after QA.
- Keyboard Home/Enter selected Light successfully. The final 320-pixel Rider
  header keeps the logo and controls separated, and the 320-pixel homepage
  retains visible theme, rider-registration and sign-in controls without
  horizontal overflow. Mobile registration fields were checked at 390 pixels.
- Registration fields and an invoice document were checked separately with
  fictional preview data. The registration preview replaces Next navigation,
  authentication transport and route-transition wrappers; it does not verify
  registration submission or actual route-animation behavior. No application,
  delivery, payment or notification was submitted.
- Changed-source ESLint, whitespace checks and the production build including
  TypeScript pass. Database integration tests were not rerun for this appearance
  change. Printed styling was checked in source; no printer/PDF export was run.

No package installation, database migration or new credentials are required.
The changes need the owner's manual VS Code commit/push and Netlify deployment.
No commit, push or hosted deployment was performed here.

## References

- [shadcn Next.js dark-mode setup](https://ui.shadcn.com/docs/dark-mode/next)
- [next-themes documentation](https://github.com/pacocoursey/next-themes)
- [Clerk themes and color-scheme support](https://clerk.com/docs/js-frontend/guides/customizing-clerk/appearance-prop/themes)
