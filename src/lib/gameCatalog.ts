import { getDisplayGeoJson } from './displayGeoJson';
import {
  mapRegionPresets,
  orderedContinentRegions,
  type GeoJsonRegionLabel,
  type MapRegionKey,
} from './mapRegions';
import {
  USA_DISPLAY_NAME,
  US_STATES_REGION_KEY,
  US_STATES_REGION_LABEL,
  getCountryDisplayName,
  getCountryId,
  getUsStateDisplayName,
  getUsStateId,
} from './usStates';

type GeoJsonFeature = {
  id?: number | string;
  properties?: Record<string, unknown>;
  type: 'Feature';
};

type GeoJsonFeatureCollection = {
  features: GeoJsonFeature[];
  type: 'FeatureCollection';
};

export type GameMode = 'globe' | 'region';
export type PlaceKind = 'country' | 'state';

export type PlaceOption = {
  id: string;
  displayName: string;
  kind: PlaceKind;
};

export type GameVariant = {
  accent: string;
  description: string;
  id: string;
  label: string;
  mode: GameMode;
  placeCount: number;
  places: readonly PlaceOption[];
  region: MapRegionKey;
  roundCount: number;
  showUsStates: boolean;
  shortLabel: string;
};

type VariantTemplate = Pick<
  GameVariant,
  'accent' | 'description' | 'id' | 'label' | 'mode' | 'region' | 'showUsStates' | 'shortLabel'
>;

const regionLabelToKey: Record<GeoJsonRegionLabel, MapRegionKey | 'other'> = {
  Africa: 'africa',
  Asia: 'asia',
  Europe: 'europe',
  'North America': 'north-america',
  Oceania: 'oceania',
  Other: 'other',
  'South America': 'south-america',
};

const variantTemplates: readonly VariantTemplate[] = [
  {
    id: 'globe-world',
    mode: 'globe',
    label: 'World Globe',
    shortLabel: 'World',
    region: 'world',
    showUsStates: false,
    description: 'Guess countries on the full 3D globe.',
    accent: '#2563eb',
  },
  {
    id: 'globe-world-us-states',
    mode: 'globe',
    label: 'World & U.S. states',
    shortLabel: 'World & U.S. states',
    region: 'world',
    showUsStates: true,
    description: 'Full globe, with the U.S. broken into individual states.',
    accent: '#be185d',
  },
  ...orderedContinentRegions.map((regionPreset, index) => ({
    id: `region-${regionPreset.key}`,
    mode: 'region' as const,
    label: regionPreset.title,
    shortLabel: regionPreset.title,
    region: regionPreset.key,
    showUsStates: regionPreset.key === US_STATES_REGION_KEY,
    description:
      regionPreset.key === US_STATES_REGION_KEY
        ? 'A flat quiz map of all 50 U.S. states.'
        : `A flat quiz map focused on ${regionPreset.title.toLowerCase()}.`,
    accent: ['#b45309', '#0f766e', '#0f4c81', '#7c3aed', '#ca8a04', '#0d9488', '#c2410c'][
      index % 7
    ],
  })),
];

function normalizeCountryId(value: string) {
  return (value || '').trim().toUpperCase();
}

function normalizeUsStateId(value: string) {
  const normalized = (value || '').trim().toUpperCase();
  if (!normalized) {
    return '';
  }

  if (normalized.startsWith('US-')) {
    return normalized;
  }

  return /^[A-Z]{2}$/.test(normalized) ? `US-${normalized}` : normalized;
}

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

function getFeatureRegionLabels(feature: GeoJsonFeature) {
  const rawRegions = feature?.properties?.region;
  if (!Array.isArray(rawRegions)) {
    return [] as GeoJsonRegionLabel[];
  }

  return rawRegions
    .filter((value): value is GeoJsonRegionLabel => typeof value === 'string' && value in regionLabelToKey)
    .filter((value, index, values) => values.indexOf(value) === index);
}

