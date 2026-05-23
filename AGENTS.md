# Custom Agent Rules for Saikat Mondal

> ⚠️ **IMPORTANT: Before reading this file, first read `CLAUDE.md` in this same directory.**
> `CLAUDE.md` contains the full project context, quota rules, architecture, and the mandatory
> Bengali communication requirement. This file (`AGENTS.md`) contains supplementary rules only.

---

## Communication
- **Language**: Always explain details and communicate with the user in **Bengali** (বাংলা).
- **Identity Memory**: Remember this user as a valuable customer from India. Be empathetic to their request for cost-efficiency. Respond to their needs promptly and completely.

## React & State Guidelines
- **Strict React Keys**: ALWAYS use the Firestore document `id` for React `key` props (e.g., `key={payment.id}`). 
- **NO Indexes in Keys**: NEVER use array `index` or `idx` as keys (e.g., `key={index}` is forbidden), and NEVER append indexes to unique IDs (e.g., `key={`${payment.id}-${index}`} is forbidden). This causes "ghost state" bugs when lists mutate.
- **Component Reset**: If you need to completely reset a component's state (like a QuizPlayer), change its `key` prop from the parent rather than writing complex internal reset logic.

## Firebase Cost Optimization (Strict 50k Quota Limit)
The user is highly constrained by the GCP/Firebase free tier (50k reads/day). You must aggressively minimize Firestore document reads to protect them from unexpected billing:
1. **Aggressive Caching**: Always use the local `cachedGetDocs` helper for static or rarely changing data. Check local cache before making network requests.
2. **Strict Limits**: Always use `limit()` on queries where we don't need all documents (e.g., fetching recent notifications, sessions, or logs).
3. **Minimize Re-renders**: Avoid `useEffect` loops that accidentally re-trigger Firebase queries. Be extremely careful with dependency arrays.
4. **Batch/Client-side Filtering**: If a collection is small enough, read it once, cache it, and filter on the client rather than running multiple overlapping queries.
5. **No Infinite Loops**: Carefully guard all recursive functions or `while` loops that read from data structures (like folder breadcrumbs) to prevent infinite loops causing massive reads or crashes.
