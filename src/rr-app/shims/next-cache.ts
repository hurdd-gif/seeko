// next/cache shim — the rr-app has no Next.js server cache. The original server
// actions (e.g. createTask) call revalidatePath/revalidateTag after a mutation;
// in the migrated app those are no-ops (data is refetched via React Router
// loaders / explicit refresh). Importing this keeps the original components'
// module graph resolvable so they render verbatim.
export function revalidatePath(_path: string, _type?: 'layout' | 'page'): void {}
export function revalidateTag(_tag: string): void {}
export function unstable_noStore(): void {}
export function unstable_cache<T extends (...args: never[]) => unknown>(fn: T): T {
  return fn;
}
