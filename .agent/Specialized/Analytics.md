# Analytics & Event Tracking

## Tracking Strategy

1. **User Identity**: Assign unique, persistent IDs to every user.
2. **Consistent Schema**: Define a standard structure for event properties.
3. **Privacy First**: Strip PII (Personally Identifiable Information) from analytics events.

## Event Types

- **Generic**: `page_view`, `button_click`.
- **Business**: `invoice_created`, `payment_successful`, `new_party_added`.
- **System**: `api_error`, `performance_bottleneck`.

## Implementation

- Use a central `analytics.ts` utility.
- Buffer events to reduce API calls (batching).
- Support multiple providers (Posthog, Amplitude, GA4).
