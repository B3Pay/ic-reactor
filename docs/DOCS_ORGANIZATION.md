# Documentation Organization Update

We have reorganized the documentation to support package-specific views and a "Core" mode that hides React specific content.

## Changes Overview

1.  **Sidebar Filtering**: `src/components/Sidebar.astro`
    - Dynamically filters the sidebar based on the URL.
    - Path `/packages/candid` -> Shows Candid docs only.
    - Path `/packages/parser` -> Shows Parser docs only.
    - Other paths -> Shows Core/React docs (hides "Packages" group).

2.  **Package Mode Switcher**: `src/components/SiteTitle.astro`
    - Enhanced the package dropdown to include "Core" and "React".
    - Uses `localStorage` to persist preference between "Core" and "React" views.
    - Applies `data-package-mode` attribute to the `<body>` tag.

3.  **Visual Filtering**: `src/styles/custom.css` & `astro.config.mjs`
    - Added `class: "react-only"` to React-specific sidebar items in `astro.config.mjs`.
    - Added CSS rule to hide `.react-only` elements when `body[data-package-mode="core"]`.

## How to Use

- **Core Mode**: Select "Core" from the dropdown. React-specific sections (Framework, Examples, Hooks) will be hidden.
- **React Mode**: Select "React" from the dropdown. All documentation (Core + React) is visible.
- **Package Specific**: Select "@ic-reactor/candid" etc. or navigate to their URL to see isolated package docs.

## Developer Note

When adding new React-specific documentation pages or sections in `astro.config.mjs`, remember to add `attrs: { class: "react-only" }` to the sidebar item so it gets correctly filtered in Core mode.
