# Animation Principles & Motion

## Core Rules

1. **Purpose-Driven**: Every animation must serve a purpose (e.g., feedback, hierarchy, entry).
2. **Smooth Transitions**: Standard durations: `200ms` for small transitions, `400-600ms` for larger layout shifts.
3. **Easing**: Use `cubic-bezier(0.4, 0, 0.2, 1)` for natural motion. Avoid linear timing.
4. **Staggering**: Stagger entry of list items to create a flow effect.

## Library Standards

- **Framer Motion**: Default for complex UI transitions.
- **GSAP**: Use for high-performance timeline-based animations.
- **CSS Transitions**: Preferred for simple hover and focus states.
