// next/headers shim — the rr-app runs in the browser, where there is no Next.js
// request-scoped cookie/header store. The original server data layer
// (@/lib/supabase/server) imports cookies() at module scope; these stubs let
// that graph resolve so original components import cleanly. They are only ever
// *called* from server actions (task mutations), which are out of scope for the
// visual migration — so a benign no-op store is sufficient.
type CookieEntry = { name: string; value: string };

class CookieStoreStub {
  getAll(): CookieEntry[] {
    return [];
  }
  get(_name: string): CookieEntry | undefined {
    return undefined;
  }
  set(_name: string, _value?: string, _options?: unknown): void {}
  delete(_name: string): void {}
}

export async function cookies(): Promise<CookieStoreStub> {
  return new CookieStoreStub();
}

export async function headers(): Promise<Headers> {
  return new Headers();
}
