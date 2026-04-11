import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { getDisplayGeoJson } from '../lib/displayGeoJson';
import type { AppMapColors } from '../theme/colors';
import { mapColors as defaultMapColors } from '../theme/colors';

type GameGlobeProps = {
  disabled?: boolean;
  flashPlaceId?: string | null;
  fillAvailableSpace?: boolean;
  height?: number;
  mapTheme?: AppMapColors;
  onSelectPlace?: (selection: { id: string; kind: 'country' | 'state'; label: string }) => void;
  showUsStates?: boolean;
  solvedPlaceIds: readonly string[];
};

type WebViewMessage =
  | {
      type: 'globe-ready';
    }
  | {
      id: string;
      kind: 'country' | 'state';
      label: string;
      type: 'place-select';
    };

type GlobeStatePayload = {
  disabled: boolean;
  flashPlaceId: string | null;
  solvedPlaceIds: readonly string[];
};

function buildGlobeHtml(
  worldGeoJsonData: unknown,
  mapTheme: AppMapColors,
  initialState: GlobeStatePayload
) {
  const worldGeoJson = JSON.stringify(worldGeoJsonData);
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
      html, body, #globeViz {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: transparent;
      }
      .country-label {
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
      .country-label__title {
        font-weight: 700;
        line-height: 1.3;
      }
      .country-label__meta {
        margin-top: 3px;
        color: rgba(255, 250, 242, 0.78);
        line-height: 1.35;
      }
    </style>
    <script src="https://unpkg.com/three@0.157.0/build/three.min.js"></script>
    <script src="https://unpkg.com/globe.gl@2.41.1/dist/globe.gl.min.js"></script>
  </head>
  <body>
    <div id="globeViz"></div>
    <div id="countryLabel" class="country-label"></div>
    <script>
      const world = ${worldGeoJson};
      const theme = ${theme};
      const initialState = ${initialPayload};

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

      const SOLVED_COLOR = theme.user;
      const FLASH_COLOR = theme.friendOne;
      const CURRENT_COLOR = theme.friendTwo;
      const UNVISITED_COLOR = theme.unvisited;

      const container = document.getElementById('globeViz');
      const countryLabel = document.getElementById('countryLabel');

      function postMessage(payload) {
        if (!window.ReactNativeWebView || typeof window.ReactNativeWebView.postMessage !== 'function') {
          return;
        }

        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
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

      function getFeatureKind(feature) {
        return feature && feature.properties && feature.properties.adminLevel === 'state' ? 'state' : 'country';
      }

      function darkenHex(hex, factor = 0.82) {
        const raw = (hex || '').replace('#', '');
        if (raw.length !== 6) return hex;
        const toChannel = (index) => {
          const value = parseInt(raw.slice(index, index + 2), 16);
          return Math.max(0, Math.min(255, Math.round(value * factor)));
        };
        const r = toChannel(0).toString(16).padStart(2, '0');
        const g = toChannel(2).toString(16).padStart(2, '0');
        const b = toChannel(4).toString(16).padStart(2, '0');
        return '#' + r + g + b;
      }

      function getFeatureColor(feature) {
        const placeId = getFeaturePlaceId(feature);
        const isSelected = selectedPlaceId && placeId === selectedPlaceId;

        if (quizState.flashPlaceId && quizState.flashPlaceId === placeId) {
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

      function getStrokeColor(feature) {
        if (feature && feature.properties && feature.properties.__capSlicesApplied) {
          return 'rgba(0, 0, 0, 0)';
        }

        return theme.stroke;
      }

      function getAltitude() {
        return 0.006;
      }

      function getPointerPosition(event) {
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
        const point = getPointerPosition(event);
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

        const point = getPointerPosition(event);
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

      function hideCountryLabel() {
        if (!countryLabel) return;
        countryLabel.style.display = 'none';
      }

      if (container) {
        container.addEventListener('pointerdown', beginInteraction, { passive: true });
        container.addEventListener('pointermove', updateInteraction, { passive: true });
        container.addEventListener('pointerup', endInteraction, { passive: true });
        container.addEventListener('pointercancel', cancelInteraction, { passive: true });
        container.addEventListener('wheel', () => blockSelections(320), { passive: true });
      }

      const globe = Globe({ rendererConfig: { logarithmicDepthBuffer: true } })(container)
        .backgroundColor(theme.background)
        .showGlobe(true)
        .showAtmosphere(false);
      const supportsCapMaterial = typeof globe.polygonCapMaterial === 'function';
      const materialCache = new Map();

      function getSolidMaterial(color) {
        const key = 'solid:' + color;
        if (materialCache.has(key)) {
          return materialCache.get(key);
        }

        const material = new THREE.MeshBasicMaterial({ color });
        materialCache.set(key, material);
        return material;
      }

      function getCapMaterial(feature) {
        return getSolidMaterial(getFeatureColor(feature));
      }

      function getCapColorFallback(feature) {
        return getFeatureColor(feature);
      }

      function refreshPolygonStyles() {
        if (supportsCapMaterial) {
          globe.polygonCapMaterial(getCapMaterial);
        } else {
          globe.polygonCapColor(getCapColorFallback);
        }

        globe.polygonStrokeColor(getStrokeColor).polygonAltitude(getAltitude);
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
          hideCountryLabel();
        } else if (
          selectedPlaceId &&
          !quizState.flashPlaceId &&
          !quizState.solvedPlaceIds.has(selectedPlaceId)
        ) {
          selectedPlaceId = '';
          hideCountryLabel();
        }

        refreshPolygonStyles();
      };

      function dedupeRing(ring) {
        const deduped = [];
        ring.forEach((point) => {
          const previous = deduped[deduped.length - 1];
          if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) {
            deduped.push(point);
          }
        });

        if (deduped.length > 1) {
          const first = deduped[0];
          const last = deduped[deduped.length - 1];
          if (first[0] === last[0] && first[1] === last[1]) {
            deduped.pop();
          }
        }

        return deduped;
      }

      function closeRing(ring) {
        if (!ring.length) return ring;
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] === last[0] && first[1] === last[1]) {
          return ring;
        }
        return [...ring, first];
      }

      function getVerticalIntersection(a, b, boundaryLng) {
        if (a[0] === b[0]) {
          return [boundaryLng, a[1]];
        }

        const t = (boundaryLng - a[0]) / (b[0] - a[0]);
        return [boundaryLng, a[1] + (b[1] - a[1]) * t];
      }

      function clipRingAgainstVerticalBoundary(ring, boundaryLng, keepGreater) {
        const points = dedupeRing(ring);
        if (points.length < 3) {
          return [];
        }

        const output = [];
        let previous = points[points.length - 1];
        let previousInside = keepGreater ? previous[0] >= boundaryLng : previous[0] <= boundaryLng;

        points.forEach((current) => {
          const currentInside = keepGreater ? current[0] >= boundaryLng : current[0] <= boundaryLng;

          if (currentInside !== previousInside) {
            output.push(getVerticalIntersection(previous, current, boundaryLng));
          }

          if (currentInside) {
            output.push(current);
          }

          previous = current;
          previousInside = currentInside;
        });

        return dedupeRing(output);
      }

      function clipRingToLongitudeRange(ring, minLng, maxLng) {
        const clippedMin = clipRingAgainstVerticalBoundary(ring, minLng, true);
        if (clippedMin.length < 3) {
          return null;
        }

        const clippedMax = clipRingAgainstVerticalBoundary(clippedMin, maxLng, false);
        if (clippedMax.length < 3) {
          return null;
        }

        const closed = closeRing(dedupeRing(clippedMax));
        return closed.length >= 4 ? closed : null;
      }

      function splitPolygonByLongitude(polygonCoords, sliceWidth) {
        if (!Array.isArray(polygonCoords) || polygonCoords.length !== 1) {
          return [polygonCoords];
        }

        const sliceOverlap = Math.min(0.18, sliceWidth * 0.04);
        const outerRing = polygonCoords[0];
        const ring = dedupeRing(outerRing);
        if (ring.length < 3) {
          return [polygonCoords];
        }

        const longitudes = ring.map((point) => point[0]);
        const minLng = Math.min(...longitudes);
        const maxLng = Math.max(...longitudes);
        const startLng = Math.floor(minLng / sliceWidth) * sliceWidth;
        const slicedPolygons = [];

        for (let sliceMin = startLng; sliceMin < maxLng; sliceMin += sliceWidth) {
          const sliceMax = Math.min(sliceMin + sliceWidth, maxLng);
          const expandedMin = Math.max(minLng, sliceMin - sliceOverlap);
          const expandedMax = Math.min(maxLng, sliceMax + sliceOverlap);
          const clippedRing = clipRingToLongitudeRange(ring, expandedMin, expandedMax);
          if (!clippedRing) {
            continue;
          }

          slicedPolygons.push([clippedRing]);
        }

        return slicedPolygons.length ? slicedPolygons : [polygonCoords];
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

      function splitFeatureForStableCaps(feature) {
        const countryName = normalizeCountryName(getFeatureName(feature));
        if (countryName === 'usa' && feature && feature.geometry && feature.geometry.type === 'MultiPolygon') {
          return feature.geometry.coordinates.map((polygonCoords) => {
            const bounds = getPolygonBounds(polygonCoords);
            const isAlaskaPolygon = bounds.maxLat >= 54 && bounds.maxLon <= -129;

            return {
              ...feature,
              properties: {
                ...(feature.properties || {}),
                ...(isAlaskaPolygon ? { __capCurvatureResolutionOverride: 15 } : null),
              },
              geometry: {
                type: 'Polygon',
                coordinates: polygonCoords,
              },
            };
          });
        }

        const sliceWidth =
          countryName === 'greenland'
            ? 12
            : countryName === 'canada'
              ? 10
              : countryName === 'russia'
                ? 10
                : countryName === 'australia'
                  ? 10
                  : null;

        if (!sliceWidth || !feature || !feature.geometry) {
          return [feature];
        }

        const geometry = feature.geometry;
        const polygons = geometry.type === 'Polygon'
          ? [geometry.coordinates]
          : geometry.type === 'MultiPolygon'
            ? geometry.coordinates
            : null;

        if (!polygons) {
          return [feature];
        }

        const splitPolygons = polygons.flatMap((polygonCoords) => splitPolygonByLongitude(polygonCoords, sliceWidth));

        return [{
          ...feature,
          properties: {
            ...(feature.properties || {}),
            __capSlicesApplied: true,
          },
          geometry: {
            type: 'MultiPolygon',
            coordinates: splitPolygons,
          },
        }];
      }

      function getCapCurvatureResolution(feature) {
        const override = feature && feature.properties && feature.properties.__capCurvatureResolutionOverride;
        if (typeof override === 'number' && Number.isFinite(override)) {
          return override;
        }

        const countryName = normalizeCountryName(getFeatureName(feature));
        if (countryName === 'south africa') return 20;
        if (countryName === 'zambia') return 10;
        if (countryName === 'somalia') return 2;
        if (countryName === 'ethiopia') return 10;
        if (countryName === 'india') return 1;
        if (countryName === 'china') return 1;
        if (countryName === 'mozambique') return 1;
        if (countryName === 'indonesia') return 10;
        if (countryName === 'thailand') return 1;
        if (countryName === 'brazil') return 1;
        if (countryName === 'chile') return 1;
        if (countryName === 'texas') return 20;
        if (countryName === 'new mexico') return 20;
        if (countryName === 'minnesota') return 20;
        return 5;
      }

      function tuneCameraForDepthPrecision() {
        const camera = globe.camera && globe.camera();
        if (camera) {
          camera.near = 0.4;
          if (camera.far > 1200) {
            camera.far = 1200;
          }
          camera.updateProjectionMatrix();
        }

        const controls = globe.controls && globe.controls();
        if (controls) {
          controls.minDistance = 110;
          controls.update();
        }
      }

      tuneCameraForDepthPrecision();

      const waterMaterial = new THREE.MeshBasicMaterial({ color: theme.ocean });
      waterMaterial.polygonOffset = true;
      waterMaterial.polygonOffsetFactor = 1;
      waterMaterial.polygonOffsetUnits = 1;
      globe.globeMaterial(waterMaterial);

      const globeFeatures = ((world && world.features) || []).flatMap(splitFeatureForStableCaps);
      const polygonLayer = globe
        .polygonsData(globeFeatures)
        .polygonSideColor(() => 'rgba(0, 0, 0, 0)')
        .polygonStrokeColor(getStrokeColor)
        .polygonAltitude(getAltitude)
        .polygonCapCurvatureResolution(getCapCurvatureResolution)
        .polygonLabel(() => '')
        .onPolygonClick((feature, event) => {
          if (quizState.disabled || !shouldHandleTapSelection()) {
            return;
          }

          const label = getFeatureName(feature) || 'Unknown';
          const placeId = getFeaturePlaceId(feature);
          const kind = getFeatureKind(feature);
          selectedPlaceId = placeId;
          refreshPolygonStyles();
          postMessage({
            type: 'place-select',
            id: placeId,
            kind,
            label,
          });
        })
        .onGlobeClick(() => {
          if (!shouldHandleTapSelection()) {
            return;
          }

          selectedPlaceId = '';
          refreshPolygonStyles();
          hideCountryLabel();
        });

      if (supportsCapMaterial) {
        polygonLayer.polygonCapMaterial(getCapMaterial);
      } else {
        polygonLayer.polygonCapColor(getCapColorFallback);
      }

      function stabilizePolygonDepth() {
        const scene = globe.scene && globe.scene();
        if (!scene) {
          return;
        }

        scene.traverse((obj) => {
          if (!obj || !obj.material) {
            return;
          }

          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          materials.forEach((material) => {
            if (!material) {
              return;
            }
            material.polygonOffset = true;
            material.polygonOffsetFactor = -1;
            material.polygonOffsetUnits = -1;
            if ('depthTest' in material) material.depthTest = true;
            if ('depthWrite' in material) material.depthWrite = true;
            if ('needsUpdate' in material) material.needsUpdate = true;
          });

          if (obj.isMesh) {
            obj.renderOrder = 1;
          } else if (obj.isLine || obj.isLineSegments) {
            obj.renderOrder = 2;
          }
        });
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(stabilizePolygonDepth);
      });

      globe.controls().autoRotate = false;
      globe.controls().enableZoom = true;
      globe.controls().enablePan = true;

      function applyStartPointOfView(viewportWidth, viewportHeight) {
        const camera = globe.camera && globe.camera();
        const aspectRatio = viewportWidth / Math.max(1, viewportHeight);
        const verticalHalfFov = camera && typeof camera.fov === 'number' ? (camera.fov * Math.PI) / 360 : Math.PI / 6;
        const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspectRatio);
        const limitingHalfFov = Math.max(0.01, Math.min(verticalHalfFov * 0.8, horizontalHalfFov * 0.9));
        const altitude = Math.max(2.5, 1 / Math.sin(limitingHalfFov) - 1 + 0.08);
        const controls = globe.controls && globe.controls();
        if (controls) {
          const globeRadius = globe.getGlobeRadius ? globe.getGlobeRadius() : 100;
          controls.maxDistance = Math.max(380, globeRadius * (altitude + 1.35));
          controls.update();
        }

        globe.pointOfView(
          {
            lat: 18,
            lng: 12,
            altitude,
          },
          0
        );
      }

      function resize() {
        const viewportWidth = Math.max(1, container.clientWidth || window.innerWidth || 1);
        const viewportHeight = Math.max(1, container.clientHeight || window.innerHeight || 1);
        globe.width(viewportWidth);
        globe.height(viewportHeight);
        tuneCameraForDepthPrecision();
        applyStartPointOfView(viewportWidth, viewportHeight);
      }

      resize();
      if (typeof ResizeObserver === 'function') {
        const resizeObserver = new ResizeObserver(() => {
          resize();
        });
        resizeObserver.observe(container);
      }

      window.addEventListener('resize', resize);
      refreshPolygonStyles();
      postMessage({ type: 'globe-ready' });
    </script>
  </body>
</html>
  `;
}

function createInjectedStateScript(nextState: GlobeStatePayload) {
  return `
    window.__setGameState(${JSON.stringify(nextState)});
    true;
  `;
}

export function GameGlobe({
  disabled = false,
  flashPlaceId = null,
  fillAvailableSpace = false,
  height = 420,
  mapTheme = defaultMapColors,
  onSelectPlace,
  showUsStates = false,
  solvedPlaceIds,
}: GameGlobeProps) {
  const webViewRef = useRef<WebView>(null);
  const [isReady, setIsReady] = useState(false);

  const dynamicState = useMemo<GlobeStatePayload>(
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
      html: buildGlobeHtml(displayGeoJson, mapTheme, dynamicState),
      baseUrl: 'https://unpkg.com/',
    }),
    [displayGeoJson, mapTheme]
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

      if (message.type === 'globe-ready') {
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
    <View
      style={[
        styles.wrapper,
        { backgroundColor: mapTheme.background },
        fillAvailableSpace ? styles.fill : { height },
      ]}
    >
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
});
