// Inert stub for the verification harness — in-memory async storage.
const store = new Map();
module.exports = {
  __esModule: true,
  default: {
    getItem: async (k) => (store.has(k) ? store.get(k) : null),
    setItem: async (k, v) => { store.set(k, v); },
    removeItem: async (k) => { store.delete(k); },
    clear: async () => { store.clear(); },
    getAllKeys: async () => [...store.keys()],
    multiGet: async (keys) => keys.map((k) => [k, store.has(k) ? store.get(k) : null]),
    multiSet: async (pairs) => { for (const [k, v] of pairs) store.set(k, v); },
  },
};
