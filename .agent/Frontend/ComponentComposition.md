# Component Composition vs Inheritance

## 1. Containment (Children Prop)

- Use `props.children` to pass elements directly into their output.
- Excellent for generic "boxes" like Sidebars, Dialogs, or Cards.

## 2. Specialization

- Create more specific components that render more generic ones and configure them with props (e.g., `WelcomeDialog` renders `Dialog`).

## 3. Render Props

- A technique for sharing code between React components using a prop whose value is a function.

## 4. Compound Components

- A pattern where multiple components work together to form a stateful unit (e.g., `Select` and `Option`).

## 5. Slots Pattern

- Passing multiple components as named props (e.g., `leftIcon`, `rightIcon`, `header`, `footer`) for high flexibility.
