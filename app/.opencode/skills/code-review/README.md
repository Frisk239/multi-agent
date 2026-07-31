# Code Review Skill

A structured skill for reviewing code changes in TypeScript/React/Next.js projects.

## Installation

Place this skill in your `.opencode/skills/` directory:

```
.opencode/
  skills/
    code-review/
      SKILL.md
      README.md
```

## Usage

The skill activates automatically when:
- You ask to review code
- You run `/code-review`
- Before committing changes
- During PR workflows

## Features

- TypeScript type checking
- Naming convention validation
- Component pattern verification
- Performance analysis
- Security review
- Test coverage check

## Customization

Edit `SKILL.md` to adjust:
- Naming conventions
- Component patterns
- Review criteria
- Output format

## Commands

```bash
# Run full review
pnpm typecheck && pnpm test

# Quick check
pnpm check
```
