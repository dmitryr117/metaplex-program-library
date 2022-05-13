import * as beet from '@metaplex-foundation/beet';
import * as beetSolana from '@metaplex-foundation/beet-solana';
import { Metadata } from '../generated/accounts/Metadata';
import { collectionBeet } from '../generated/types/Collection';
import { dataBeet } from '../generated/types/Data';
import { keyBeet } from '../generated/types/Key';
import { tokenStandardBeet } from '../generated/types/TokenStandard';
import { usesBeet } from '../generated/types/Uses';

/**
 * This is a custom deserializer for TokenMetadata in order to mitigate acounts with corrupted
 * data on chain.
 *
 * Instead of failing the deserialization for the section that is possibly corrupt it just returns
 * `null` for the fields that would normally be stored in that section.
 *
 * This deserializer matches the [fix implemented in the Rust program](https://github.com/metaplex-foundation/metaplex-program-library/blob/df36da5a78fb17e1690247b8041b761d27c83b1b/token-metadata/program/src/deser.rs#L6).
 * Also @see ../../../program/src/deser.rs
 */
export function deserializeTokenMetadata(buf: Buffer, offset = 0): [Metadata, number] {
  let cursor = offset;

  // key
  const key = keyBeet.read(buf, cursor);
  cursor += keyBeet.byteSize;

  // updateAuthority
  const updateAuthority = beetSolana.publicKey.read(buf, cursor);
  cursor += beetSolana.publicKey.byteSize;

  // mint
  const mint = beetSolana.publicKey.read(buf, cursor);
  cursor += beetSolana.publicKey.byteSize;

  // data
  const [data, dataDelta] = dataBeet.deserialize(buf, cursor);
  cursor = dataDelta;

  // primarySaleHappened
  const primarySaleHappened = beet.bool.read(buf, cursor);
  cursor += beet.bool.byteSize;

  // isMutable
  const isMutable = beet.bool.read(buf, cursor);
  cursor += beet.bool.byteSize;

  // editionNonce
  const editionNonceBeet = beet.coption(beet.u8).toFixedFromData(buf, cursor);
  const editionNonce = editionNonceBeet.read(buf, cursor);
  cursor += editionNonceBeet.byteSize;

  // -----------------
  // Possibly corrupted section
  // -----------------

  // tokenStandard
  const [tokenStandard, tokenDelta] = tryReadOption(beet.coption(tokenStandardBeet), buf, cursor);
  cursor += tokenDelta;

  // collection
  const [collection, collectionDelta] = tryReadOption(beet.coption(collectionBeet), buf, cursor);
  cursor += collectionDelta;

  // uses
  const [uses, usesDelta] = tryReadOption(beet.coption(usesBeet), buf, cursor);
  cursor += usesDelta;

  const args = {
    key,
    updateAuthority,
    mint,
    data,
    primarySaleHappened,
    isMutable,
    editionNonce,
    tokenStandard,
    collection,
    uses,
  };

  return [Metadata.fromArgs(args), cursor];
}

function tryReadOption<T>(
  optionBeet: beet.FixableBeet<T, Partial<T>>,
  buf: Buffer,
  offset: number,
): [T | null, number] {
  try {
    const fixed = optionBeet.toFixedFromData(buf, offset);
    const value = fixed.read(buf, offset);
    return [value, fixed.byteSize];
  } catch (err) {
    return [null, optionBeet.toFixedFromValue(null).byteSize];
  }
}