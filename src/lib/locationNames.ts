const USA_ALIASES = new Set([
  'u.s.',
  'u.s.a.',
  'united states',
  'united states of america',
  'us',
  'usa',
]);

export function normalizePlaceName(name: string) {
  const normalized = (name || '').trim().toLowerCase();

  if (normalized === 'cape verde' || normalized === 'cabo verde') {
    return 'cape verde';
  }

  if (USA_ALIASES.has(normalized)) {
    return 'usa';
  }

  return normalized;
}

export function isUnitedStatesNormalizedName(name: string) {
  return normalizePlaceName(name) === 'usa';
}
