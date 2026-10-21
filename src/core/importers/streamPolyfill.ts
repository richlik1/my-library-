/**
 * Safari (including iOS 18) can't loop over a ReadableStream with
 * `for await`, which PDF.js uses to read page text. Add the standard
 * async iterator where it's missing. Safe to run more than once.
 */
export function installStreamIteratorPolyfill() {
  if (typeof ReadableStream === 'undefined') return;
  const proto = ReadableStream.prototype as unknown as Record<PropertyKey, unknown>;
  if (typeof proto[Symbol.asyncIterator] === 'function') return;
  async function* values(this: ReadableStream, options?: { preventCancel?: boolean }) {
    const reader = this.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      if (!options?.preventCancel) reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
  Object.defineProperty(proto, 'values', { value: values, writable: true, configurable: true });
  Object.defineProperty(proto, Symbol.asyncIterator, { value: values, writable: true, configurable: true });
}

installStreamIteratorPolyfill();
