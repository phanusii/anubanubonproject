"use client";

import { Dispatch, SetStateAction, useEffect, useLayoutEffect, useRef, useState } from "react";

// Layout effect on the client, plain effect during the static build so React
// doesn't warn about useLayoutEffect on the server. Resolved once at module load
// (it never changes within an environment), so hook order stays stable.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * A `useState` whose value is seeded from a client-only synchronous cache
 * (localStorage / in-memory) WITHOUT breaking hydration.
 *
 * The initial render — the static build and the first client (hydration) render
 * — uses `serverValue`, so the hydrated DOM matches the prerendered HTML exactly.
 * The cached value is then applied in a layout effect, before the browser paints,
 * so the user still sees cached data instantly with no visible flash.
 *
 * Drop-in replacement for `useState(() => getInstantX())`:
 *   const [x, setX] = useInstantState(getInstantX, SERVER_DEFAULT);
 * `setX` behaves exactly like a normal state setter for later (network) updates.
 */
export function useInstantState<T>(readInstant: () => T, serverValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(serverValue);
  // Only the mount seed is automatic; once the caller has set its own value we
  // must not clobber it on a later re-run (the effect runs once, but guard anyway).
  const touched = useRef(false);
  const setTouched: Dispatch<SetStateAction<T>> = (next) => {
    touched.current = true;
    setValue(next);
  };
  useIsomorphicLayoutEffect(() => {
    if (touched.current) return;
    setValue(readInstant());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [value, setTouched];
}
