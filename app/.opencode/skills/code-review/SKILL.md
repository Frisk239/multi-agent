---
name: code-review
description: Use when reviewing code changes, validating code quality, checking naming conventions, or before committing changes in TypeScript/React/Next.js projects
---

# Code Review Skill

A structured skill for reviewing code changes in TypeScript/React/Next.js projects. Ensures code quality, consistency, and correctness.

## When to Use

- Before committing changes
- During PR reviews
- When asked to review code
- When validating code quality
- When checking naming conventions and style

## Review Process

### Phase 1: Static Analysis

1. **Run type checking**
   ```bash
   pnpm typecheck
   ```
   - Fix all TypeScript errors before proceeding

2. **Run linting** (if configured)
   ```bash
   # Check for lint config
   ls .eslintrc* eslint.config.* .prettierrc* 2>/dev/null || echo "No lint config found"
   ```

3. **Run tests**
   ```bash
   pnpm test
   ```

### Phase 2: Code Quality Checks

#### Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Variables/functions | camelCase | `getIssueById`, `isLoading` |
| Components | PascalCase | `ErrorState`, `IssueCard` |
| Hooks | `use` prefix + PascalCase | `useIssue`, `useCreateIssue` |
| Types/interfaces | PascalCase | `Issue`, `CreateIssueInput` |
| Constants | UPPER_SNAKE_CASE | `API_BASE_URL` |
| Files (components) | PascalCase.tsx | `ErrorState.tsx` |
| Files (hooks/lib) | camelCase.ts | `useIssue.ts` |
| Files (utils) | camelCase.ts | `formatDate.ts` |

#### Component Patterns

```typescript
// ✓ Correct pattern
'use client';
import React from 'react';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  children?: ReactNode;
}

export function MyComponent({ title, children }: Props) {
  return (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  );
}
```

#### Hook Patterns

```typescript
// ✓ Correct pattern
'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useMyData(id: string) {
  return useQuery<Data>({
    queryKey: ['my-data', id],
    queryFn: async () => {
      const res = await fetch(`${API}/data/${id}`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    enabled: !!id,
  });
}
```

#### Import Order

```typescript
// 1. React/Next.js imports
import React from 'react';
import { useRouter } from 'next/navigation';

// 2. External libraries
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

// 3. Internal shared types
import type { Issue, IssueLabel } from '@ma/shared';

// 4. Internal components/hooks
import { useIssue } from '@/lib/api';
import { ErrorState } from '@/components/ErrorState';

// 5. Local imports
import { formatDate } from './utils';
```

### Phase 3: Functional Review

#### Error Handling

```typescript
// ✓ Correct - always handle errors
try {
  const result = await riskyOperation();
  return result;
} catch (err) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  toastError(message);
  throw err;
}

// ✗ Wrong - swallowing errors
try {
  const result = await riskyOperation();
  return result;
} catch {
  return null;
}
```

#### State Management

```typescript
// ✓ Correct - optimistic updates with rollback
const qc = useQueryClient();
return useMutation({
  mutationFn: updateItem,
  onMutate: async (newData) => {
    await qc.cancelQueries({ queryKey: ['items'] });
    const prev = qc.getQueryData(['items']);
    qc.setQueryData(['items'], (old) => [...old, newData]);
    return { prev };
  },
  onError: (err, vars, ctx) => {
    if (ctx?.prev) {
      qc.setQueryData(['items'], ctx.prev);
    }
    toastError('Update failed');
  },
});
```

#### Performance

- Avoid unnecessary re-renders with `React.memo` or `useMemo`
- Use `useCallback` for event handlers passed to children
- Prefer `useQuery` over manual fetch + state
- Use `enabled` option to prevent unnecessary API calls

### Phase 4: Security Review

- [ ] No secrets in code (API keys, passwords)
- [ ] No hardcoded URLs (use environment variables)
- [ ] Proper input validation (Zod schemas)
- [ ] No sensitive data in console.log
- [ ] Proper error messages (no stack traces to users)

### Phase 5: Test Coverage

```bash
# Check test coverage
pnpm test:coverage
```

- [ ] New features have tests
- [ ] Edge cases covered
- [ ] Error scenarios tested
- [ ] Tests are readable and maintainable

## Review Checklist

### Code Quality
- [ ] No TypeScript errors
- [ ] No lint errors (if configured)
- [ ] All tests pass
- [ ] No console.log (except debugging)
- [ ] No commented-out code

### Naming & Style
- [ ] Follows naming conventions
- [ ] Consistent with existing code
- [ ] Descriptive variable/function names
- [ ] No single-letter variables (except loops)

### Components
- [ ] Props are typed with interface/type
- [ ] Proper use of React hooks
- [ ] No inline styles (use CSS modules/styled-components)
- [ ] Accessibility (aria labels, semantic HTML)

### Performance
- [ ] No unnecessary re-renders
- [ ] Proper memoization where needed
- [ ] Efficient queries (caching, enabled flag)
- [ ] No memory leaks (cleanup in useEffect)

### Security
- [ ] No secrets hardcoded
- [ ] Input validation
- [ ] Proper error handling
- [ ] No sensitive data exposure

## Output Format

Provide feedback in this format:

```
## Code Review Summary

### ✓ Good
- [Positive aspects]

### ⚠️ Issues Found
- [Issues that should be fixed]

### 💡 Suggestions
- [Optional improvements]

### 📊 Metrics
- Type errors: 0
- Test failures: 0
- Coverage: XX%
```

## Common Patterns in This Project

### API Hook Pattern

```typescript
export function useEntity(id: string) {
  return useQuery<Entity>({
    queryKey: ['entity', id],
    queryFn: async () => {
      const res = await fetch(`${API}/entities/${id}`);
      if (!res.ok) throw new Error('Not found');
      return res.json();
    },
    enabled: !!id,
  });
}
```

### Mutation Pattern

```typescript
export function useCreateEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateEntityInput) => {
      const res = await fetch(`${API}/entities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await apiError(res, 'Create failed'));
      return res.json() as Promise<Entity>;
    },
    onSuccess: (entity) => {
      qc.invalidateQueries({ queryKey: ['entities'] });
      toastSuccess('Created');
    },
    onError: (err) => toastError(err.message),
  });
}
```

### Error Handling Pattern

```typescript
function errMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
```

## Quick Commands

```bash
# Full review
pnpm typecheck && pnpm test

# Quick check
pnpm check

# Watch mode for development
pnpm test:watch
```

## Notes for AI Coders

When reviewing AI-generated code:
1. Always run `pnpm typecheck` first
2. Check for proper error handling
3. Verify naming conventions are followed
4. Ensure no secrets are exposed
5. Validate test coverage

## Notes for Human Coders

1. Use this checklist before committing
2. Run `pnpm check` for quick validation
3. Focus on naming and readability
4. Ensure consistency with existing patterns
