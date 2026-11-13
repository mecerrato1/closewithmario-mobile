// API host for every request the app makes. All requests use this one host
// whichever brand the account has: brand never changes where data comes from.
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || 'https://www.closewithmario.com').replace(/\/$/, '');
