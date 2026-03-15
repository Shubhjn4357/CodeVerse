# Holy Grail Layout & Modern Grids

## 1. The Holy Grail Layout

- Header, Main Content (with sidebars), and Footer.
- Use CSS Grid for the most robust implementation.

## 2. Flexbox for Micro-Layouts

- Perfect for navbars, card headers, and button groups.

## 3. Subgrid & Nested Grids

- Use `grid-template-columns: subgrid` to align nested elements with the parent grid.

## 4. Aspect Ratio Control

- Use `aspect-ratio` property to reserve space for images and videos, preventing Layout Shift (CLS).

## 5. Container Queries

- Favor `@container` over `@media` for components that need to respond to their parent container's size rather than the viewport.

## 6. Sticky & Overlay Elements

- Use `position: sticky` for persistent navs and sidebars.
- Implementation of glassmorphism on sticky headers for a premium floating feel.
