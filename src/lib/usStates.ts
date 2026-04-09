import usStatesGeoJsonData from '../data/us-states.json';
import worldGeoJsonData from '../data/world.json';
import { normalizePlaceName } from './locationNames';

type GeoJsonFeature = {
  id?: number | string;
  properties?: Record<string, unknown>;
  type: 'Feature';
};

type GeoJsonFeatureCollection = {
  features: GeoJsonFeature[];
  type: 'FeatureCollection';
};

type CountryEntry = {
  id: string;
  name: string;
};

type UsStateEntry = {
  id: string;
  name: string;
};

export const US_STATES_REGION_KEY = 'us-states';
export const US_STATES_REGION_LABEL = 'U.S. states';
export const USA_DISPLAY_NAME = 'USA';
export const USA_COUNTRY_ID = 'USA';
export const US_STATE_ID_PREFIX = 'US-';
export const LEGACY_US_STATE_STORAGE_PREFIX = 'US_STATE:';
export const US_STATE_STORAGE_PREFIX = LEGACY_US_STATE_STORAGE_PREFIX;

const rawWorldGeoJson = worldGeoJsonData as GeoJsonFeatureCollection;
const rawUsStatesGeoJson = usStatesGeoJsonData as GeoJsonFeatureCollection;

function getFeatureName(feature: GeoJsonFeature) {
  const properties = feature?.properties || {};
  const rawName =
    properties.NAME ||
    properties.ADMIN ||
    properties.name ||
    properties.NAME_LONG ||
    '';

  return typeof rawName === 'string' ? rawName.trim() : '';
}

function getFeatureId(feature: GeoJsonFeature) {
  const rawId = feature?.id;

  if (typeof rawId === 'number') {
    return String(rawId).trim().toUpperCase();
  }

  if (typeof rawId === 'string') {
    return rawId.trim().toUpperCase();
  }

  return '';
}

function normalizeCountryId(value: string) {
  return (value || '').trim().toUpperCase();
}

function normalizeUsStateId(value: string) {
  const normalized = (value || '').trim().toUpperCase();

  if (!normalized) {
    return '';
  }

  if (normalized.startsWith(US_STATE_ID_PREFIX)) {
    return normalized;
  }

  if (/^[A-Z]{2}$/.test(normalized)) {
    return `${US_STATE_ID_PREFIX}${normalized}`;
  }

  return normalized;
}

const countryEntries = (() => {
  const entries: CountryEntry[] = [];
  const seenIds = new Set<string>();

  for (const feature of rawWorldGeoJson.features) {
    const id = normalizeCountryId(getFeatureId(feature));
    const name = getFeatureName(feature);

    if (!id || !name || seenIds.has(id)) {
      continue;
    }

    seenIds.add(id);
    entries.push({ id, name });
  }

  return entries;
})();

const countryIdToName = new Map(countryEntries.map((entry) => [entry.id, entry.name] as const));
const normalizedCountryNameToId = new Map(
  countryEntries.map((entry) => [normalizePlaceName(entry.name), entry.id] as const)
);

const usStateEntries = (() => {
  const entries: UsStateEntry[] = [];
  const seenIds = new Set<string>();

  for (const feature of rawUsStatesGeoJson.features) {
    const id = normalizeUsStateId(getFeatureId(feature));
    const name = getFeatureName(feature);

    if (!id || !name || seenIds.has(id)) {
      continue;
    }

    seenIds.add(id);
    entries.push({ id, name });
  }

  return entries.sort((left, right) => left.name.localeCompare(right.name));
})();

const usStateIdToName = new Map(usStateEntries.map((entry) => [entry.id, entry.name] as const));
const normalizedToUsStateId = new Map(
  usStateEntries.map((entry) => [normalizePlaceName(entry.name), entry.id] as const)
);
const normalizedToUsStateName = new Map(
  usStateEntries.map((entry) => [normalizePlaceName(entry.name), entry.name] as const)
);
const normalizedUsStateNames = [...normalizedToUsStateName.keys()];
const normalizedUsStateNameSet = new Set(normalizedUsStateNames);

export function getCountryId(value: string) {
  const trimmed = (value || '').trim();

  if (!trimmed) {
    return null;
  }

  const normalizedId = normalizeCountryId(trimmed);
  if (countryIdToName.has(normalizedId)) {
    return normalizedId;
  }

  return normalizedCountryNameToId.get(normalizePlaceName(trimmed)) || null;
}

