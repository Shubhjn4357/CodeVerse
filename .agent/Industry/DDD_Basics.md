# Domain-Driven Design (DDD) Basics

## 1. Ubiquitous Language

- The same terminology should be used by developers, business analysts, and domain experts.

## 2. Bounded Contexts

- A clear boundary within which a particular domain model is defined and applicable.

## 3. Entities vs Value Objects

- **Entity**: An object defined by its identity (e.g., `User`).
- **Value Object**: An object defined only by its attributes (e.g., `Address`, `Money`).

## 4. Aggregates & Roots

- A cluster of domain objects that can be treated as a single unit. Every aggregate has a single root.

## 5. Domain Events

- Something that happened in the domain that you want other parts of the same domain (or other domains) to be aware of.
