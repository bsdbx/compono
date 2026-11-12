/**
 * Undo and redo of a value, such as a graph. Changes with the same key in a row,
 * like typing in one field, undo together.
 */
export class History<T> {
  #past: T[] = [];
  #future: T[] = [];
  #lastKey: string | undefined;

  /** Remembers `before`, which `after` replaces. */
  record(before: T, key?: string) {
    if (key === undefined || key !== this.#lastKey) {
      this.#past.push(before);
      // Plenty for an editing session, without keeping every graph
      if (this.#past.length > 200) {
        this.#past.shift();
      }
    }
    this.#lastKey = key;
    this.#future = [];
  }

  /** The value before `current`, if any. */
  undo(current: T): T | undefined {
    const previous = this.#past.pop();
    if (previous !== undefined) {
      this.#future.push(current);
    }
    this.#lastKey = undefined;
    return previous;
  }

  /** The value `undo` went back from, if any. */
  redo(current: T): T | undefined {
    const next = this.#future.pop();
    if (next !== undefined) {
      this.#past.push(current);
    }
    this.#lastKey = undefined;
    return next;
  }
}
