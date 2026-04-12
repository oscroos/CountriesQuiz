import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { getDisplayGeoJson } from '../lib/displayGeoJson';
import { mapRegionPresets, type MapRegionKey } from '../lib/mapRegions';
import type { AppMapColors } from '../theme/colors';
import { mapColors as defaultMapColors } from '../theme/colors';

type GameFlatMapProps = {
  disabled?: boolean;
  fillAvailableSpace?: boolean;
  flashPlaceId?: string | null;
  height?: number;
  interactive?: boolean;
  mapTheme?: AppMapColors;
  onSelectPlace?: (selection: { id: string; kind: 'country' | 'state'; label: string }) => void;
  region: MapRegionKey;
  showUsStates?: boolean;
  solvedPlaceIds: readonly string[];
};

type WebViewMessage =
  | {
      type: 'flat-map-ready';
    }
  | {
      id: string;
      kind: 'country' | 'state';
      label: string;
      type: 'place-select';
    };

type FlatMapStatePayload = {
  disabled: boolean;
  flashPlaceId: string | null;
  solvedPlaceIds: readonly string[];
};

function buildFlatMapHtml(
  worldGeoJsonData: unknown,
  region: MapRegionKey,
  mapTheme: AppMapColors,
  interactive: boolean,
  initialState: FlatMapStatePayload
) {
  const worldGeoJson = JSON.stringify(worldGeoJsonData);
  const regionPreset = JSON.stringify(mapRegionPresets[region]);
  const theme = JSON.stringify(mapTheme);
  const initialPayload = JSON.stringify(initialState);

  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <style>
      * {
        -webkit-user-select: none;
        user-select: none;
        -webkit-touch-callout: none;
        -webkit-tap-highlight-color: transparent;
      }
      html, body, #flatMapStage {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: transparent;
        touch-action: none;
      }
      #flatMapStage {
        position: relative;
      }
      #flatMap {
        position: absolute;
        inset: 0;
      }
      svg {
        width: 100%;
        height: 100%;
        display: block;
        opacity: 0;
        transform: translateY(6px);
        transition: opacity 320ms ease, transform 320ms ease;
      }
      svg.ready {
        opacity: 1;
        transform: translateY(0);
      }
      .tooltip {
        position: absolute;
        pointer-events: none;
        display: none;
        padding: 8px 11px;
        border-radius: 12px;
        background: ${mapTheme.tooltipBg};
        color: ${mapTheme.tooltipText};
        font: 12px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif;
        max-width: 220px;
        transform: translate(-50%, -110%);
        white-space: normal;
        box-shadow: 0 14px 30px rgba(15, 23, 42, 0.18);
        border: 1px solid rgba(255, 250, 242, 0.14);
      }
      .tooltip__title {
        font-weight: 700;
        line-height: 1.3;
      }
      .tooltip__meta {
        margin-top: 3px;
        color: rgba(255, 250, 242, 0.78);
        line-height: 1.35;
      }
    </style>
    <script src="https://unpkg.com/d3@7/dist/d3.min.js"></script>
  </head>
  <body>
    <div id="flatMapStage">
      <div id="flatMap"></div>
      <div id="tooltip" class="tooltip"></div>
    </div>
    <script>
      const world = ${worldGeoJson};
      const regionPreset = ${regionPreset};
      const theme = ${theme};
      const initialState = ${initialPayload};
      const isInteractive = ${JSON.stringify(interactive)};

      document.addEventListener('selectstart', (event) => event.preventDefault());
      document.addEventListener('contextmenu', (event) => event.preventDefault());

      const normalizeCountryName = (name) => {
        const normalized = (name || '').trim().toLowerCase();
        if (normalized === 'cape verde' || normalized === 'cabo verde') return 'cape verde';
        if (
          normalized === 'usa' ||
          normalized === 'us' ||
          normalized === 'u.s.' ||
          normalized === 'u.s.a.' ||
          normalized === 'united states' ||
          normalized === 'united states of america'
        ) {
          return 'usa';
        }
        return normalized;
      };

      const normalizeCountryId = (value) => (value || '').trim().toUpperCase();
      const normalizeUsStateId = (value) => {
        const normalized = normalizeCountryId(value);
        if (!normalized) return '';
        if (normalized.startsWith('US-')) return normalized;
        return /^[A-Z]{2}$/.test(normalized) ? 'US-' + normalized : normalized;
      };
      const normalizePlaceId = (value) => {
        const normalized = (value || '').trim().toUpperCase();
        if (!normalized) return '';
        return normalized.startsWith('US-') ? normalizeUsStateId(normalized) : normalizeCountryId(normalized);
      };

      const quizState = {
        disabled: Boolean(initialState.disabled),
        flashPlaceId: normalizePlaceId(initialState.flashPlaceId || ''),
        solvedPlaceIds: new Set((initialState.solvedPlaceIds || []).map((value) => normalizePlaceId(value))),
      };
      const TAP_MOVE_THRESHOLD = 12;
      const TAP_SUPPRESSION_MS = 240;
      const TAP_RECENCY_MS = 420;
      let selectedPlaceId = '';
      let viewportWidth = 0;
      let viewportHeight = 0;
      let contentViewportWidth = 0;
      let contentViewportHeight = 0;
      let mapMinX = 0;
      let mapMinY = 0;
      let rawMapWidth = 0;
      let rawMapHeight = 0;
      let baseFitScale = 1;
      let mapBaseLeft = 0;
      let mapBaseTop = 0;
      let mapBaseRight = 0;
      let mapBaseBottom = 0;
      let stretchTranslateX = 0;
      let stretchTranslateY = 0;
      let currentTransform = d3.zoomIdentity;
      let visibleFeatures = [];
      let featureDisplayDeltaXCache = new Map();
      let featureDisplayDeltaYCache = new Map();
      const interactionGuard = {
        blockedUntil: 0,
        isPointerDown: false,
        lastInteractionEndedAt: 0,
        lastInteractionWasTap: false,
        maxDistance: 0,
        multiTouch: false,
        startX: 0,
        startY: 0,
      };

      const HORIZONTAL_MAP_PADDING = 10;
      const VERTICAL_MAP_PADDING = 18;
      const VERTICAL_STRETCH = 1;
      const POLAR_X_STRETCH = regionPreset.key === 'world' ? 0.5 : 0;
      const POLAR_Y_STRETCH = regionPreset.key === 'world' ? 0.5 : 0;
      const SOLVED_COLOR = theme.user;
      const FLASH_COLOR = theme.friendOne;
      const CURRENT_COLOR = theme.friendTwo;
      const UNVISITED_COLOR = theme.unvisited;

      const stage = document.getElementById('flatMapStage');
      const host = document.getElementById('flatMap');
      const tooltip = document.getElementById('tooltip');
      const svg = d3.select(host).append('svg');
      const zoomLayer = svg.append('g');
      const contentLayer = zoomLayer.append('g');
      const stretchedLayer = contentLayer.append('g');
      const projection = createProjection();

      function postMessage(payload) {
        if (!window.ReactNativeWebView || typeof window.ReactNativeWebView.postMessage !== 'function') {
          return;
        }

        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }

      function getPrimaryPointerPosition(event) {
        if (!event) return null;
        if (typeof event.clientX === 'number' && typeof event.clientY === 'number') {
          return { x: event.clientX, y: event.clientY };
        }
        if (event.changedTouches && event.changedTouches.length > 0) {
          const touch = event.changedTouches[0];
          return { x: touch.clientX, y: touch.clientY };
        }
        if (event.touches && event.touches.length > 0) {
          const touch = event.touches[0];
          return { x: touch.clientX, y: touch.clientY };
        }
        return null;
      }

      function getTouchCount(event) {
        if (!event) return 0;
        if (event.touches && typeof event.touches.length === 'number') {
          return event.touches.length;
        }
        if (event.changedTouches && typeof event.changedTouches.length === 'number') {
          return event.changedTouches.length;
        }
        return 0;
      }

      function blockSelections(duration = TAP_SUPPRESSION_MS) {
        interactionGuard.blockedUntil = Math.max(interactionGuard.blockedUntil, Date.now() + duration);
        interactionGuard.lastInteractionWasTap = false;
      }

      function beginInteraction(event) {
        const point = getPrimaryPointerPosition(event);
        if (!point) {
          return;
        }

        interactionGuard.isPointerDown = true;
        interactionGuard.lastInteractionWasTap = false;
        interactionGuard.maxDistance = 0;
        interactionGuard.multiTouch = getTouchCount(event) > 1;
        interactionGuard.startX = point.x;
        interactionGuard.startY = point.y;

        if (interactionGuard.multiTouch) {
          blockSelections(320);
        }
      }

      function updateInteraction(event) {
        if (!interactionGuard.isPointerDown) {
          return;
        }

        if (getTouchCount(event) > 1) {
          interactionGuard.multiTouch = true;
          blockSelections(320);
        }

        const point = getPrimaryPointerPosition(event);
        if (!point) {
          return;
        }

        const distance = Math.hypot(point.x - interactionGuard.startX, point.y - interactionGuard.startY);
        interactionGuard.maxDistance = Math.max(interactionGuard.maxDistance, distance);

        if (interactionGuard.maxDistance > TAP_MOVE_THRESHOLD) {
          blockSelections();
        }
      }

      function endInteraction(event) {
        if (!interactionGuard.isPointerDown) {
          return;
        }

        updateInteraction(event);
        interactionGuard.isPointerDown = false;
        interactionGuard.lastInteractionEndedAt = Date.now();
        interactionGuard.lastInteractionWasTap =
          !interactionGuard.multiTouch && interactionGuard.maxDistance <= TAP_MOVE_THRESHOLD;

        if (!interactionGuard.lastInteractionWasTap) {
          blockSelections();
        }
      }

      function cancelInteraction() {
        interactionGuard.isPointerDown = false;
        interactionGuard.multiTouch = false;
        interactionGuard.maxDistance = 0;
        interactionGuard.lastInteractionEndedAt = Date.now();
        interactionGuard.lastInteractionWasTap = false;
        blockSelections();
      }

      function shouldHandleTapSelection() {
        const now = Date.now();
        if (now < interactionGuard.blockedUntil) {
          interactionGuard.lastInteractionWasTap = false;
          return false;
        }

        const isRecentTap =
          interactionGuard.lastInteractionWasTap &&
          now - interactionGuard.lastInteractionEndedAt <= TAP_RECENCY_MS;

        interactionGuard.lastInteractionWasTap = false;
        return isRecentTap;
      }

      function getFeatureName(feature) {
        if (!feature || !feature.properties) return '';
        const properties = feature.properties;
        return (
          properties.NAME ||
          properties.ADMIN ||
          properties.name ||
          properties.NAME_LONG ||
          ''
        );
      }

      function getFeaturePlaceId(feature) {
        const rawId = String((feature && feature.id) || '').trim();
        const isState = feature && feature.properties && feature.properties.adminLevel === 'state';
        if (isState) {
          return normalizeUsStateId(rawId);
        }
        return normalizeCountryId(rawId);
      }

      function hideTooltip() {
        tooltip.style.display = 'none';
      }

      function darkenHex(hex, factor = 0.82) {
        const raw = (hex || '').replace('#', '');
        if (raw.length !== 6) return hex;
        const channel = (index) => {
          const value = parseInt(raw.slice(index, index + 2), 16);
          return Math.max(0, Math.min(255, Math.round(value * factor)));
        };
        const r = channel(0).toString(16).padStart(2, '0');
        const g = channel(2).toString(16).padStart(2, '0');
        const b = channel(4).toString(16).padStart(2, '0');
        return '#' + r + g + b;
      }

      function getFeatureFill(feature) {
        const placeId = getFeaturePlaceId(feature);
        const isSelected = selectedPlaceId && placeId === selectedPlaceId;

        if (quizState.flashPlaceId && placeId === quizState.flashPlaceId) {
          return isSelected ? darkenHex(FLASH_COLOR) : FLASH_COLOR;
        }

        if (quizState.solvedPlaceIds.has(placeId)) {
          return isSelected ? darkenHex(SOLVED_COLOR) : SOLVED_COLOR;
        }

        if (isSelected) {
          return darkenHex(CURRENT_COLOR);
        }

        return UNVISITED_COLOR;
      }

      function getFeatureStrokeWidth(feature) {
        const placeId = getFeaturePlaceId(feature);
        return selectedPlaceId && placeId === selectedPlaceId ? 1.2 : 0.45;
      }

      function updateCountryVisualState() {
        stretchedLayer
          .selectAll('path.country')
          .attr('fill', (feature) => getFeatureFill(feature))
          .attr('stroke', () => theme.stroke)
          .attr('stroke-width', (feature) => getFeatureStrokeWidth(feature));
      }

      window.__setGameState = function setGameState(nextState) {
        if (!nextState || typeof nextState !== 'object') {
          return;
        }

        quizState.disabled = Boolean(nextState.disabled);
        quizState.flashPlaceId = normalizePlaceId(nextState.flashPlaceId || '');
        quizState.solvedPlaceIds = new Set(
          ((nextState.solvedPlaceIds || []).map((value) => normalizePlaceId(value))).filter(Boolean)
        );

        if (
          selectedPlaceId &&
          (quizState.solvedPlaceIds.has(selectedPlaceId) || quizState.flashPlaceId === selectedPlaceId)
        ) {
          selectedPlaceId = '';
          hideTooltip();
        } else if (
          selectedPlaceId &&
          !quizState.flashPlaceId &&
          !quizState.solvedPlaceIds.has(selectedPlaceId)
        ) {
          selectedPlaceId = '';
          hideTooltip();
        }

        updateCountryVisualState();
      };

      function isFeatureInRegion(feature) {
        const properties = (feature && feature.properties) || {};
        const rawName =
          properties.NAME ||
          properties.ADMIN ||
          properties.name ||
          properties.NAME_LONG ||
          '';
        const normalizedName = normalizeCountryName(rawName);
        const adminLevel = typeof properties.adminLevel === 'string' ? properties.adminLevel.trim().toLowerCase() : '';
        const parentCountryName = normalizeCountryName(
          typeof properties.parentCountry === 'string' ? properties.parentCountry : ''
        );

        if (regionPreset.includeAdminLevels && !regionPreset.includeAdminLevels.includes(adminLevel)) {
          return false;
        }

        if (
          regionPreset.includeParentCountryNames &&
          !regionPreset.includeParentCountryNames
            .map((name) => normalizeCountryName(name))
            .includes(parentCountryName)
        ) {
          return false;
        }

        if (regionPreset.excludeCountryNames && regionPreset.excludeCountryNames.includes(normalizedName)) {
          return false;
        }

        if (regionPreset.featureRegionLabels && regionPreset.featureRegionLabels.length > 0) {
          const featureRegions = Array.isArray(properties.region)
            ? properties.region.filter((value) => typeof value === 'string')
            : [];

          return featureRegions.some((regionLabel) => regionPreset.featureRegionLabels.includes(regionLabel));
        }

        return true;
      }

      function isFeatureExcludedFromFit(feature) {
        if (!regionPreset.fitExcludeCountryNames || regionPreset.fitExcludeCountryNames.length === 0) {
          return false;
        }

        const countryName = normalizeCountryName(getFeatureName(feature));
        return regionPreset.fitExcludeCountryNames.includes(countryName);
      }

      function getPolygonBounds(polygonCoords) {
        const bounds = {
          minLat: Number.POSITIVE_INFINITY,
          maxLat: Number.NEGATIVE_INFINITY,
          minLon: Number.POSITIVE_INFINITY,
          maxLon: Number.NEGATIVE_INFINITY,
        };

        polygonCoords.forEach((ring) => {
          ring.forEach(([lon, lat]) => {
            bounds.minLon = Math.min(bounds.minLon, lon);
            bounds.maxLon = Math.max(bounds.maxLon, lon);
            bounds.minLat = Math.min(bounds.minLat, lat);
            bounds.maxLat = Math.max(bounds.maxLat, lat);
          });
        });

        return bounds;
      }

      function getGeometryBounds(geometry) {
        const polygons = geometry && geometry.type === 'Polygon'
          ? [geometry.coordinates]
          : geometry && geometry.type === 'MultiPolygon'
            ? geometry.coordinates
            : null;

        if (!polygons || polygons.length === 0) {
          return null;
        }

        return polygons.reduce(
          (combinedBounds, polygonCoords) => {
            const polygonBounds = getPolygonBounds(polygonCoords);
            combinedBounds.minLon = Math.min(combinedBounds.minLon, polygonBounds.minLon);
            combinedBounds.maxLon = Math.max(combinedBounds.maxLon, polygonBounds.maxLon);
            combinedBounds.minLat = Math.min(combinedBounds.minLat, polygonBounds.minLat);
            combinedBounds.maxLat = Math.max(combinedBounds.maxLat, polygonBounds.maxLat);
            return combinedBounds;
          },
          {
            minLon: Number.POSITIVE_INFINITY,
            maxLon: Number.NEGATIVE_INFINITY,
            minLat: Number.POSITIVE_INFINITY,
            maxLat: Number.NEGATIVE_INFINITY,
          }
        );
      }

      function transformCoordinates(
        coordinates,
        deltaLongitude,
        deltaLatitude,
        originLongitude,
        originLatitude,
        scale
      ) {
        if (!Array.isArray(coordinates)) {
          return coordinates;
        }

        if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
          return [
            originLongitude + (coordinates[0] - originLongitude) * scale + deltaLongitude,
            originLatitude + (coordinates[1] - originLatitude) * scale + deltaLatitude,
          ];
        }

        return coordinates.map((coordinateGroup) => {
          return transformCoordinates(
            coordinateGroup,
            deltaLongitude,
            deltaLatitude,
            originLongitude,
            originLatitude,
            scale
          );
        });
      }

      function isPolygonExcludedByRule(polygonCoords, rule) {
        const bounds = getPolygonBounds(polygonCoords);

        if (typeof rule.minLatitude === 'number' && bounds.minLat < rule.minLatitude) {
          return false;
        }
        if (typeof rule.maxLatitude === 'number' && bounds.maxLat > rule.maxLatitude) {
          return false;
        }
        if (typeof rule.minLongitude === 'number' && bounds.minLon < rule.minLongitude) {
          return false;
        }
        if (typeof rule.maxLongitude === 'number' && bounds.maxLon > rule.maxLongitude) {
          return false;
        }

        return true;
      }

      function applyPolygonExclusions(feature, exclusionRules) {
        if (!feature || !feature.geometry || exclusionRules.length === 0) {
          return feature;
        }

        const geometry = feature.geometry;
        const polygons = geometry.type === 'Polygon'
          ? [geometry.coordinates]
          : geometry.type === 'MultiPolygon'
            ? geometry.coordinates
            : null;

        if (!polygons) {
          return feature;
        }

        const remainingPolygons = polygons.filter((polygonCoords) => {
          return !exclusionRules.some((rule) => isPolygonExcludedByRule(polygonCoords, rule));
        });

        if (remainingPolygons.length === 0) {
          return null;
        }

        return {
          ...feature,
          geometry: geometry.type === 'Polygon'
            ? { type: 'Polygon', coordinates: remainingPolygons[0] }
            : { type: 'MultiPolygon', coordinates: remainingPolygons },
        };
      }

      function clipRingToBounds(ringCoords, clipRule) {
        if (!Array.isArray(ringCoords) || ringCoords.length < 4) {
          return [];
        }

        const isSamePoint = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
        let points = ringCoords.slice();
        if (isSamePoint(points[0], points[points.length - 1])) {
          points = points.slice(0, -1);
        }

        const clipAgainstEdge = (inputPoints, isInside, intersect) => {
          if (!inputPoints || inputPoints.length === 0) {
            return [];
          }

          const outputPoints = [];
          let previousPoint = inputPoints[inputPoints.length - 1];
          let previousInside = isInside(previousPoint);

          inputPoints.forEach((currentPoint) => {
            const currentInside = isInside(currentPoint);

            if (currentInside !== previousInside) {
              const intersectionPoint = intersect(previousPoint, currentPoint);
              if (
                intersectionPoint &&
                Number.isFinite(intersectionPoint[0]) &&
                Number.isFinite(intersectionPoint[1])
              ) {
                outputPoints.push(intersectionPoint);
              }
            }

            if (currentInside) {
              outputPoints.push(currentPoint);
            }

            previousPoint = currentPoint;
            previousInside = currentInside;
          });

          return outputPoints;
        };

        const intersectVertical = (a, b, targetX) => {
          const deltaX = b[0] - a[0];
          if (Math.abs(deltaX) < 1e-9) {
            return [targetX, a[1]];
          }

          const t = (targetX - a[0]) / deltaX;
          return [targetX, a[1] + t * (b[1] - a[1])];
        };

        const intersectHorizontal = (a, b, targetY) => {
          const deltaY = b[1] - a[1];
          if (Math.abs(deltaY) < 1e-9) {
            return [a[0], targetY];
          }

          const t = (targetY - a[1]) / deltaY;
          return [a[0] + t * (b[0] - a[0]), targetY];
        };

        if (typeof clipRule.minLongitude === 'number') {
          points = clipAgainstEdge(
            points,
            (point) => point[0] >= clipRule.minLongitude,
            (a, b) => intersectVertical(a, b, clipRule.minLongitude)
          );
        }
        if (typeof clipRule.maxLongitude === 'number') {
          points = clipAgainstEdge(
            points,
            (point) => point[0] <= clipRule.maxLongitude,
            (a, b) => intersectVertical(a, b, clipRule.maxLongitude)
          );
        }
        if (typeof clipRule.minLatitude === 'number') {
          points = clipAgainstEdge(
            points,
            (point) => point[1] >= clipRule.minLatitude,
            (a, b) => intersectHorizontal(a, b, clipRule.minLatitude)
          );
        }
        if (typeof clipRule.maxLatitude === 'number') {
          points = clipAgainstEdge(
            points,
            (point) => point[1] <= clipRule.maxLatitude,
            (a, b) => intersectHorizontal(a, b, clipRule.maxLatitude)
          );
        }

        if (points.length < 3) {
          return [];
        }

        if (!isSamePoint(points[0], points[points.length - 1])) {
          points.push([...points[0]]);
        }

        return points;
      }

      function applyFeatureClips(feature, clipRules) {
        if (!feature || !feature.geometry || clipRules.length === 0) {
          return feature;
        }

        const applyClipRuleToPolygon = (polygonCoords, clipRule) => {
          const clippedRings = polygonCoords
            .map((ringCoords) => clipRingToBounds(ringCoords, clipRule))
            .filter((ringCoords) => ringCoords.length >= 4);

          if (clippedRings.length === 0) {
            return null;
          }

          return clippedRings;
        };

        let polygons = feature.geometry.type === 'Polygon'
          ? [feature.geometry.coordinates]
          : feature.geometry.type === 'MultiPolygon'
            ? feature.geometry.coordinates
            : null;

        if (!polygons) {
          return feature;
        }

        clipRules.forEach((clipRule) => {
          polygons = polygons
            .map((polygonCoords) => applyClipRuleToPolygon(polygonCoords, clipRule))
            .filter((polygonCoords) => Boolean(polygonCoords));
        });

        if (!polygons || polygons.length === 0) {
          return null;
        }

        return {
          ...feature,
          geometry: feature.geometry.type === 'Polygon'
            ? { type: 'Polygon', coordinates: polygons[0] }
            : { type: 'MultiPolygon', coordinates: polygons },
        };
      }

      function applyRegionDisplayOverrides(feature) {
        const hasFeatureClips =
          regionPreset.displayFeatureClips && regionPreset.displayFeatureClips.length > 0;
        const hasPolygonExclusions =
          regionPreset.displayPolygonExclusions && regionPreset.displayPolygonExclusions.length > 0;
        const hasFeatureTranslations =
          regionPreset.displayFeatureTranslations && regionPreset.displayFeatureTranslations.length > 0;

        if (!hasFeatureClips && !hasPolygonExclusions && !hasFeatureTranslations) {
          return feature;
        }

        if (!feature || !feature.geometry) {
          return feature;
        }

        const countryName = normalizeCountryName(getFeatureName(feature));
        const clipRules = hasFeatureClips
          ? regionPreset.displayFeatureClips.filter((rule) => rule.countryName === countryName)
          : [];
        const exclusionRules = hasPolygonExclusions
          ? regionPreset.displayPolygonExclusions.filter((rule) => rule.countryName === countryName)
          : [];
        const featureTranslation = hasFeatureTranslations
          ? regionPreset.displayFeatureTranslations.find((rule) => rule.countryName === countryName)
          : null;

        if (clipRules.length === 0 && exclusionRules.length === 0 && !featureTranslation) {
          return feature;
        }

        let nextFeature = feature;

        if (clipRules.length > 0) {
          nextFeature = applyFeatureClips(nextFeature, clipRules);
          if (!nextFeature) {
            return null;
          }
        }

        if (exclusionRules.length > 0) {
          nextFeature = applyPolygonExclusions(nextFeature, exclusionRules);
          if (!nextFeature) {
            return null;
          }
        }

        if (featureTranslation) {
          const geometryBounds = getGeometryBounds(nextFeature.geometry);
          const scale = typeof featureTranslation.scale === 'number' ? featureTranslation.scale : 1;
          const originLongitude = geometryBounds
            ? (geometryBounds.minLon + geometryBounds.maxLon) / 2
            : 0;
          const originLatitude = geometryBounds
            ? (geometryBounds.minLat + geometryBounds.maxLat) / 2
            : 0;
          nextFeature = {
            ...nextFeature,
            geometry: {
              ...nextFeature.geometry,
              coordinates: transformCoordinates(
                nextFeature.geometry.coordinates,
                featureTranslation.deltaLongitude,
                featureTranslation.deltaLatitude,
                originLongitude,
                originLatitude,
                scale
              ),
            },
          };
        }

        return nextFeature;
      }

      function getFeatureTranslationRule(feature) {
        if (!regionPreset.displayFeatureTranslations || regionPreset.displayFeatureTranslations.length === 0) {
          return null;
        }

        const countryName = normalizeCountryName(getFeatureName(feature));
        return regionPreset.displayFeatureTranslations.find((rule) => rule.countryName === countryName) || null;
      }

      function createProjection() {
        const normalizeLongitude = (longitude) => {
          const normalized = ((longitude + 180) % 360 + 360) % 360 - 180;
          return normalized === -180 ? 180 : normalized;
        };

        const getProjectionCenterLongitude = () => {
          if (typeof regionPreset.projectionCenterLongitude === 'number') {
            return regionPreset.projectionCenterLongitude;
          }

          const { min, max } = regionPreset.longitude || {};
          if (typeof min !== 'number' || typeof max !== 'number') {
            return 0;
          }

          if (max >= min) {
            return (min + max) / 2;
          }

          return normalizeLongitude(min + ((max + 360 - min) / 2));
        };

        const nextProjection = d3.geoNaturalEarth1();
        nextProjection.rotate([-getProjectionCenterLongitude(), 0]);
        return nextProjection;
      }

      function createFeatureCollection(features) {
        return {
          type: 'FeatureCollection',
          features,
        };
      }

      function createPolarStretchedPath(activeProjection, width, height) {
        const transform = d3.geoTransform({
          point(lon, lat) {
            const projected = activeProjection([lon, lat]);
            if (!projected) return;

            const latNorm = Math.min(1, Math.abs(lat) / 90);
            const xStretch = 1 + POLAR_X_STRETCH * latNorm * latNorm;
            const yStretch = 1 + POLAR_Y_STRETCH * latNorm * latNorm;
            const x = width / 2 + (projected[0] - width / 2) * xStretch;
            const y = height / 2 + (projected[1] - height / 2) * yStretch;
            this.stream.point(x, y);
          },
        });

        return d3.geoPath(transform);
      }

      function applyVerticalStretch() {
        const drawableWidth = Math.max(1, contentViewportWidth - HORIZONTAL_MAP_PADDING * 2);
        const drawableHeight = Math.max(1, contentViewportHeight - VERTICAL_MAP_PADDING * 2);
        const widthScale = drawableWidth / Math.max(1, rawMapWidth);
        const heightScale = drawableHeight / Math.max(1, rawMapHeight);
        baseFitScale = Math.min(widthScale, heightScale);

        if (!Number.isFinite(baseFitScale) || baseFitScale <= 0) {
          baseFitScale = 1;
        }

        const scaledMapWidth = rawMapWidth * baseFitScale;
        const scaledMapHeight = rawMapHeight * baseFitScale;
        stretchTranslateX = (contentViewportWidth - scaledMapWidth) / 2 - mapMinX * baseFitScale;
        stretchTranslateY =
          (contentViewportHeight - scaledMapHeight) / 2 - mapMinY * VERTICAL_STRETCH * baseFitScale;

        stretchedLayer.attr(
          'transform',
          'matrix(' + baseFitScale + ',0,0,' + (VERTICAL_STRETCH * baseFitScale) + ',' + stretchTranslateX + ',' + stretchTranslateY + ')'
        );

        mapBaseLeft = (contentViewportWidth - scaledMapWidth) / 2;
        mapBaseTop = (contentViewportHeight - scaledMapHeight) / 2;
        mapBaseRight = mapBaseLeft + scaledMapWidth;
        mapBaseBottom = mapBaseTop + scaledMapHeight;
      }

      function resolveFeatureDisplayDeltaX(feature, pathGenerator, visitedNames = new Set()) {
        const featureTranslation = getFeatureTranslationRule(feature);
        if (
          !featureTranslation ||
          (
            !featureTranslation.alignRightToDrawableEdge &&
            !featureTranslation.alignLeftToDrawableEdge &&
            !featureTranslation.alignLeftToFeatureRightOf
          )
        ) {
          return 0;
        }

        const countryName = normalizeCountryName(getFeatureName(feature));
        if (featureDisplayDeltaXCache.has(countryName)) {
          return featureDisplayDeltaXCache.get(countryName);
        }
        if (visitedNames.has(countryName)) {
          return 0;
        }

        const featureBounds = pathGenerator.bounds(feature);
        if (!featureBounds || !Number.isFinite(featureBounds[1][0])) {
          return 0;
        }

        const nextVisitedNames = new Set(visitedNames);
        nextVisitedNames.add(countryName);
        let deltaX = 0;

        if (featureTranslation.alignLeftToFeatureRightOf) {
          const referenceFeature = visibleFeatures.find(
            (candidate) =>
              normalizeCountryName(getFeatureName(candidate)) === featureTranslation.alignLeftToFeatureRightOf
          );
          if (referenceFeature) {
            const referenceBounds = pathGenerator.bounds(referenceFeature);
            if (referenceBounds && Number.isFinite(referenceBounds[1][0])) {
              const referenceDeltaX = resolveFeatureDisplayDeltaX(referenceFeature, pathGenerator, nextVisitedNames);
              const gapRaw = (featureTranslation.alignGap || 0) / Math.max(0.0001, baseFitScale);
              deltaX = referenceBounds[1][0] + referenceDeltaX + gapRaw - featureBounds[0][0];
            }
          }
        } else if (featureTranslation.alignLeftToDrawableEdge) {
          deltaX =
            (HORIZONTAL_MAP_PADDING - stretchTranslateX) / Math.max(0.0001, baseFitScale) - featureBounds[0][0];
        } else if (featureTranslation.alignRightToDrawableEdge) {
          deltaX =
            (contentViewportWidth - HORIZONTAL_MAP_PADDING - stretchTranslateX) /
              Math.max(0.0001, baseFitScale) -
            featureBounds[1][0];
        }

        featureDisplayDeltaXCache.set(countryName, deltaX);
        return deltaX;
      }

      function resolveFeatureDisplayDeltaY(feature, pathGenerator, visitedNames = new Set()) {
        const featureTranslation = getFeatureTranslationRule(feature);
        if (
          !featureTranslation ||
          (
            !featureTranslation.alignBottomToDrawableEdge &&
            !featureTranslation.alignBottomToFeatureBottomOf
          )
        ) {
          return 0;
        }

        const countryName = normalizeCountryName(getFeatureName(feature));
        if (featureDisplayDeltaYCache.has(countryName)) {
          return featureDisplayDeltaYCache.get(countryName);
        }
        if (visitedNames.has(countryName)) {
          return 0;
        }

        const featureBounds = pathGenerator.bounds(feature);
        if (!featureBounds || !Number.isFinite(featureBounds[1][1])) {
          return 0;
        }

        const nextVisitedNames = new Set(visitedNames);
        nextVisitedNames.add(countryName);
        let deltaY = 0;

        if (featureTranslation.alignBottomToFeatureBottomOf) {
          const referenceFeature = visibleFeatures.find(
            (candidate) =>
              normalizeCountryName(getFeatureName(candidate)) === featureTranslation.alignBottomToFeatureBottomOf
          );
          if (referenceFeature) {
            const referenceBounds = pathGenerator.bounds(referenceFeature);
            if (referenceBounds && Number.isFinite(referenceBounds[1][1])) {
              const referenceDeltaY = resolveFeatureDisplayDeltaY(referenceFeature, pathGenerator, nextVisitedNames);
              deltaY = referenceBounds[1][1] + referenceDeltaY - featureBounds[1][1];
            }
          }
        } else if (featureTranslation.alignBottomToDrawableEdge) {
          const targetRawBottom =
            (contentViewportHeight - VERTICAL_MAP_PADDING - stretchTranslateY) /
            Math.max(0.0001, VERTICAL_STRETCH * baseFitScale);
          deltaY = targetRawBottom - featureBounds[1][1];
        }

        featureDisplayDeltaYCache.set(countryName, deltaY);
        return deltaY;
      }

      function getFeatureDisplayTransform(feature, pathGenerator) {
        const deltaX = resolveFeatureDisplayDeltaX(feature, pathGenerator);
        const deltaY = resolveFeatureDisplayDeltaY(feature, pathGenerator);

        if (
          (!Number.isFinite(deltaX) || Math.abs(deltaX) < 0.01) &&
          (!Number.isFinite(deltaY) || Math.abs(deltaY) < 0.01)
        ) {
          return null;
        }

        return 'translate(' + (Number.isFinite(deltaX) ? deltaX : 0) + ',' + (Number.isFinite(deltaY) ? deltaY : 0) + ')';
      }

      function clampTransform(transform) {
        if (!viewportWidth || !viewportHeight) return transform;

        const k = Math.max(1, transform.k);
        const visibleLeft = HORIZONTAL_MAP_PADDING;
        const visibleRight = viewportWidth - HORIZONTAL_MAP_PADDING;
        const visibleTop = VERTICAL_MAP_PADDING;
        const visibleBottom = viewportHeight - VERTICAL_MAP_PADDING;
        const minX = visibleRight - k * mapBaseRight;
        const maxX = visibleLeft - k * mapBaseLeft;
        const minY = visibleBottom - k * mapBaseBottom;
        const maxY = visibleTop - k * mapBaseTop;

        const clampAxis = (value, min, max) => {
          if (min > max) {
            return (min + max) / 2;
          }
          return Math.min(max, Math.max(min, value));
        };

        const x = clampAxis(transform.x, minX, maxX);
        const y = clampAxis(transform.y, minY, maxY);
        return d3.zoomIdentity.translate(x, y).scale(k);
      }

      function render() {
        viewportWidth = stage.clientWidth || window.innerWidth || 600;
        viewportHeight = stage.clientHeight || window.innerHeight || 340;
        contentViewportWidth = viewportWidth;
        contentViewportHeight = viewportHeight;

        svg.attr('viewBox', [0, 0, viewportWidth, viewportHeight]);
        visibleFeatures = ((world && world.features) || [])
          .filter((feature) => isFeatureInRegion(feature))
          .map((feature) => applyRegionDisplayOverrides(feature))
          .filter(Boolean);

        featureDisplayDeltaXCache.clear();
        featureDisplayDeltaYCache.clear();

        if (visibleFeatures.length === 0) {
          stretchedLayer.selectAll('path.country').remove();
          return;
        }

        const fitFeatures = visibleFeatures.filter((feature) => !isFeatureExcludedFromFit(feature));
        const effectiveFitFeatures = fitFeatures.length > 0 ? fitFeatures : visibleFeatures;
        const fitFeatureCollection = createFeatureCollection(effectiveFitFeatures);

        projection.fitExtent(
          [
            [HORIZONTAL_MAP_PADDING, VERTICAL_MAP_PADDING],
            [
              Math.max(HORIZONTAL_MAP_PADDING + 1, contentViewportWidth - HORIZONTAL_MAP_PADDING),
              Math.max(VERTICAL_MAP_PADDING + 1, contentViewportHeight - VERTICAL_MAP_PADDING),
            ],
          ],
          fitFeatureCollection
        );

        const polarPath = createPolarStretchedPath(projection, contentViewportWidth, contentViewportHeight);
        const polarBounds = polarPath.bounds(fitFeatureCollection);
        mapMinX = polarBounds[0][0] || 0;
        mapMinY = polarBounds[0][1] || 0;
        rawMapWidth = Math.max(1, (polarBounds[1][0] || contentViewportWidth) - mapMinX);
        rawMapHeight = Math.max(1, ((polarBounds[1][1] || contentViewportHeight) - mapMinY) * VERTICAL_STRETCH);

        applyVerticalStretch();

        stretchedLayer
          .selectAll('path.country')
          .data(visibleFeatures)
          .join('path')
          .attr('class', 'country')
          .attr('d', polarPath)
          .attr('transform', (feature) => getFeatureDisplayTransform(feature, polarPath))
          .attr('vector-effect', 'non-scaling-stroke')
          .on('click', (event, feature) => {
            if (quizState.disabled || !shouldHandleTapSelection()) {
              event.stopPropagation();
              return;
            }

            const placeId = getFeaturePlaceId(feature);
            const label = getFeatureName(feature) || 'Unknown';
            const kind = feature && feature.properties && feature.properties.adminLevel === 'state' ? 'state' : 'country';
            selectedPlaceId = placeId;
            updateCountryVisualState();
            postMessage({
              type: 'place-select',
              id: placeId,
              kind,
              label,
            });
            event.stopPropagation();
          });

        updateCountryVisualState();

        if (currentTransform.k <= 1.0001) {
          currentTransform = clampTransform(d3.zoomIdentity);
        } else {
          currentTransform = clampTransform(currentTransform);
        }

        zoomLayer.attr('transform', currentTransform.toString());
        if (isInteractive) {
          svg.call(zoom.transform, currentTransform);
        }
      }

      const zoom = d3.zoom()
        .filter((event) => {
          if (!isInteractive) {
            return false;
          }
          if (event.type === 'dblclick') {
            return false;
          }
          return !event.button;
        })
        .clickDistance(TAP_MOVE_THRESHOLD)
        .tapDistance(TAP_MOVE_THRESHOLD + 4)
        .scaleExtent([1, 18])
        .on('zoom', (event) => {
          if (event.sourceEvent) {
            blockSelections(event.sourceEvent.type === 'wheel' ? 320 : TAP_SUPPRESSION_MS);
          }

          const clamped = clampTransform(event.transform);
          if (
            Math.abs(clamped.x - event.transform.x) > 0.001 ||
            Math.abs(clamped.y - event.transform.y) > 0.001 ||
            Math.abs(clamped.k - event.transform.k) > 0.001
          ) {
            svg.call(zoom.transform, clamped);
            return;
          }

          currentTransform = clamped;
          zoomLayer.attr('transform', currentTransform.toString());
        });

      if (isInteractive) {
        if (stage) {
          stage.addEventListener('pointerdown', beginInteraction, { passive: true });
          stage.addEventListener('pointermove', updateInteraction, { passive: true });
          stage.addEventListener('pointerup', endInteraction, { passive: true });
          stage.addEventListener('pointercancel', cancelInteraction, { passive: true });
          stage.addEventListener('wheel', () => blockSelections(320), { passive: true });
        }

        svg.call(zoom);
        svg.on('click', (event) => {
          if (!shouldHandleTapSelection()) {
            return;
          }

          if (event.target && event.target.tagName !== 'path') {
            selectedPlaceId = '';
            updateCountryVisualState();
            hideTooltip();
          }
        });
      }

      render();
      requestAnimationFrame(() => {
        svg.classed('ready', true);
        postMessage({ type: 'flat-map-ready' });
      });
      window.addEventListener('resize', render);
    </script>
  </body>
