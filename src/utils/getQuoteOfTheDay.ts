// src/utils/getQuoteOfTheDay.ts
import { SALES_QUOTES, SalesQuote } from "../constants/salesQuotes";

export function getQuoteOfTheDay(userKey?: string): SalesQuote {
  const today = new Date();
  const year = today.getFullYear();
  const start = new Date(year, 0, 0);
  const diff =
    today.getTime() -
    start.getTime() +
    (start.getTimezoneOffset() - today.getTimezoneOffset()) * 60 * 1000;
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));

  // Optional: slightly vary by user (email, id, etc.)
  let offset = 0;
  if (userKey) {
    for (let i = 0; i < userKey.length; i++) {
      offset = (offset + userKey.charCodeAt(i)) % SALES_QUOTES.length;
    }
  }

  const index = (dayOfYear + offset) % SALES_QUOTES.length;
  return SALES_QUOTES[index];
}
