# API Versioning Strategies

## 1. URL Versioning

Include the version number in the URL (e.g., `/v1/users`). This is the most common and visible strategy.

## 2. Header Versioning

Define the version in a custom header (e.g., `X-API-Version: 1`). This keeps URLs clean and avoids breaking existing links.

## 3. Query Parameter Versioning

Include the version in a query parameter (e.g., `/users?v=1`). This is similar to URL versioning but can be more flexible.

## 4. Media Type Versioning

Define the version in the `Accept` header's media type (e.g., `Accept: application/vnd.myapi.v1+json`). This follows RESTful principles but can be more complex.

## 5. Compatibility

Ensure that your API versioning strategy supports backward compatibility as much as possible to avoid breaking client applications.

Jonas
