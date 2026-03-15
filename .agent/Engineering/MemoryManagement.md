# Memory Management in JS/TS

## 1. Stack vs Heap

- **Stack**: Stores static data (primitives, pointers) where the size is known at compile time.
- **Heap**: Stores objects and functions where the size is dynamic and known at runtime.

## 2. Garbage Collection (GC)

- The process of freeing up memory that is no longer being used.
- Most modern JS engines use the **Mark-and-Sweep** algorithm.

## 3. Memory Leaks

- **Global Variables**: Unintended global variables that stay in memory forever.
- **Forgotten Timers**: `setInterval` calls that never get cleared.
- **Closures**: Functions that hold onto large objects in their parent scope unnecessarily.
- **Detached DOM Nodes**: Keeping references to DOM nodes that have been removed from the document.

## 4. Best Practices

- **Explicit Cleanup**: Use `useEffect` cleanup functions to remove event listeners and clear intervals.
- **WeakMap/WeakSet**: Use for objects that should be garbage collected if no other references exist.
- **Minimize Scope**: Keep variables as local as possible.
