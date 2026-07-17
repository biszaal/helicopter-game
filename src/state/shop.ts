import { config } from '../config';

/**
 * Pure wallet/shop transitions — no React, no storage, so the buy/equip
 * rules are unit-testable. settings.tsx applies these inside its state
 * updater and persists the result.
 */

export interface WalletState {
  totalCoins: number;
  /** Skin ids the player owns; always contains 'classic'. */
  ownedSkins: string[];
  /** The equipped skin — always present in ownedSkins. */
  selectedSkin: string;
}

export const FREE_SKIN_ID = 'classic';

export function skinPrice(id: string): number | null {
  const entry = config.shop.skins.find((s) => s.id === id);
  return entry === undefined ? null : entry.price;
}

/** Buy + auto-equip. Returns null (no change) for unknown ids, skins
 * already owned, or an insufficient balance. */
export function applyPurchase<S extends WalletState>(prev: S, id: string): S | null {
  const price = skinPrice(id);
  if (price === null) return null;
  if (prev.ownedSkins.includes(id)) return null;
  if (prev.totalCoins < price) return null;
  return {
    ...prev,
    totalCoins: prev.totalCoins - price,
    ownedSkins: [...prev.ownedSkins, id],
    selectedSkin: id,
  };
}

/** Equip an owned skin. Returns null (no change) otherwise. */
export function applySelect<S extends WalletState>(prev: S, id: string): S | null {
  if (!prev.ownedSkins.includes(id)) return null;
  if (prev.selectedSkin === id) return null;
  return { ...prev, selectedSkin: id };
}

/** Repair loaded state: drop unknown skin ids (a catalog may shrink),
 * guarantee the free skin, and never leave an unowned skin equipped. */
export function sanitizeWallet<S extends WalletState>(state: S): S {
  const catalog = new Set<string>(config.shop.skins.map((s) => s.id));
  const owned = [
    FREE_SKIN_ID,
    ...state.ownedSkins.filter((id) => id !== FREE_SKIN_ID && catalog.has(id)),
  ];
  const selectedSkin = owned.includes(state.selectedSkin)
    ? state.selectedSkin
    : FREE_SKIN_ID;
  return { ...state, ownedSkins: owned, selectedSkin };
}
