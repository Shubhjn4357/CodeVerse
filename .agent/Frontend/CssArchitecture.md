# CSS Architecture: SASS/SCSS & BEM

## 1. BEM (Block, Element, Modifier)

- **Block**: Standalone entity (`.card`).
- **Element**: Part of a block (`.card__title`).
- **Modifier**: Variation of a block or element (`.card--featured`, `.card__title--small`).

## 2. SASS Nesting

- Use nesting sparingly (max 3 levels deep) to keep specificity low and maintainability high.

## 3. Variables & Mixins

- Centralize colors, fonts, and common patterns (e.g., flex-center) into SASS variables and mixins.

## 4. Partials & Importing

- Organize CSS into small, modular files (e.g., `_buttons.scss`, `_header.scss`) and import them into a main stylesheet.

## 5. Utility-First vs Component-First

- Decide on a consistent strategy: either utility classes (Tailwind style) or semantic component classes (BEM style).
