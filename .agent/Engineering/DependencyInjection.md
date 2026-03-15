# Dependency Injection & Inversion of Control

## IoC (Inversion of Control)

- Design principle in which a software component's dependencies are provided by an external framework or container, rather than the component managing them itself.

## Dependency Injection (DI)

- Pattern that implements IoC by injecting dependencies into a class's constructor, properties, or methods.
- **Constructor Injection**: Preferred method for mandatory dependencies.
- **Setter Injection**: Used for optional dependencies.

## Advantages

- **Decoupling**: Components are less tethered to specific implementations.
- **Testability**: Dependencies can be easily mocked or stubbed.
- **Maintainability**: Swapping implementations requires minimal code changes.