</html>
  `;
}

function createInjectedStateScript(nextState: FlatMapStatePayload) {
  return `
    window.__setGameState(${JSON.stringify(nextState)});
    true;
  `;
}

export function GameFlatMap({
  disabled = false,
  fillAvailableSpace = false,
  flashPlaceId = null,
  height = 360,
  interactive = true,
  mapTheme = defaultMapColors,
  onSelectPlace,
  region,
  showUsStates = false,
  solvedPlaceIds,
}: GameFlatMapProps) {
  const webViewRef = useRef<WebView>(null);
  const [isReady, setIsReady] = useState(false);

  const dynamicState = useMemo<FlatMapStatePayload>(
    () => ({
      disabled,
      flashPlaceId,
      solvedPlaceIds,
    }),
    [disabled, flashPlaceId, solvedPlaceIds]
  );

  const displayGeoJson = useMemo(() => getDisplayGeoJson(showUsStates), [showUsStates]);

  const source = useMemo(
    () => ({
      html: buildFlatMapHtml(displayGeoJson, region, mapTheme, interactive, dynamicState),
      baseUrl: 'https://unpkg.com/',
    }),
    [displayGeoJson, region, mapTheme, interactive]
  );

  useEffect(() => {
    setIsReady(false);
  }, [source]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    webViewRef.current?.injectJavaScript(createInjectedStateScript(dynamicState));
  }, [dynamicState, isReady]);

  function handleMessage(event: WebViewMessageEvent) {
    try {
      const message = JSON.parse(event.nativeEvent.data) as WebViewMessage;

      if (message.type === 'flat-map-ready') {
        setIsReady(true);
        return;
      }

      if (message.type === 'place-select') {
        onSelectPlace?.({
          id: message.id,
          kind: message.kind,
          label: message.label,
        });
      }
    } catch {
      // Ignore unrelated WebView messages.
    }
  }

  return (
    <View style={[styles.wrapper, { backgroundColor: mapTheme.background }, fillAvailableSpace ? styles.fill : { height }]}>
      <WebView
        ref={webViewRef}
        source={source}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        textInteractionEnabled={false}
        dataDetectorTypes="none"
        style={styles.webview}
        onMessage={handleMessage}
      />
      {isReady ? null : (
        <View style={[styles.loadingOverlay, { backgroundColor: mapTheme.background }]}>
          <ActivityIndicator color={mapTheme.unvisited} size="large" />
          <Text style={[styles.loadingText, { color: mapTheme.unvisited }]}>Loading map…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: 'hidden',
  },
  fill: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
