import { USA_DISPLAY_NAME, US_STATES_REGION_KEY, US_STATES_REGION_LABEL } from './usStates';

export type MapRegionKey =
  | 'world'
  | 'europe'
  | 'africa'
  | 'asia'
  | 'north-america'
  | 'south-america'
  | 'oceania'
  | typeof US_STATES_REGION_KEY;

export type ContinentRegionKey = Exclude<MapRegionKey, 'world' | typeof US_STATES_REGION_KEY>;
export type CountryRegionKey = ContinentRegionKey | 'other';
export type GeoJsonRegionLabel =
  | 'Africa'
  | 'Asia'
  | 'Europe'
  | 'North America'
  | 'Oceania'
  | 'Other'
  | 'South America';

type GeoJsonRegionFeature = {
  properties?: Record<string, unknown>;
};

export const mapRegionLabelsByKey: Record<ContinentRegionKey, Exclude<GeoJsonRegionLabel, 'Other'>> = {
  europe: 'Europe',
  africa: 'Africa',
  asia: 'Asia',
  'north-america': 'North America',
  'south-america': 'South America',
  oceania: 'Oceania',
};

const mapRegionKeysByLabel: Record<GeoJsonRegionLabel, CountryRegionKey> = {
  Africa: 'africa',
  Asia: 'asia',
  Europe: 'europe',
  'North America': 'north-america',
  Oceania: 'oceania',
  Other: 'other',
  'South America': 'south-america',
};

type LongitudeRange = {
  min: number;
  max: number;
};

type LatitudeRange = {
  min: number;
  max: number;
};

type MapRegionPolygonExclusion = {
  countryName: string;
  maxLatitude?: number;
  maxLongitude?: number;
  minLatitude?: number;
  minLongitude?: number;
};

type MapRegionFeatureTranslation = {
  alignGap?: number;
  alignBottomToDrawableEdge?: boolean;
  alignBottomToFeatureBottomOf?: string;
  alignLeftToDrawableEdge?: boolean;
  alignLeftToFeatureRightOf?: string;
  countryName: string;
  deltaLatitude: number;
  deltaLongitude: number;
  alignRightToDrawableEdge?: boolean;
  scale?: number;
};

export type MapRegionPreset = {
  key: MapRegionKey;
  title: string;
  subtitle: string;
  longitude: LongitudeRange;
  latitude: LatitudeRange;
  projectionCenterLongitude?: number;
  displayFeatureClips?: MapRegionPolygonExclusion[];
  displayFeatureTranslations?: MapRegionFeatureTranslation[];
  displayPolygonExclusions?: MapRegionPolygonExclusion[];
  mapHeight: number;
  placeholderCountryCount: number;
  placeholderVisitedCounts: Record<string, number>;
  includeAdminLevels?: string[];
  includeParentCountryNames?: string[];
  excludeCountryNames?: string[];
  fitExcludeCountryNames?: string[];
  featureRegionLabels?: GeoJsonRegionLabel[];
};

function isGeoJsonRegionLabel(value: unknown): value is GeoJsonRegionLabel {
  return (
    value === 'Africa' ||
    value === 'Asia' ||
    value === 'Europe' ||
    value === 'North America' ||
    value === 'Oceania' ||
    value === 'Other' ||
    value === 'South America'
  );
}

export function getRegionLabelForKey(key: CountryRegionKey | typeof US_STATES_REGION_KEY) {
  if (key === US_STATES_REGION_KEY) {
    return US_STATES_REGION_LABEL;
  }

  if (key === 'other') {
    return 'Other';
  }

  return mapRegionLabelsByKey[key];
}

export function getFeatureRegionLabels(feature: GeoJsonRegionFeature) {
  const rawRegions = feature?.properties?.region;
  if (!Array.isArray(rawRegions)) {
    return [] as GeoJsonRegionLabel[];
  }

  const labels: GeoJsonRegionLabel[] = [];
  const seen = new Set<GeoJsonRegionLabel>();

  for (const rawRegion of rawRegions) {
    if (!isGeoJsonRegionLabel(rawRegion) || seen.has(rawRegion)) {
      continue;
    }

    seen.add(rawRegion);
    labels.push(rawRegion);
  }

  return labels;
}

export function getFeatureRegionKeys(feature: GeoJsonRegionFeature) {
  return getFeatureRegionLabels(feature).map((regionLabel) => mapRegionKeysByLabel[regionLabel]);
}

