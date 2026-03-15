# Performance Auditing & Optimization

## Core Web Vitals

- **LCP (Largest Contentful Paint)**: Optimize image loading and reduce main-thread work.
- **FID (First Input Delay)**: Keep JavaScript execution time low (< 50ms for interaction).
- **CLS (Cumulative Layout Shift)**: Reserved space for images/ads using aspect ratios.

## Optimization Techniques

1. **Code Splitting**: Dynamic imports for heavy routes/components.
2. **Memoization**: Prevent unnecessary re-renders in large lists.
3. **Caching**: Use `swr` or `react-query` for efficient data fetching and local caching.
4. **Image Optimization**: Use Next.js `Image` or standard WebP formats.
