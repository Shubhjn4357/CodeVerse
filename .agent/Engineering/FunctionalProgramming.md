# Functional Programming in Modern JS/TS

## Pure Functions

- Given the same input, always return the same output.
- No side effects (no global state mutation, no I/O directly within the function).

## Immutability

- Avoid changing data; create new copies instead.
- Use `Readonly<T>` and `const` for data structures.

## Higher-Order Functions

- Functions that take other functions as arguments or return them (e.g., `map`, `filter`, `reduce`).

## Declarative vs Imperative

- Focus on _what_ to do (Functional) rather than _how_ to do it (Imperative).

## Currying and Composition

- Currying: Transforming a function that takes multiple arguments into a sequence of functions that each take a single argument.
- Composition: Combining multiple functions to create a new function.
