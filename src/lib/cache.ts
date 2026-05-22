import { getDocs, Query } from 'firebase/firestore';

const globalCache = new Map<string, { snap: any, time: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function cachedGetDocs(q: Query, cacheKey: string) {
    const cached = globalCache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
        return cached.snap;
    }
    const snap = await getDocs(q);
    globalCache.set(cacheKey, { snap, time: Date.now() });
    return snap;
}

export function clearCache(key?: string) {
    if (key) globalCache.delete(key);
    else globalCache.clear();
}
