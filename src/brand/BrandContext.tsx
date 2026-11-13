import React, { createContext, useContext } from 'react';
import { PUBLIC_BRAND, type BrandConfig } from './brands';

const BrandContext = createContext<BrandConfig>(PUBLIC_BRAND);

/**
 * Only mounted around content shown after the account's brand has been
 * resolved by the server. Everywhere else falls back to the public identity.
 */
export function BrandProvider({ brand, children }: { brand: BrandConfig; children: React.ReactNode }) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export function useBrand(): BrandConfig {
  return useContext(BrandContext);
}
