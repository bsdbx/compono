# Frontend

Before changing the stack, read [the stack decision](../docs/adr/0002-stack.md). Keep the existing appearance and interactions in `../.hidden/compono-alpha-screens-v2.zip`; refactoring the stack does not authorize product changes.

Route matching lives in `src/app/app.tsx`. Keep the editor mounted when switching components so its draft, panel state and Graph/Code selection survive navigation. API calls use the same origin and the backend's HttpOnly session cookie.
