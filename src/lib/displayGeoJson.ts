import usStatesGeoJsonData from '../data/us-states.json';
import worldGeoJsonData from '../data/world.json';
import { normalizePlaceName } from './locationNames';
import { usStateSelectionKeys } from './usStates';

type GeoJsonFeature = {
  geometry: unknown;
  id?: string | number;
  properties?: Record<string, unknown>;
  type: 'Feature';
};

type GeoJsonFeatureCollection = {
  features: GeoJsonFeature[];
  type: 'FeatureCollection';
};

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

const baseWorldGeoJson = worldGeoJsonData as GeoJsonFeatureCollection;
const rawUsStatesGeoJson = usStatesGeoJsonData as GeoJsonFeatureCollection;

const usStateFeatures = rawUsStatesGeoJson.features.map((feature) => ({
  ...feature,
  properties: {
    ...(feature.properties || {}),
    adminLevel: 'state',
    parentCountry: 'USA',
  },
}));

const worldWithoutUsaFeatures = baseWorldGeoJson.features.filter((feature) => {
  return normalizePlaceName(getFeatureName(feature)) !== 'usa';
});

const worldWithUsStatesGeoJson: GeoJsonFeatureCollection = {
  type: 'FeatureCollection',
  features: [...worldWithoutUsaFeatures, ...usStateFeatures],
};

export function getDisplayGeoJson(showUsStates: boolean) {
  return showUsStates ? worldWithUsStatesGeoJson : baseWorldGeoJson;
}

export { usStateSelectionKeys };
