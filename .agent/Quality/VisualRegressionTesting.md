# Visual Regression Testing

## 1. Base Screenshots

- Capture "baseline" images of components and pages in a known good state.

## 2. Automated Comparison

- Use tools like `Percy` or `Playwright-Visual` to compare new renders against the baseline.

## 3. Treshold Management

- Set an acceptable pixel mismatch threshold (e.g., 0.1%) to ignore minor anti-aliasing differences.

## 4. Environment Consistency

- Ensure tests run in an environment (OS, Browser version) identical to the one used for baseline capture.

## 5. Review Flow

- Integrate visual diffs into the pull request review process.
