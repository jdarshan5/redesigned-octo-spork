let counter = 0;

/** Returns a short id that is unique for the lifetime of the page. */
export function uid(prefix: string): string {
  counter += 1;
  const random = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}${random}`;
}
