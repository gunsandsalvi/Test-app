/**
 * GUARD — a missing write is a defect at its WRITE site, and it must fail there.
 *
 * The review found the same shape five times: a read that cannot find what it needs substitutes a
 * plausible value and carries on. Every one justified itself with legacy data, and there is no
 * legacy data here — every world is regenerated from seed — so each justification was protecting
 * a live bug rather than a historical one. The costs were not hypothetical: an FX lookup that
 * missed returned 1.0 and the exchange rate moved nothing for the model's whole life; a rate read
 * at parity is the §7.94 shape; a forgotten `listingStatus` silently lists a private firm.
 *
 * So the rule is the settlement layer's rule, applied everywhere: a defect throws where it
 * happens, naming what is missing and where to go and set it. The UI is the one exception — it
 * renders an absence (an em dash), because a user-facing surface must not crash on a gap and must
 * not invent a number to fill one either.
 */
export function defect(what: string): never {
  throw new Error(`ENGINE DEFECT: ${what}`);
}

/**
 * Exhaustiveness, enforced twice (§7.241): at COMPILE time the parameter type is `never`, so a
 * switch over a union that gains a member fails to build at every `assertNever` default until the
 * new member is handled; at RUN time (a value smuggled past the types) it is a defect, not a
 * silent fall-through. The recorded costs of the silent form: an unhandled settlement party kind
 * deleted its money without touching `unresolvedUSD`; an unhandled asset type froze positions at
 * entry price forever.
 */
export function assertNever(value: never, where: string): never {
  throw new Error(`ENGINE DEFECT: unhandled kind '${String(value)}' at ${where}`);
}
