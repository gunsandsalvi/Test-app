/**
 * §3.13-READ D1 — THE GRAMMAR OF A CLEARING PARTICIPANT'S ID, minted and read in one place.
 *
 * A clearing book's auction names its bidders by string, and those strings encode WHO the bidder
 * is — an institution by its own entity id, a bank's securities desk, a company treasury, the
 * central bank, a region's households, a market-making desk. Six books then had to turn a fill
 * back into a `PartyRef` to settle its cash, and each wrote that translation itself: **six copies,
 * three incompatible conventions for the bank arm alone.** 07c matched a Set of plain tickers;
 * 07f's bill book matched a `BANK-` prefix and re-parsed it with a hardcoded `slice(5)`; the other
 * four had no bank arm at all. The `BANK-` prefix was minted in two files and parsed in three,
 * with three different spellings of "take off the prefix" (`slice(5)`, and `replace('BANK-','')`
 * twice) — a grammar nobody owned.
 *
 * This file owns it. `instrument-keys.ts` did the same for the instrument id space and the rule
 * is the same one: a key format with no named constructor is a format every reader re-invents,
 * and they drift.
 */
import type { RegionId } from './geography';

const BANK_PREFIX = 'BANK-';
const TREASURY_PREFIX = 'TREASURY-';
const HOUSEHOLD_PREFIX = 'HOUSEHOLD-';
const INST_PREFIX = 'INST-';

/** A bank bidding for its own book (07f's bills, the repo book) — distinct from its market-making
 *  desk, which bids under `dealerDeskParticipantId` and is a different business. */
export const bankParticipantId = (ticker: string): string => `${BANK_PREFIX}${ticker}`;
/** The bank's ticker, or undefined if this participant is not a bank's own book. */
export const bankTickerOfParticipant = (id: string): string | undefined =>
  (id.startsWith(BANK_PREFIX) ? id.slice(BANK_PREFIX.length) : undefined);

/** An institution bidding in the repo book, where the seat id is prefixed rather than bare —
 *  the repo book seats banks and institutions side by side and needs them distinguishable. */
export const repoInstitutionSeatId = (entityId: string): string => `${INST_PREFIX}${entityId}`;
export const repoInstitutionIdOfSeat = (id: string): string | undefined =>
  (id.startsWith(INST_PREFIX) ? id.slice(INST_PREFIX.length) : undefined);

/** A company's treasury parking cash in its government's short paper (07f). */
export const treasuryParticipantId = (ticker: string): string => `${TREASURY_PREFIX}${ticker}`;
export const treasuryTickerOfParticipant = (id: string): string | undefined =>
  (id.startsWith(TREASURY_PREFIX) ? id.slice(TREASURY_PREFIX.length) : undefined);

/** A region's household sector bidding as one participant (07e). */
export const householdParticipantId = (region: RegionId): string => `${HOUSEHOLD_PREFIX}${region}`;
export const householdRegionOfParticipant = (id: string): RegionId | undefined =>
  (id.startsWith(HOUSEHOLD_PREFIX) ? id.slice(HOUSEHOLD_PREFIX.length) as RegionId : undefined);