export function getCountryDisplayName(value: string) {
  const countryId = getCountryId(value);

  if (!countryId) {
    return (value || '').trim();
  }

  if (countryId === USA_COUNTRY_ID) {
    return USA_DISPLAY_NAME;
  }

  return countryIdToName.get(countryId) || (value || '').trim();
}

export function getUsStateId(value: string) {
  const trimmed = (value || '').trim();

  if (!trimmed) {
    return null;
  }

  const normalizedId = normalizeUsStateId(trimmed);
  if (usStateIdToName.has(normalizedId)) {
    return normalizedId;
  }

  if (trimmed.startsWith(LEGACY_US_STATE_STORAGE_PREFIX)) {
    const displayName = trimmed.slice(LEGACY_US_STATE_STORAGE_PREFIX.length).trim();
    return normalizedToUsStateId.get(normalizePlaceName(displayName)) || null;
  }

  return normalizedToUsStateId.get(normalizePlaceName(trimmed)) || null;
}

export function isUsStateNormalizedName(name: string) {
  const normalizedName = normalizePlaceName(name);
  return normalizedUsStateNameSet.has(normalizedName) || Boolean(getUsStateId(name));
}

export function toUsStateSelectionKey(name: string) {
  return getUsStateId(name) || normalizeUsStateId(name);
}

export function isUsStateSelectionKey(name: string) {
  return Boolean(getUsStateId(name));
}

export function getUsStateDisplayName(value: string) {
  const stateId = getUsStateId(value);

  if (!stateId) {
    return (value || '').trim();
  }

  return usStateIdToName.get(stateId) || (value || '').trim();
}

export function buildStoredUsStateValue(name: string) {
  return getUsStateId(name) || normalizeUsStateId(name);
}

export function parseStoredUsStateValue(value: string) {
  const stateId = getUsStateId(value);
  return stateId ? getUsStateDisplayName(stateId) : null;
}

export function getPlaceDisplayName(value: string) {
  const stateId = getUsStateId(value);

  if (stateId) {
    return getUsStateDisplayName(stateId);
  }

  const countryId = getCountryId(value);

  if (countryId) {
    return getCountryDisplayName(countryId);
  }

  return (value || '').trim();
}

export function getVisitedPlaceKey(value: string) {
  const stateId = getUsStateId(value);

  if (stateId) {
    return stateId;
  }

  const countryId = getCountryId(value);

  if (countryId) {
    return countryId;
  }

  return normalizePlaceName(value);
}

export function buildCanonicalVisitedPlaces(places: readonly string[]) {
  const canonicalPlaces: string[] = [];
  const seen = new Set<string>();
  let hasUsState = false;

  for (const place of places) {
    const trimmedPlace = (place || '').trim();

    if (!trimmedPlace) {
      continue;
    }

    const canonicalPlace = getUsStateId(trimmedPlace) || getCountryId(trimmedPlace) || trimmedPlace;
    const placeKey = getVisitedPlaceKey(canonicalPlace);

    if (!placeKey || seen.has(placeKey)) {
      continue;
    }

    seen.add(placeKey);

    if (isUsStateSelectionKey(placeKey)) {
      hasUsState = true;
    }

    canonicalPlaces.push(canonicalPlace);
  }

  if (hasUsState && !seen.has(USA_COUNTRY_ID)) {
    canonicalPlaces.push(USA_COUNTRY_ID);
  }

  return canonicalPlaces;
}

export function buildExplicitVisitedPlacesFromSavedPlaces(places: readonly string[]) {
  const canonicalPlaces = buildCanonicalVisitedPlaces(places);
  const hasUsState = canonicalPlaces.some((place) => isUsStateSelectionKey(getVisitedPlaceKey(place)));

  if (!hasUsState) {
    return canonicalPlaces;
  }

  return canonicalPlaces.filter((place) => getVisitedPlaceKey(place) !== USA_COUNTRY_ID);
}

const usStateSelectionKeys = usStateEntries.map((entry) => entry.id);
const usStateNames = usStateEntries.map((entry) => entry.name);

export { normalizedUsStateNames, usStateNames, usStateSelectionKeys };
