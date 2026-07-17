import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { theme } from '../../render/theme';
import {
  applyPurchase,
  applySelect,
  FREE_SKIN_ID,
  sanitizeWallet,
  skinPrice,
  type WalletState,
} from '../shop';

const wallet = (over: Partial<WalletState> = {}): WalletState => ({
  totalCoins: 100,
  ownedSkins: [FREE_SKIN_ID],
  selectedSkin: FREE_SKIN_ID,
  ...over,
});

describe('shop catalog', () => {
  it('every catalog id has a skin palette, and the free skin costs 0', () => {
    for (const { id } of config.shop.skins) {
      expect(theme.heliSkins).toHaveProperty(id);
    }
    expect(skinPrice(FREE_SKIN_ID)).toBe(0);
  });
});

describe('applyPurchase', () => {
  it('buys at an exact balance and auto-equips', () => {
    const next = applyPurchase(wallet({ totalCoins: 40 }), 'midnight');
    expect(next).toEqual({
      totalCoins: 0,
      ownedSkins: [FREE_SKIN_ID, 'midnight'],
      selectedSkin: 'midnight',
    });
  });

  it('rejects insufficient funds, double-buys, and unknown ids', () => {
    expect(applyPurchase(wallet({ totalCoins: 39 }), 'midnight')).toBeNull();
    expect(
      applyPurchase(wallet({ ownedSkins: [FREE_SKIN_ID, 'midnight'] }), 'midnight'),
    ).toBeNull();
    expect(applyPurchase(wallet(), 'stealth-bomber')).toBeNull();
  });

  it('preserves fields outside the wallet', () => {
    const next = applyPurchase({ ...wallet(), bestScore: 7 }, 'midnight');
    expect(next).toMatchObject({ bestScore: 7 });
  });
});

describe('applySelect', () => {
  it('equips an owned skin and rejects unowned ones', () => {
    const owned = wallet({ ownedSkins: [FREE_SKIN_ID, 'ember'] });
    expect(applySelect(owned, 'ember')).toMatchObject({ selectedSkin: 'ember' });
    expect(applySelect(owned, 'gold')).toBeNull();
    expect(applySelect(owned, FREE_SKIN_ID)).toBeNull(); // already equipped
  });
});

describe('sanitizeWallet', () => {
  it('drops unknown owned ids and falls back to the free skin', () => {
    const repaired = sanitizeWallet(
      wallet({ ownedSkins: ['retired-skin'], selectedSkin: 'retired-skin' }),
    );
    expect(repaired.ownedSkins).toEqual([FREE_SKIN_ID]);
    expect(repaired.selectedSkin).toBe(FREE_SKIN_ID);
  });

  it('keeps a valid loadout untouched', () => {
    const valid = wallet({
      ownedSkins: [FREE_SKIN_ID, 'gold'],
      selectedSkin: 'gold',
    });
    expect(sanitizeWallet(valid)).toEqual(valid);
  });
});
