# Encryption Standards: AES, RSA, & Hashing

## 1. Hashing Passwords (Argon2/BCrypt)

- Never store passwords in plain text.
- Use `Argon2` (preferred) or `BCrypt` with high cost factors and unique salts.

## 2. Encryption at Rest (AES-256)

- Encrypt sensitive data in the database (e.g., bank details, SSNs) using AES-256-GCM.
- Securely manage encryption keys (e.g., AWS KMS).

## 3. Encryption in Transit (TLS)

- Enforce HTTPS across all environments.
- Use TLS 1.2 or higher.

## 4. Hashing for Integrity (SHA-256)

- Use SHA-256 or higher to verify the integrity of files or large data objects.

## 5. Randomness (CSPRNG)

- Always use Cryptographically Secure Pseudo-Random Number Generators for generating keys, salts, and tokens.
