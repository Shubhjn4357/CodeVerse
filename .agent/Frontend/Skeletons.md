# Skeleton Loading & Perceived Performance

## UX Strategy

1. **Immediate Feedback**: Show skeletons instantly when data fetching begins.
2. **Layout Consistency**: Skeletons must match the dimensions and layout of the final content to prevent layout shifts (CLS).
3. **Animation**: Use a slow, rhythmic "pulse" or "shimmer" effect.

## Implementation Guide

- **Primitive Components**: Create a base `<Skeleton />` component with configurable width/height/radius.
- **Composition**: Wrap sets of skeletons in a container that mirrors the actual component's structure.
- **Transition**: Smoothly fade out the skeleton and fade in the content once loaded.