export const mapRegionPresets: Record<MapRegionKey, MapRegionPreset> = {
  world: {
    key: 'world',
    title: 'World',
    subtitle: 'All countries',
    longitude: { min: -180, max: 180 },
    latitude: { min: -58, max: 85 },
    mapHeight: 390,
    placeholderCountryCount: 195,
    placeholderVisitedCounts: {
      user: 7,
      'friend-1': 6,
      'friend-2': 7,
      'friend-3': 6,
    },
    excludeCountryNames: ['antarctica'],
  },
  europe: {
    key: 'europe',
    title: 'Europe',
    subtitle: 'Northern and Southern Europe',
    longitude: { min: -25, max: 45 },
    latitude: { min: 34, max: 72 },
    displayFeatureClips: [
      {
        countryName: 'russia',
        minLongitude: -25,
        maxLongitude: 60,
        minLatitude: 34,
        maxLatitude: 72,
      },
    ],
    displayFeatureTranslations: [
      { countryName: 'iceland', deltaLongitude: 10.1279, deltaLatitude: 3.0 },
      { countryName: 'faroe islands', deltaLongitude: 3, deltaLatitude: 0 },
      { countryName: 'madeira', deltaLongitude: 6.4, deltaLatitude: 3.2 },
      { countryName: 'azores', deltaLongitude: 12.8, deltaLatitude: 2.0 },
      { countryName: 'svalbard', deltaLongitude: 0, deltaLatitude: -2.6 },
    ],
    displayPolygonExclusions: [{ countryName: 'spain', maxLatitude: 32 }],
    fitExcludeCountryNames: ['russia'],
    featureRegionLabels: ['Europe'],
    mapHeight: 180,
    placeholderCountryCount: 44,
    placeholderVisitedCounts: {
      user: 5,
      'friend-1': 3,
      'friend-2': 4,
      'friend-3': 3,
    },
  },
  africa: {
    key: 'africa',
    title: 'Africa',
    subtitle: 'From the Mediterranean to the Cape',
    longitude: { min: -25, max: 55 },
    latitude: { min: -40, max: 34 },
    featureRegionLabels: ['Africa'],
    mapHeight: 260,
    placeholderCountryCount: 54,
    placeholderVisitedCounts: {
      user: 1,
      'friend-1': 0,
      'friend-2': 0,
      'friend-3': 1,
    },
  },
  asia: {
    key: 'asia',
    title: 'Asia',
    subtitle: 'Middle East to East Asia',
    longitude: { min: 45, max: -170 },
    latitude: { min: -10, max: 82 },
    displayPolygonExclusions: [
      {
        countryName: 'russia',
        minLongitude: 18,
        maxLongitude: 24,
        minLatitude: 54,
        maxLatitude: 56,
      },
    ],
    fitExcludeCountryNames: ['russia'],
    featureRegionLabels: ['Asia'],
    mapHeight: 220,
    placeholderCountryCount: 48,
    placeholderVisitedCounts: {
      user: 1,
      'friend-1': 1,
      'friend-2': 0,
      'friend-3': 1,
    },
  },
  'north-america': {
    key: 'north-america',
    title: 'North America',
    subtitle: 'Arctic to Central America',
    longitude: { min: -170, max: -20 },
    latitude: { min: 5, max: 85 },
    displayPolygonExclusions: [{ countryName: 'usa', maxLatitude: 24 }],
    featureRegionLabels: ['North America'],
    mapHeight: 220,
    placeholderCountryCount: 23,
    placeholderVisitedCounts: {
      user: 0,
      'friend-1': 1,
      'friend-2': 2,
      'friend-3': 0,
    },
  },
  'south-america': {
    key: 'south-america',
    title: 'South America',
    subtitle: 'Andes to Patagonia',
    longitude: { min: -92, max: -30 },
    latitude: { min: -60, max: 15 },
    featureRegionLabels: ['South America'],
    mapHeight: 300,
    placeholderCountryCount: 12,
    placeholderVisitedCounts: {
      user: 0,
      'friend-1': 1,
      'friend-2': 1,
      'friend-3': 0,
    },
  },
  oceania: {
    key: 'oceania',
    title: 'Oceania',
    subtitle: 'Australia, New Zealand, and the Pacific',
    longitude: { min: 110, max: -120 },
    latitude: { min: -50, max: 5 },
    projectionCenterLongitude: 175,
    displayFeatureTranslations: [
      { countryName: 'french polynesia', deltaLongitude: -18, deltaLatitude: 0 },
      { countryName: 'kiribati', deltaLongitude: -12, deltaLatitude: -8.5 },
    ],
    featureRegionLabels: ['Oceania'],
    mapHeight: 200,
    placeholderCountryCount: 14,
    placeholderVisitedCounts: {
      user: 0,
      'friend-1': 0,
      'friend-2': 0,
      'friend-3': 1,
    },
  },
  [US_STATES_REGION_KEY]: {
    key: US_STATES_REGION_KEY,
    title: US_STATES_REGION_LABEL,
    subtitle: 'States of the United States',
    longitude: { min: -180, max: -65 },
    latitude: { min: 18, max: 72 },
    projectionCenterLongitude: -98,
    displayFeatureTranslations: [
      {
        countryName: 'alaska',
        deltaLongitude: 78.0524,
        deltaLatitude: -31.4,
        alignBottomToFeatureBottomOf: 'hawaii',
        alignLeftToDrawableEdge: true,
        scale: 0.34,
      },
      {
        countryName: 'hawaii',
        deltaLongitude: 87.8278,
        deltaLatitude: 5.9,
        alignGap: 8,
        alignLeftToFeatureRightOf: 'alaska',
      },
    ],
    fitExcludeCountryNames: ['alaska', 'hawaii'],
    mapHeight: 250,
    placeholderCountryCount: 50,
    placeholderVisitedCounts: {
      user: 8,
      'friend-1': 6,
      'friend-2': 9,
      'friend-3': 5,
    },
    includeAdminLevels: ['state'],
    includeParentCountryNames: [USA_DISPLAY_NAME],
  },
};

export const orderedContinentRegions: MapRegionPreset[] = [
  mapRegionPresets.europe,
  mapRegionPresets.africa,
  mapRegionPresets.asia,
  mapRegionPresets['north-america'],
  mapRegionPresets['south-america'],
  mapRegionPresets.oceania,
  mapRegionPresets[US_STATES_REGION_KEY],
];
