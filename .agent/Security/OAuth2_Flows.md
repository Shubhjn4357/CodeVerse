# OAuth2 & OpenID Connect (OIDC) Flows

## 1. Authorization Code Flow with PKCE

- The most secure flow for mobile and single-page apps (SPAs).
- PKCE (Proof Key for Code Exchange) protects against authorization code interception.

## 2. Client Credentials Flow

- Used for machine-to-machine communication (e.g., between two backend services).

## 3. ID Tokens vs Access Tokens

- **ID Token**: Proves that the user is authenticated (OIDC). Contains user profile info.
- **Access Token**: Grants access to specific resources (OAuth2).

## 4. Scopes & Permissions

- Request the minimum scopes necessary (`openid`, `profile`, `email`, `offline_access`).

## 5. Logout Strategy

- Implement OIDC End Session endpoint to ensure global logout across all linked services.
