# Single Source of Truth: Constants & Configuration

## Rules

1. **Centralization**: All non-changeable text, magic numbers, and config must reside in `constants/` or `.env`.
2. **PascalCase for Constants**: Use `UPPER_SNAKE_CASE` for global constants.
3. **No Hardcoded Strings**: Even UI labels should be pulled from a constants file or i18n store.

## Implementation

```typescript
// constants/billing.ts
export const INVOICE_STATUS = {
  PAID: 'paid',
  PENDING: 'pending',
  OVERDUE: 'overdue',
} as const;

export const TAX_RATES = {
  GST: 0.18,
  VAT: 0.05,
} as const;
```
