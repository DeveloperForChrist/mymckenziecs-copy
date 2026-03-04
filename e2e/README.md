# End-to-End Tests

This directory contains end-to-end tests for the MyMcKenzieCS application.

## Setup

To add e2e tests, install a testing framework:

```bash
npm install --save-dev playwright
# or
npm install --save-dev cypress
```

## Structure

- `auth.spec.ts` - Authentication flows
- `calendar.spec.ts` - Calendar functionality
- `documents.spec.ts` - Document upload and management
- `search.spec.ts` - Search functionality

## Running Tests

```bash
npm run e2e
npm run e2e:ui  # with UI
```
