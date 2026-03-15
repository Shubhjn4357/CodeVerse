# Role-Based Access Control (RBAC)

## 1. Roles & Permissions Mapping

- Define a strict mapping between roles (e.g., `Admin`, `Editor`, `Viewer`) and granular permissions (e.g., `read:invoice`, `write:invoice`).

## 2. Hierarchy

- Implement role inheritance (e.g., `Admin` inherits all permissions of `Editor`).

## 3. Middleware Enforcement

- Use centralized middleware to check for required permissions before granting access to a route or server action.

## 4. Least Privilege Principle

- Users should be given only the permissions necessary to perform their specific job functions.

## 5. UI Guarding

- Dynamically enable or disable UI elements based on the current user's role and permissions.
