---
name: design-system-aizox-dashboard-image-generation-chat-bot-html-t
description: Creates implementation-ready design-system guidance with tokens, component behavior, and accessibility standards. Use when creating or updating UI rules, component specifications, or design-system documentation.
---

<!-- TYPEUI_SH_MANAGED_START -->

# AIZOX Dashboard Image Generation & Chat Bot HTML Template

## Mission
Deliver implementation-ready design-system guidance for AIZOX Dashboard Image Generation & Chat Bot HTML Template that can be applied consistently across marketing site interfaces.

## Brand
- Product/brand: AIZOX Dashboard Image Generation & Chat Bot HTML Template
- URL: https://aizox.vercel.app/
- Audience: authenticated users and operators
- Product surface: marketing site

## Style Foundations
- Visual style: structured, accessible, implementation-first
- Main font style: `font.family.primary=Satoshi`, `font.family.stack=Satoshi, sans-serif`, `font.size.base=16px`, `font.weight.base=400`, `font.lineHeight.base=26px`
- Typography scale: `font.size.xs=10px`, `font.size.sm=14px`, `font.size.md=16px`, `font.size.lg=20px`, `font.size.xl=24px`, `font.size.2xl=30px`
- Color palette: `color.text.primary=#ffffff`, `color.text.secondary=#93929e`, `color.surface.base=#000000`, `color.surface.muted=#1a1a20`, `color.surface.raised=#0e0e14`, `color.border.muted=#2a2839`
- Spacing scale: `space.1=3px`, `space.2=3.75px`, `space.3=6px`, `space.4=7px`, `space.5=7.5px`, `space.6=8px`, `space.7=10px`, `space.8=11px`
- Radius/shadow/motion tokens: `radius.xs=2.5px`, `radius.sm=8px`, `radius.md=12px`, `radius.lg=32px`, `radius.xl=50px` | `motion.duration.instant=150ms`, `motion.duration.fast=300ms`

## Accessibility
- Target: WCAG 2.2 AA
- Keyboard-first interactions required.
- Focus-visible rules required.
- Contrast constraints required.

## Writing Tone
concise, confident, implementation-focused

## Rules: Do
- Use semantic tokens, not raw hex values in component guidance.
- Every component must define required states: default, hover, focus-visible, active, disabled, loading, error.
- Responsive behavior and edge-case handling should be specified for every component family.
- Accessibility acceptance criteria must be testable in implementation.

## Rules: Don't
- Do not allow low-contrast text or hidden focus indicators.
- Do not introduce one-off spacing or typography exceptions.
- Do not use ambiguous labels or non-descriptive actions.

## Guideline Authoring Workflow
1. Restate design intent in one sentence.
2. Define foundations and tokens.
3. Define component anatomy, variants, and interactions.
4. Add accessibility acceptance criteria.
5. Add anti-patterns and migration notes.
6. End with QA checklist.

## Required Output Structure
- Context and goals
- Design tokens and foundations
- Component-level rules (anatomy, variants, states, responsive behavior)
- Accessibility requirements and testable acceptance criteria
- Content and tone standards with examples
- Anti-patterns and prohibited implementations
- QA checklist

## Component Rule Expectations
- Include keyboard, pointer, and touch behavior.
- Include spacing and typography token requirements.
- Include long-content, overflow, and empty-state handling.

## Quality Gates
- Every non-negotiable rule must use "must".
- Every recommendation should use "should".
- Every accessibility rule must be testable in implementation.
- Prefer system consistency over local visual exceptions.

<!-- TYPEUI_SH_MANAGED_END -->
