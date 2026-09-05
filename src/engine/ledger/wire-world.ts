/**
 * §3.13-BOOK d2 — THE WORLD A WIRE RESOLVES AGAINST.
 *
 * The entity store is the two arrays (`companies`, `institutionalEntities`) and the region table;
 * the instrument store is the INSTRUMENT INDEX (§3.13-BOOK dI, `engine2/instruments.ts`): every
 * tranche, every company's equity and every fund's shares are declared there when issued, so a
 * wire's instrument resolves by one read and the sets this file used to keep for equity and fund
 * shares are gone. This builds the resolver `wire.ts` asks — the party sets filled once at the
 * week's (or the seed's) start and grown by `admit` at each birth — so a wire naming anything
 * outside those spaces is refused at the site.
 *
 * HOUSE answers `undefined`: the index does not hold houses yet (slice g); until it does they are
 * unchecked, and this file says so rather than passing them. CONTRACT resolves against the index
 * like every other instrument kind (§3.13-BOOK dII: the books the adapters mint are declared).
 */
import { DWELLING_ASSET_PREFIX } from '../../domain/housing';
import type { V2World } from '../../engine2/world';
import { isRegisteredInstrument } from '../../engine2/instruments';
import { SUBUNITS } from '../../engine2/state';
import { REGION_IDS, CURRENCY_CODES } from '../../domain/geography';
import { asInstrumentId } from '../../domain/ids';
import { assertNever } from '../../domain/defect';
import type { PartyRef } from '../../domain/party';
import type { AssetKind, WireWorld } from './wire';

const INSTRUMENT_KINDS: ReadonlySet<AssetKind> = new Set<AssetKind>(['CORP_BOND', 'LEVERAGED_LOAN', 'GOV_BOND', 'COMMERCIAL_PAPER', 'BANK_FACILITY', 'EQUITY', 'ETF_SHARE', 'MMF_SHARE', 'PE_FUND_INTEREST', 'CONTRACT']);

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
        case 'SEGMENT': case 'HOUSEHOLD': case 'GOVERNMENT': case 'CENTRAL_BANK': case 'CLEARING_HOUSE': case 'CCP': return regions.has(ref.region);
        default: return assertNever(ref, 'wireWorld.partyExists');
      }
    },
    instrumentExists(kind: AssetKind, asset: string): boolean | undefined {
      // An instrument that was EVER issued resolves: the index is permanent, so a register row of
      // paper retired this week is still moved to the paying agent after the ladder row is freed.
      if (INSTRUMENT_KINDS.has(kind)) return isRegisteredInstrument(v2, asInstrumentId(asset));
      switch (kind) {
        case 'GOOD': return goods.has(asset);
        case 'MONEY': return currencies.has(asset);
        case 'HOUSE': return asset.startsWith(DWELLING_ASSET_PREFIX) && regions.has(asset.slice(DWELLING_ASSET_PREFIX.length));
        case 'PLANT': return asset === 'PLANT' || asset === 'PLANT_QUEUE';
        case 'EQUITY': case 'ETF_SHARE': case 'MMF_SHARE': case 'PE_FUND_INTEREST': case 'CONTRACT':
        case 'CORP_BOND': case 'LEVERAGED_LOAN': case 'GOV_BOND': case 'COMMERCIAL_PAPER': case 'BANK_FACILITY': return undefined; // handled above
        default: return assertNever(kind, 'wireWorld.instrumentExists');
      }
    },
    admit(ref: PartyRef): void {
      switch (ref.kind) {
        case 'COMPANY': case 'BANK': case 'BANK_CREDIT': case 'BANK_SECURITIES': companyIds.add(ref.id); return;
        case 'INSTITUTION': institutionIds.add(ref.id); return;
        case 'SEGMENT': case 'HOUSEHOLD': case 'GOVERNMENT': case 'CENTRAL_BANK': case 'CLEARING_HOUSE': case 'CCP': return;
        default: return assertNever(ref, 'wireWorld.admit');
      }
    },
  };
}
