export const toCamel = (o: any): any => {
  if (Array.isArray(o)) return o.map(toCamel);
  if (o && typeof o === 'object') {
    return Object.fromEntries(
      Object.entries(o).map(([k, v]) => [
        k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
        toCamel(v)
      ])
    );
  }
  return o;
};
