# Color Theory for Premium UI

## 1. Visual Hierarchy

- Use bold, varied colors for primary actions and soft, neutral colors for background elements.
- **60-30-10 Rule**: 60% dominant (neutral), 30% secondary, 10% accent (bright/vibrant).

## 2. HSL over HEX

- Prefer HSL (Hue, Saturation, Lightness) for easier adjustments and programmatic color generation.
- **Consistent Tonal Variations**: Build a palette based on different lightness levels of a few core hues.

## 3. Contrast & Accessibility (WCAG)

- Ensure a contrast ratio of at least 4.5:1 for normal text and 3:1 for large text.
- Use tools like Lighthouse to verify accessibility.

## 4. Semantic Colors

- Define standardized names: `primary`, `secondary`, `success`, `warning`, `danger`, `info`.

## 5. Dark Mode Strategies

- Use deep grays/navy instead of pure black (`#000000`) for backgrounds to reduce eye strain.
- Invert lightness while maintaining hue and saturation for icons and accents.
