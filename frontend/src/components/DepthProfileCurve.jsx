import React, { useState } from 'react';
import { Activity, MapPin, Layers, Sparkles, Flame } from 'lucide-react';

export default function DepthProfileCurve({
  profileData,
  loading,
  selectedDepth = 100,
  onSelectDepth,
  date,
}) {
  const [hoveredPoint, setHoveredPoint] = useState(null);

  // Initial loading only when no profileData exists yet
  if (loading && !profileData) {
    return (
      <div className="glass-panel" style={{ padding: '20px', minHeight: '420px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
        <div style={{
          width: '24px',
          height: '24px',
          border: '2px solid rgba(255, 255, 255, 0.2)',
          borderTopColor: '#ffffff',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Computing subsurface thermal profile (0–1000m)...
        </span>
      </div>
    );
  }

  if (!profileData || profileData.error || !profileData.temperatures_c) {
    return (
      <div className="glass-panel" style={{ padding: '20px', minHeight: '420px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: '10px' }}>
        <MapPin size={24} style={{ color: 'var(--text-muted)' }} />
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-pure)' }}>
          {profileData?.error || 'Click any ocean coordinate on the map'}
        </h3>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '280px' }}>
          Select an ocean location in the Arabian Sea or Bay of Bengal to reconstruct its full vertical 15-depth temperature profile.
        </p>
      </div>
    );
  }

  const depths = profileData.depths_m || [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000];
  const temps = profileData.temperatures_c || [];

  // Filter valid points
  const points = depths
    .map((d, i) => ({ depth: d, temp: temps[i] }))
    .filter((p) => p.temp !== null && p.temp !== undefined && !isNaN(p.temp));

  if (points.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '20px', minHeight: '420px', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Location is on land or has insufficient ocean data.</p>
      </div>
    );
  }

  // Stable temperature axis bounds across all seasons (0°C to 35°C or stable quantized bounds)
  // Deep water is ~4°C, warm tropical surface is ~30-32°C. Keeping a stable 0–35°C axis prevents jumping during date playback!
  const tMinAxis = 0;
  const tMaxAxis = 35;

  // Find temperature at currently selected depth
  const activeDepthPoint = points.find((p) => p.depth === selectedDepth) ||
    points.reduce((prev, curr) => Math.abs(curr.depth - selectedDepth) < Math.abs(prev.depth - selectedDepth) ? curr : prev, points[0]);

  // SVG Chart Geometry
  const svgWidth = 340;
  const svgHeight = 280;
  const padLeft = 45;
  const padRight = 25;
  const padTop = 20;
  const padBottom = 30;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  // Non-linear depth scaling (sqrt scale) gives high resolution to upper 0–200m thermocline while accommodating 1000m
  const depthToY = (d) => padTop + (Math.sqrt(d) / Math.sqrt(1000)) * plotH;
  const tempToX = (t) => padLeft + ((t - tMinAxis) / (tMaxAxis - tMinAxis)) * plotW;

  // Generate SVG path string
  const pathD = points
    .map((p, idx) => {
      const x = tempToX(p.temp);
      const y = depthToY(p.depth);
      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  // Gradient area under curve
  const areaD = `${pathD} L ${padLeft} ${depthToY(points[points.length - 1].depth).toFixed(1)} L ${padLeft} ${depthToY(points[0].depth).toFixed(1)} Z`;

  // Standard depth ticks for axis
  const depthTicks = [0, 50, 100, 200, 500, 1000];
  // Stable temperature ticks
  const tempTicks = [0, 10, 20, 30];

  const thermoclineY = profileData.thermocline_depth_m !== null
    ? depthToY(profileData.thermocline_depth_m)
    : null;

  const selectedDepthY = depthToY(selectedDepth);

  const displayDate = profileData.matched_date || date || '';

  return (
    <div className="glass-panel" style={{ padding: '20px', position: 'relative' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '14px',
        flexWrap: 'wrap',
        gap: '10px',
      }}>
        {/* Left: Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={16} />
          <h3 style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Subsurface Vertical Profile (0–1000m)
          </h3>
        </div>

        {/* Middle: Syncing Indicator */}
        {loading && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '10.5px',
            color: '#38bdf8',
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            background: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            padding: '2px 8px',
            borderRadius: 'var(--radius-sm)',
          }}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#38bdf8',
              boxShadow: '0 0 6px #38bdf8',
              display: 'inline-block',
              animation: 'pulse 1.2s infinite',
            }} />
            Syncing profile...
          </div>
        )}

        {/* Right: Date, Depth, and Sea Name Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginLeft: 'auto' }}>
          <span className="tag-badge" style={{ fontSize: '10px' }}>
            {displayDate}
          </span>
          <span className="tag-badge" style={{ fontSize: '10px', background: 'rgba(255, 255, 255, 0.12)', color: '#ffffff' }}>
            Depth: {selectedDepth}m
          </span>
          <span className="tag-badge white" style={{ fontSize: '10px' }}>
            {profileData.basin}
          </span>
        </div>
      </div>

      {/* Coordinate & Metric Badges */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '6px',
        marginBottom: '14px',
        background: 'var(--bg-secondary)',
        padding: '10px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-subtle)',
      }}>
        <div>
          <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>COORDINATE</div>
          <div className="mono" style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-pure)' }}>
            {profileData.matched_lat}°N, {profileData.matched_lon}°E
          </div>
        </div>
        <div>
          <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>SURFACE (0M)</div>
          <div className="mono" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-pure)' }}>
            {profileData.surface_temp_c !== null && profileData.surface_temp_c !== undefined ? `${profileData.surface_temp_c.toFixed(1)}°C` : '—'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>AT DEPTH ({selectedDepth}M)</div>
          <div className="mono" style={{ fontSize: '11px', fontWeight: 700, color: '#ffffff', textDecoration: 'underline', textUnderlineOffset: '2px' }}>
            {activeDepthPoint ? `${activeDepthPoint.temp.toFixed(1)}°C` : '—'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>DEEP (1000M)</div>
          <div className="mono" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-pure)' }}>
            {profileData.bottom_temp_c !== null && profileData.bottom_temp_c !== undefined ? `${profileData.bottom_temp_c.toFixed(1)}°C` : '—'}
          </div>
        </div>
      </div>

      {/* SVG Depth Curve Chart */}
      <div style={{ position: 'relative', background: '#08080a', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)', padding: '8px' }}>
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
          <defs>
            <linearGradient id="profileCurveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255, 255, 255, 0.02)" />
              <stop offset="100%" stopColor="rgba(255, 255, 255, 0.16)" />
            </linearGradient>
          </defs>

          {/* Grid lines: Depths (horizontal) */}
          {depthTicks.map((d) => {
            const y = depthToY(d);
            const isCurrent = d === selectedDepth;
            return (
              <g key={d} style={{ cursor: onSelectDepth ? 'pointer' : 'default' }} onClick={() => onSelectDepth && onSelectDepth(d)}>
                <line x1={padLeft} y1={y} x2={svgWidth - padRight} y2={y} stroke={isCurrent ? "rgba(255, 255, 255, 0.25)" : "rgba(255, 255, 255, 0.08)"} strokeDasharray="2,2" />
                <text x={padLeft - 6} y={y + 3} textAnchor="end" fill={isCurrent ? "#ffffff" : "#71717a"} fontSize="9" fontWeight={isCurrent ? "700" : "400"} fontFamily="JetBrains Mono, monospace">
                  {d}m
                </text>
              </g>
            );
          })}

          {/* Grid lines: Temperatures (vertical) */}
          {tempTicks.map((t) => {
            const x = tempToX(t);
            return (
              <g key={t}>
                <line x1={x} y1={padTop} x2={x} y2={svgHeight - padBottom} stroke="rgba(255, 255, 255, 0.08)" strokeDasharray="2,2" />
                <text x={x} y={svgHeight - padBottom + 14} textAnchor="middle" fill="#71717a" fontSize="9" fontFamily="JetBrains Mono, monospace">
                  {t}°C
                </text>
              </g>
            );
          })}

          {/* Currently Selected Depth Level Line */}
          {selectedDepthY !== null && (
            <g>
              <line
                x1={padLeft}
                y1={selectedDepthY}
                x2={svgWidth - padRight}
                y2={selectedDepthY}
                stroke="rgba(255, 255, 255, 0.45)"
                strokeWidth="1.2"
                strokeDasharray="3,3"
              />
              <text
                x={padLeft + 4}
                y={selectedDepthY - 4}
                textAnchor="start"
                fill="#ffffff"
                fontSize="8"
                fontFamily="JetBrains Mono, monospace"
                fontWeight="700"
              >
                MAP DEPTH ({selectedDepth}m)
              </text>
            </g>
          )}

          {/* Thermocline Marker Line */}
          {thermoclineY !== null && Math.abs(thermoclineY - selectedDepthY) > 12 && (
            <g>
              <line x1={padLeft} y1={thermoclineY} x2={svgWidth - padRight} y2={thermoclineY} stroke="rgba(255, 255, 255, 0.8)" strokeWidth="1" strokeDasharray="4,2" />
              <text x={svgWidth - padRight - 4} y={thermoclineY - 4} textAnchor="end" fill="#d4d4d8" fontSize="8" fontFamily="JetBrains Mono, monospace">
                Thermocline (~{profileData.thermocline_depth_m}m)
              </text>
            </g>
          )}

          {/* Shaded Area Under Curve */}
          <path d={areaD} fill="url(#profileCurveGradient)" />

          {/* The Main Temperature Profile Curve */}
          <path
            d={pathD}
            fill="none"
            stroke="#ffffff"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transition: 'd 0.15s ease' }}
          />

          {/* Data Points on Curve */}
          {points.map((p, i) => {
            const isSelectedDepth = p.depth === selectedDepth;
            const cx = tempToX(p.temp);
            const cy = depthToY(p.depth);
            return (
              <g key={i} onClick={() => onSelectDepth && onSelectDepth(p.depth)} style={{ cursor: 'pointer' }}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={isSelectedDepth ? "5" : "3"}
                  fill={isSelectedDepth ? "#ffffff" : "#000000"}
                  stroke="#ffffff"
                  strokeWidth={isSelectedDepth ? "2" : "1.5"}
                  style={{ transition: 'all 0.15s ease' }}
                  onMouseEnter={() => setHoveredPoint(p)}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
                {isSelectedDepth && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r="8"
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.5)"
                    strokeWidth="1"
                    strokeDasharray="2,2"
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* Hover / Active Data Point Callout */}
        {hoveredPoint && (
          <div style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'rgba(0, 0, 0, 0.9)',
            border: '1px solid #ffffff',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            color: '#ffffff',
            pointerEvents: 'none',
          }}>
            Depth: <strong>{hoveredPoint.depth}m</strong> · Temp: <strong>{hoveredPoint.temp.toFixed(2)}°C</strong>
          </div>
        )}

        {/* Axis Labels */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '6px',
          padding: '0 8px',
          fontSize: '10px',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
        }}>
          <span>Depth: 0m (Surface) → 1000m (Abyssal)</span>
          <span>Temperature Scale (0°C – 35°C)</span>
        </div>
      </div>

      {/* Thermocline explanation badge */}
      {profileData.thermocline_depth_m && (
        <div style={{
          marginTop: '12px',
          padding: '8px 12px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          fontSize: '11px',
          color: 'var(--text-secondary)',
          lineHeight: 1.4,
        }}>
          <strong>Thermocline Inflection ({displayDate}):</strong> Peak vertical temperature gradient detected at <strong>{profileData.thermocline_depth_m}m</strong>, stepping from {profileData.surface_temp_c?.toFixed(1)}°C at surface to {profileData.bottom_temp_c?.toFixed(1)}°C deep ocean.
        </div>
      )}
    </div>
  );
}