function featureBelongsToRegion(feature: GeoJsonFeature, region: MapRegionKey) {
  const preset = mapRegionPresets[region];
  const properties = feature?.properties || {};
  const featureName = getFeatureName(feature).trim().toLowerCase();
  const adminLevel =
    typeof properties.adminLevel === 'string' ? properties.adminLevel.trim().toLowerCase() : '';
  const parentCountry =
    typeof properties.parentCountry === 'string' ? properties.parentCountry.trim() : '';

  if (preset.includeAdminLevels && !preset.includeAdminLevels.includes(adminLevel)) {
    return false;
  }

  if (
    preset.includeParentCountryNames &&
    !preset.includeParentCountryNames.includes(parentCountry)
  ) {
    return false;
  }

  if (preset.excludeCountryNames && preset.excludeCountryNames.includes(featureName)) {
    return false;
  }

  if (!preset.featureRegionLabels || preset.featureRegionLabels.length === 0) {
    return true;
  }

  const featureRegions = getFeatureRegionLabels(feature);
  return featureRegions.some((label) => preset.featureRegionLabels?.includes(label));
}

function createPlaceOption(feature: GeoJsonFeature): PlaceOption | null {
  const properties = feature?.properties || {};
  const isState = properties.adminLevel === 'state';
  const rawName = getFeatureName(feature);

  if (!rawName) {
    return null;
  }

  if (isState) {
    const stateId = getUsStateId(String(feature.id || rawName)) || normalizeUsStateId(rawName);
    if (!stateId) {
      return null;
    }

    return {
      id: stateId,
      displayName: getUsStateDisplayName(stateId),
      kind: 'state',
    };
  }

  const countryId = getCountryId(String(feature.id || rawName)) || normalizeCountryId(rawName);
  if (!countryId) {
    return null;
  }

  return {
    id: countryId,
    displayName: getCountryDisplayName(countryId),
    kind: 'country',
  };
}

function dedupePlaces(places: readonly PlaceOption[]) {
  const uniquePlaces: PlaceOption[] = [];
  const seen = new Set<string>();

  places.forEach((place) => {
    if (!place || seen.has(place.id)) {
      return;
    }

    seen.add(place.id);
    uniquePlaces.push(place);
  });

  return uniquePlaces;
}

function getPlacesForVariant(template: VariantTemplate) {
  const geoJson = getDisplayGeoJson(template.showUsStates) as GeoJsonFeatureCollection;
  const region = template.region;

  const places = geoJson.features
    .filter((feature) => {
      if (region === 'world') {
        return featureBelongsToRegion(feature, 'world');
      }

      return featureBelongsToRegion(feature, region);
    })
    .map(createPlaceOption)
    .filter((place): place is PlaceOption => Boolean(place));

  return dedupePlaces(places).sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function resolveRoundCount(_template: VariantTemplate, placeCount: number) {
  return placeCount;
}

export const gameVariants: readonly GameVariant[] = variantTemplates.map((template) => {
  const places = getPlacesForVariant(template);

  return {
    ...template,
    places,
    placeCount: places.length,
    roundCount: resolveRoundCount(template, places.length),
  };
});

export const defaultVariantId = 'globe-world';

export function findVariantById(variantId: string) {
  return gameVariants.find((variant) => variant.id === variantId) ?? null;
}

export function getVariantById(variantId: string) {
  return findVariantById(variantId) ?? gameVariants[0];
}

export function buildQuestionSet(variant: GameVariant) {
  const shuffled = [...variant.places];

  if (shuffled.length === 0) {
    throw new Error(`Cannot build an empty question set for game variant "${variant.id}".`);
  }

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = shuffled[index];
    shuffled[index] = shuffled[swapIndex];
    shuffled[swapIndex] = current;
  }

  return shuffled;
}

export const globeVariantIds = ['globe-world', 'globe-world-us-states'] as const;

export function getVariantTitle(variant: GameVariant) {
  if (variant.mode === 'globe' && variant.showUsStates) {
    return `${variant.label} (${variant.placeCount} places)`;
  }

  if (variant.mode === 'globe') {
    return `${variant.label} (${variant.placeCount} countries)`;
  }

  if (variant.region === US_STATES_REGION_KEY) {
    return `${US_STATES_REGION_LABEL} (${variant.placeCount})`;
  }

  return `${variant.label} (${variant.placeCount})`;
}

export function getVariantSubtitle(variant: GameVariant) {
  if (variant.region === US_STATES_REGION_KEY) {
    return `${variant.placeCount} states total`;
  }

  if (variant.mode === 'globe' && variant.showUsStates) {
    return `${variant.placeCount} countries and states total`;
  }

  if (variant.mode === 'globe') {
    return `${variant.placeCount} countries total`;
  }

  if (variant.region === 'north-america') {
    return `${variant.placeCount} places across ${USA_DISPLAY_NAME} and its neighbors`;
  }

  return `${variant.placeCount} places in ${variant.label.toLowerCase()}`;
}
