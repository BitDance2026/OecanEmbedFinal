import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { MapPin, Compass, Eye, Layers, ZoomIn, ZoomOut, RotateCcw, Sliders } from 'lucide-react';
import { COLORMAPS } from '../utils/colormaps';

const LAT_MIN = 5.0;
const LAT_MAX = 30.0;
const LON_MIN = 45.0;
const LON_MAX = 105.0;
const BASIN_SPLIT_LON = 78.0;

// Base Map Tile Providers (Free, high-contrast & scientific basemaps without API key requirement)
const TILE_PROVIDERS = {
  dark: {
    name: 'Monochrome Dark (Esri Dark Canvas)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    subdomains: '',
  },
  ocean: {
    name: 'Bathymetry & Ocean (Esri Ocean)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; GEBCO, NOAA, CHS, National Geographic',
    subdomains: '',
  },
  satellite: {
    name: 'Satellite Imagery (Esri World)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Earthstar Geographics',
    subdomains: '',
  },
  osm: {
    name: 'Standard Geographic (OSM)',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    subdomains: 'abc',
  },
  light: {
    name: 'Monochrome Light (Esri Light Canvas)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    subdomains: '',
  },
};

export default function OceanMap({
  mapData,
  loading,
  selectedLat,
  selectedLon,
  onSelectPoint,
  activeColormap,
  argoSamples,
  showArgoFloats,
  setShowArgoFloats,
  depth,
  date,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const overlayLayerRef = useRef(null);
  const basinLineRef = useRef(null);
  const selectedMarkerRef = useRef(null);
  const argoLayerGroupRef = useRef(null);
  const labelsLayerGroupRef = useRef(null);

  const [baseTileKey, setBaseTileKey] = useState('dark');
  const [thermalOpacity, setThermalOpacity] = useState(0.85);
  const [hoverCoord, setHoverCoord] = useState(null);

  const onSelectPointRef = useRef(onSelectPoint);
  useEffect(() => {
    onSelectPointRef.current = onSelectPoint;
  }, [onSelectPoint]);

  // 1. Initialize Leaflet Map Centered on India & Surrounding Oceans (runs ONCE on mount)
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Centered on South Asia / Indian Peninsula
    const map = L.map(mapContainerRef.current, {
      center: [16.5, 75.0],
      zoom: 5,
      minZoom: 3,
      maxZoom: 9,
      zoomControl: false,
      attributionControl: false,
    });

    mapInstanceRef.current = map;

    // Add Base Tile Layer
    const tileConf = TILE_PROVIDERS[baseTileKey];
    tileLayerRef.current = L.tileLayer(tileConf.url, {
      maxZoom: 19,
      subdomains: tileConf.subdomains || 'abc',
      attribution: tileConf.attribution,
    }).addTo(map);

    // Create ARGO and Label Layer Groups
    argoLayerGroupRef.current = L.layerGroup().addTo(map);
    labelsLayerGroupRef.current = L.layerGroup().addTo(map);

    // 78°E Basin Demarcation Polyline (Arabian Sea | Bay of Bengal)
    basinLineRef.current = L.polyline(
      [
        [5.0, BASIN_SPLIT_LON],
        [28.0, BASIN_SPLIT_LON],
      ],
      {
        color: '#ffffff',
        weight: 2,
        dashArray: '6, 6',
        opacity: 0.85,
      }
    ).addTo(map);

    basinLineRef.current.bindTooltip('78°E Regional Basin Demarcation (Arabian Sea / Bay of Bengal)', {
      sticky: true,
      className: 'leaflet-tooltip-dark',
    });

    // Add Basin & Geography Text Badges
    const addTextLabel = (lat, lon, text, subtext = '') => {
      const icon = L.divIcon({
        className: 'ocean-label-icon',
        html: `
          <div style="
            background: rgba(10, 10, 14, 0.82);
            border: 1px solid rgba(255, 255, 255, 0.25);
            padding: 3px 8px;
            border-radius: 4px;
            color: #ffffff;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            white-space: nowrap;
            box-shadow: 0 2px 10px rgba(0,0,0,0.8);
            text-align: center;
            pointer-events: none;
          ">
            ${text}
            ${subtext ? `<div style="font-size: 9px; color: #a1a1aa; font-weight: 400; font-family: monospace;">${subtext}</div>` : ''}
          </div>
        `,
        iconSize: [120, 30],
        iconAnchor: [60, 15],
      });
      L.marker([lat, lon], { icon, interactive: false }).addTo(labelsLayerGroupRef.current);
    };

    addTextLabel(16.0, 63.5, 'ARABIAN SEA', 'West of 78°E');
    addTextLabel(16.0, 89.0, 'BAY OF BENGAL', 'East of 78°E');
    addTextLabel(6.5, 78.0, 'INDIAN OCEAN', 'Equatorial Basin');
    addTextLabel(21.5, 78.5, 'INDIA', 'Peninsular Landmass');
    addTextLabel(7.8, 80.7, 'SRI LANKA');

    // Click on Map to Select Point for Subsurface Profile (does NOT reload the map)
    map.on('click', (e) => {
      const lat = parseFloat(e.latlng.lat.toFixed(2));
      const lon = parseFloat(e.latlng.lng.toFixed(2));
      if (lat >= LAT_MIN && lat <= LAT_MAX && lon >= LON_MIN && lon <= LON_MAX) {
        if (onSelectPointRef.current) {
          onSelectPointRef.current(lat, lon);
        }
      }
    });

    // Mouse Move Coordinate Tracker
    map.on('mousemove', (e) => {
      const lat = e.latlng.lat;
      const lon = e.latlng.lng;
      if (lat >= LAT_MIN && lat <= LAT_MAX && lon >= LON_MIN && lon <= LON_MAX) {
        setHoverCoord({
          lat: lat.toFixed(2),
          lon: lon.toFixed(2),
          basin: lon < BASIN_SPLIT_LON ? 'Arabian Sea' : 'Bay of Bengal',
        });
      } else {
        setHoverCoord(null);
      }
    });

    map.on('mouseout', () => {
      setHoverCoord(null);
    });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // 2. Handle Base Tile Provider Change
  useEffect(() => {
    if (!mapInstanceRef.current || !tileLayerRef.current) return;
    const tileConf = TILE_PROVIDERS[baseTileKey];
    tileLayerRef.current.setUrl(tileConf.url);
  }, [baseTileKey]);

  // 3. Render and Update Thermal Heatmap Overlay on the Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!mapData || !mapData.temperature_grid) {
      if (overlayLayerRef.current) {
        map.removeLayer(overlayLayerRef.current);
        overlayLayerRef.current = null;
      }
      return;
    }

    const grid = mapData.temperature_grid; // [101][241]
    const nLat = grid.length;
    const nLon = grid[0].length;
    const stats = mapData.stats || { min_c: 10, max_c: 32 };
    const minC = stats.min_c;
    const maxC = stats.max_c;

    const colormapConfig = COLORMAPS[activeColormap] || COLORMAPS.monochrome;
    const getColor = colormapConfig.fn;

    // Create Offscreen Canvas for rasterization
    const canvas = document.createElement('canvas');
    canvas.width = nLon;
    canvas.height = nLat;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(nLon, nLat);
    const data = imgData.data;

    const lats = mapData.latitude || [];
    const isAscending = lats.length > 1 && lats[0] < lats[lats.length - 1];

    for (let r = 0; r < nLat; r++) {
      // NetCDF raster coordinates (North at top)
      const srcRow = isAscending ? (nLat - 1 - r) : r;
      const rowArr = grid[srcRow];
      for (let c = 0; c < nLon; c++) {
        const val = rowArr[c];
        const [red, green, blue, alpha] = getColor(val, minC, maxC, Math.round(thermalOpacity * 255));
        const idx = (r * nLon + c) * 4;
        data[idx] = red;
        data[idx + 1] = green;
        data[idx + 2] = blue;
        data[idx + 3] = alpha;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    const dataUrl = canvas.toDataURL();

    // Geographic Bounding Box for North Indian Ocean Domain
    const imageBounds = [
      [LAT_MIN, LON_MIN],
      [LAT_MAX, LON_MAX],
    ];

    if (overlayLayerRef.current) {
      map.removeLayer(overlayLayerRef.current);
    }

    overlayLayerRef.current = L.imageOverlay(dataUrl, imageBounds, {
      opacity: 1.0, // Alpha already baked into pixel buffer
      interactive: false,
      zIndex: 10,
    }).addTo(map);
  }, [mapData, activeColormap, thermalOpacity]);

  // 4. Update Selected Point Target Marker
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (selectedLat === null || selectedLon === null) {
      if (selectedMarkerRef.current) {
        map.removeLayer(selectedMarkerRef.current);
        selectedMarkerRef.current = null;
      }
      return;
    }

    if (selectedMarkerRef.current) {
      map.removeLayer(selectedMarkerRef.current);
    }

    const customPinIcon = L.divIcon({
      className: 'custom-crosshair-icon',
      html: `
        <div style="
          position: relative;
          width: 24px;
          height: 24px;
          transform: translate(-12px, -12px);
        ">
          <div style="
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            border-radius: 50%;
            border: 2px solid #ffffff;
            box-shadow: 0 0 12px #ffffff, 0 0 4px #000000;
            animation: pulse 1.8s infinite;
          "></div>
          <div style="
            position: absolute;
            top: 10px; left: 10px;
            width: 4px; height: 4px;
            background: #ffffff;
            border-radius: 50%;
          "></div>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    selectedMarkerRef.current = L.marker([selectedLat, selectedLon], {
      icon: customPinIcon,
      zIndexOffset: 1000,
    }).addTo(map);

    selectedMarkerRef.current.bindTooltip(
      `<strong>Selected:</strong> ${selectedLat}°N, ${selectedLon}°E`,
      { permanent: false, direction: 'top', className: 'leaflet-tooltip-dark' }
    );
  }, [selectedLat, selectedLon]);

  // 5. Update ARGO Floats Layer Group
  useEffect(() => {
    if (!argoLayerGroupRef.current) return;
    argoLayerGroupRef.current.clearLayers();

    if (!showArgoFloats || !argoSamples || argoSamples.length === 0) return;

    argoSamples.forEach((float) => {
      const circle = L.circleMarker([float.latitude, float.longitude], {
        radius: 4.5,
        fillColor: '#38bdf8',
        color: '#ffffff',
        weight: 1.5,
        opacity: 0.95,
        fillOpacity: 0.85,
      });

      circle.bindTooltip(
        `<div style="font-family: var(--font-sans); line-height: 1.4;">
           <div style="font-weight: 700; color: #38bdf8; font-size: 12px; margin-bottom: 2px;">
             ⚓ ARGO Float #${float.platform}
           </div>
           <div style="color: #ffffff; font-size: 11px;">
             <strong>Cycle:</strong> ${float.cycle} · <strong>Basin:</strong> ${float.basin}
           </div>
           <div style="color: #a1a1aa; font-size: 10px; font-family: var(--font-mono); margin-top: 2px;">
             ${float.latitude}°N, ${float.longitude}°E · ${float.time}
           </div>
           <div style="color: #67e8f9; font-size: 10px; margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 3px;">
             ✦ Click to inspect subsurface profile
           </div>
         </div>`,
        { className: 'leaflet-tooltip-dark', direction: 'top', offset: [0, -4] }
      );

      circle.on('click', () => {
        onSelectPoint(float.latitude, float.longitude, float.time);
      });

      circle.addTo(argoLayerGroupRef.current);
    });
  }, [showArgoFloats, argoSamples, onSelectPoint]);

  // Map Controls Helpers
  const handleZoomIn = () => mapInstanceRef.current?.zoomIn();
  const handleZoomOut = () => mapInstanceRef.current?.zoomOut();
  const handleResetView = () => mapInstanceRef.current?.setView([16.5, 75.0], 5);

  const stats = mapData?.stats || { min_c: 12, max_c: 31, mean_c: 24 };

  return (
    <div className="glass-panel" style={{ padding: '20px', position: 'relative' }}>
      {/* Map Card Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '14px',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <MapPin size={18} strokeWidth={2.2} />
          <div>
            <h2 style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              North Indian Ocean · India & Regional Basins
            </h2>
            <span className="mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              Arabian Sea · Bay of Bengal · Indian Ocean (Depth: {mapData?.depth_m ?? depth}m · {mapData?.matched_date ?? date})
            </span>
          </div>
        </div>

        {/* Header Right Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Base Map Style Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Layers size={13} style={{ color: 'var(--text-muted)' }} />
            <select
              value={baseTileKey}
              onChange={(e) => setBaseTileKey(e.target.value)}
              style={{
                background: 'var(--bg-card)',
                color: 'var(--text-pure)',
                border: '1px solid var(--border-medium)',
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              {Object.entries(TILE_PROVIDERS).map(([k, conf]) => (
                <option key={k} value={k} style={{ background: '#111114', color: '#ffffff' }}>
                  {conf.name}
                </option>
              ))}
            </select>
          </div>

          {/* ARGO Floats Toggle */}
          <button
            onClick={() => setShowArgoFloats(!showArgoFloats)}
            className="tag-badge"
            style={{
              cursor: 'pointer',
              borderColor: showArgoFloats ? 'var(--accent-white)' : 'var(--border-default)',
              color: showArgoFloats ? 'var(--text-pure)' : 'var(--text-muted)',
              background: showArgoFloats ? 'var(--bg-card-hover)' : 'var(--bg-secondary)',
            }}
          >
            <Compass size={12} />
            {showArgoFloats ? `ARGO Floats (${argoSamples?.length || 0}): ON` : `ARGO Floats (${argoSamples?.length || 0}): OFF`}
          </button>
        </div>
      </div>

      {/* Leaflet Map Container Wrapper */}
      <div style={{
        position: 'relative',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        border: '1px solid var(--border-default)',
        background: '#08080a',
      }}>
        <div
          ref={mapContainerRef}
          style={{
            width: '100%',
            height: '460px',
            background: '#070709',
          }}
        />

        {/* Floating Custom Zoom & View Controls */}
        <div style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          zIndex: 500,
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}>
          <button
            onClick={handleZoomIn}
            className="glass-panel"
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              borderRadius: 'var(--radius-sm)',
            }}
            title="Zoom In"
          >
            <ZoomIn size={16} />
          </button>
          <button
            onClick={handleZoomOut}
            className="glass-panel"
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              borderRadius: 'var(--radius-sm)',
            }}
            title="Zoom Out"
          >
            <ZoomOut size={16} />
          </button>
          <button
            onClick={handleResetView}
            className="glass-panel"
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              borderRadius: 'var(--radius-sm)',
            }}
            title="Reset View to India"
          >
            <RotateCcw size={15} />
          </button>
        </div>

        {/* Floating Active Coordinate Badge */}
        {selectedLat !== null && (
          <div style={{
            position: 'absolute',
            bottom: '12px',
            left: '12px',
            zIndex: 500,
            background: 'rgba(0, 0, 0, 0.88)',
            border: '1px solid var(--border-bright)',
            padding: '6px 12px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backdropFilter: 'blur(8px)',
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ffffff', display: 'inline-block' }} />
            <span className="mono">Selected Coordinate: <strong>{selectedLat}°N, {selectedLon}°E</strong></span>
          </div>
        )}

        {/* Floating Hover Coordinates Tracker */}
        {hoverCoord && (
          <div style={{
            position: 'absolute',
            bottom: '12px',
            right: '12px',
            zIndex: 500,
            background: 'rgba(0, 0, 0, 0.88)',
            border: '1px solid var(--border-default)',
            padding: '4px 10px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '11px',
            color: 'var(--text-secondary)',
            backdropFilter: 'blur(8px)',
          }}>
            Cursor: <span className="mono" style={{ color: 'var(--text-pure)', fontWeight: 600 }}>{hoverCoord.lat}°N, {hoverCoord.lon}°E</span> ({hoverCoord.basin})
          </div>
        )}
      </div>

      {/* Map Footer & Thermal Legend Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: '14px',
        gap: '16px',
        flexWrap: 'wrap',
      }}>
        {/* Colormap Scale */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Temp (°C):
          </span>
          <span className="mono" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-pure)' }}>
            {stats.min_c.toFixed(1)}°C
          </span>
          <div style={{
            width: '180px',
            height: '10px',
            borderRadius: '2px',
            background: COLORMAPS[activeColormap]?.gradientCss || COLORMAPS.monochrome.gradientCss,
            border: '1px solid var(--border-default)',
          }} />
          <span className="mono" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-pure)' }}>
            {stats.max_c.toFixed(1)}°C
          </span>
        </div>

        {/* Thermal Layer Opacity Slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sliders size={13} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Layer Opacity:</span>
          <input
            type="range"
            min={0.2}
            max={1.0}
            step={0.05}
            value={thermalOpacity}
            onChange={(e) => setThermalOpacity(parseFloat(e.target.value))}
            style={{ width: '80px' }}
          />
          <span className="mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            {Math.round(thermalOpacity * 100)}%
          </span>
        </div>

        {/* Domain Stats */}
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          Mean: <span className="mono" style={{ color: 'var(--text-pure)', fontWeight: 600 }}>{stats.mean_c?.toFixed(1)}°C</span> · 
          Domain: <span className="mono" style={{ color: 'var(--text-pure)' }}>5°N–30°N, 45°E–105°E</span>
        </div>
      </div>
    </div>
  );
}
