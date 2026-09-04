/**
 * §3.13-BOOK d2 — THE WORLD A WIRE RESOLVES AGAINST.
 *
 * The entity store is the two arrays (`companies`, `institutionalEntities`) and the region table;
 * the instrument stores are the tranche store, the company table (equity is keyed by the issuer's
 * own id) and the fund entities (a fund's shares are keyed by the fund's id). This builds the
 * resolver `wire.ts` asks — one Set per space, filled once at the week's (or the seed's) start
 * and grown by `admit` at each birth — so a wire naming anything outside those spaces is refused
 * at the site.
 *
 * HOUSE and CONTRACT answer `undefined`: no store indexes them yet. Slice (d)'s instrument index
 * is what turns those two into a yes or a no; until then they are unchecked, and this file says so
 * rather than passing them.
 */
import type { V2World } from '../../engine2/world';
import { instrumentRefOf } from '../../engine2/world';
import { SUBUNITS } from '../../engine2/state';
import { REGION_IDS, CURRENCY_CODES } from '../../domain/geography';
import { asInstrumentId } from '../../domain/ids';
import { assertNever } from '../../domain/defect';
import type { PartyRef } from '../../domain/party';
import type { AssetKind, WireWorld } from './wire';

const TRANCHE_KINDS: ReadonlySet<AssetKind> = new Set<AssetKind>(['CORP_BOND', 'LEVERAGED_LOAN', 'GOV_BOND', 'COMMERCIAL_PAPER', 'BANK_FACILITY']);

export function wireWorldOf(
  v2: V2World,
  companies: readonly { id: string }[],
  institutions: readonly { id: string }[],
): WireWorld {
  const companyIds = new Set<string>();
  for (const c of companies) companyIds.add(c.id);
  const institutionIds = new Set<string>();
  for (const e of institutions) institutionIds.add(e.id);
  const regions = new Set<string>(REGION_IDS);
  const currencies = new Set<string>(CURRENCY_CODES);
  const goods = new Set<string>(SUBUNITS);
  return {
    partyExists(ref: PartyRef): boolean {
      switch (ref.kind) {
        case 'COMPANY': case 'BANK': case 'BANK_CREDIT': case 'BANK_SECURITIES': return companyIds.has(ref.id);
        case 'INSTITUTION': return institutionIds.has(ref.id);
        case 'SEGMENT': case 'HOUSEHOLD': case 'GOVERNMENT': case 'CENTRAL_BANK': case 'CLEARING_HOUSE': return regions.has(ref.region);
        default: return assertNever(ref, 'wireWorld.partyExists');
      }
    },
    instrumentExists(kind: AssetKind, asset: string): boolean | undefined {
      // A tranche that EVER existed resolves: a register row of paper retired this week is still
      // moved to the paying agent after the ladder row is freed (`issuerRefByIdRef` is permanent
      // for exactly that reason), and a wire against a live row alone would refuse it.
      if (TRANCHE_KINDS.has(kind)) return v2.tranches.issuerRefByIdRef.has(instrumentRefOf(v2, asInstrumentId(asset)));
      switch (kind) {
        case 'EQUITY': return companyIds.has(asset);
        case 'ETF_SHARE': case 'MMF_SHARE': return institutionIds.has(asset);
        case 'GOOD': return goods.has(asset);
        case 'MONEY': return currencies.has(asset);
        case 'HOUSE': case 'CONTRACT': return undefined;
        case 'CORP_BOND': case 'LEVERAGED_LOAN': case 'GOV_BOND': case 'COMMERCIAL_PAPER': case 'BANK_FACILITY': return undefined; // handled above
        default: return assertNever(kind, 'wireWorld.instrumentExists');
      }
    },
    admit(ref: PartyRef): void {
      switch (ref.kind) {
        case 'COMPANY': case 'BANK': case 'BANK_CREDIT': case 'BANK_SECURITIES': companyIds.add(ref.id); return;
        case 'INSTITUTION': institutionIds.add(ref.id); return;
        case 'SEGMENT': case 'HOUSEHOLD': case 'GOVERNMENT': case 'CENTRAL_BANK': case 'CLEARING_HOUSE': return;
        default: return assertNever(ref, 'wireWorld.admit');
      }
    },
  };
}
