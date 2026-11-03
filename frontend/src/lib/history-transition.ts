export function createHistoryTransition() {
  let revision = 0;
  return {
    begin: () => ++revision,
    isCurrent: (ticket: number) => ticket === revision,
    async restore<T>(ticket: number, load: () => Promise<T>, apply: (value: T) => void) {
      const value = await load();
      if (ticket === revision) apply(value);
    },
  };
}
