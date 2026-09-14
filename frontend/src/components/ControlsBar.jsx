import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, Flame, Calendar, Layers, Sparkles, Sun, CloudRain, Wind, Snowflake } from 'lucide-react';

const DEPTHS = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000];

const PRESETS = [
  {
    id: 'pre_monsoon',
    title: 'Pre-Monsoon Heat',
    date: '2022-05-15',
    depth: 0,
    icon: Sun,
    tag: 'MAY 15 (0m)',
    desc: 'Intense surface solar heating',
  },
  {
    id: 'sw_monsoon',
    title: 'SW Monsoon & Upwelling',
    date: '2022-07-25',
    depth: 100,
    icon: CloudRain,
    tag: 'JUL 25 (100m)',
    desc: 'Strong winds & thermocline shoaling',
  },
  {
    id: 'post_monsoon',
    title: 'Post-Monsoon Transition',
    date: '2022-10-15',
    depth: 50,
    icon: Wind,
    tag: 'OCT 15 (50m)',
    desc: 'Inter-monsoon stratification',
  },
  {
    id: 'ne_monsoon',
    title: 'NE Monsoon Winter',
    date: '2022-01-15',
    depth: 100,
    icon: Snowflake,
    tag: 'JAN 15 (100m)',
    desc: 'Winter convective mixing',
  },
];

export default function ControlsBar({
  depth,
  setDepth,
  currentDate,
  setCurrentDate,
  availableDates = [],
  isPlaying,
  setIsPlaying,
}) {
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // 1x, 2x, 5x
  const animationRef = useRef(null);

  // Date index helper
  const dateIndex = Math.max(0, availableDates.indexOf(currentDate));
  const totalDays = availableDates.length || 365;

  // Animation playback loop
  useEffect(() => {
    if (!isPlaying) {
      if (animationRef.current) clearInterval(animationRef.current);
      return;
    }

    const intervalMs = Math.max(80, Math.floor(600 / playbackSpeed));
    animationRef.current = setInterval(() => {
      setCurrentDate((prevDate) => {
        const idx = availableDates.indexOf(prevDate);
        if (idx === -1 || idx >= availableDates.length - 1) {
          return availableDates[0] || '2022-01-01';
        }
        return availableDates[idx + 1];
      });
    }, intervalMs);

    return () => {
      if (animationRef.current) clearInterval(animationRef.current);
    };
  }, [isPlaying, playbackSpeed, availableDates, setCurrentDate]);

  const handleSliderChange = (e) => {
    const idx = parseInt(e.target.value, 10);
    if (availableDates[idx]) {
      setCurrentDate(availableDates[idx]);
    }
  };

  const isThermocline = depth >= 75 && depth <= 125;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
      {/* Top Controls Grid: Depth Selector & Monsoon Presets */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '16px',
      }}>
        {/* Depth Selector Card */}
        <div className="glass-panel" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={16} />
              <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Depth Selection
              </span>
            </div>
            {isThermocline && (
              <span className="tag-badge white" style={{ fontSize: '10px', padding: '2px 6px' }}>
                <Flame size={11} /> Thermocline Level
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {DEPTHS.map((d) => {
              const active = d === depth;
              const isThermo = d >= 75 && d <= 125;
              return (
                <button
                  key={d}
                  onClick={() => setDepth(d)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '12px',
                    fontWeight: active ? 700 : 500,
                    fontFamily: 'var(--font-mono)',
                    background: active ? '#ffffff' : 'var(--bg-secondary)',
                    color: active ? '#000000' : isThermo ? 'var(--text-pure)' : 'var(--text-secondary)',
                    border: active
                      ? '1px solid #ffffff'
                      : isThermo
                      ? '1px dashed var(--border-medium)'
                      : '1px solid var(--border-default)',
                    boxShadow: active ? '0 0 10px rgba(255, 255, 255, 0.4)' : 'none',
                  }}
                >
                  {d}m
                </button>
              );
            })}
          </div>

          {/* Thermocline Explanation Note */}
          {isThermocline && (
            <p style={{
              fontSize: '11px',
              color: 'var(--text-secondary)',
              marginTop: '10px',
              borderTop: '1px solid var(--border-subtle)',
              paddingTop: '8px',
              lineHeight: 1.4,
            }}>
              <strong>Oceanographic Note:</strong> 75–125m is the <em>core thermocline</em> where vertical temperature gradient is steepest. Small vertical shifts in thermocline depth produce the largest temperature variances.
            </p>
          )}
        </div>

        {/* Quick Jump Monsoon Presets */}
        <div className="glass-panel" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Sparkles size={16} />
            <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Seasonal Ocean Presets (2022)
            </span>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '8px',
          }}>
            {PRESETS.map((p) => {
              const Icon = p.icon;
              const isSelected = currentDate === p.date && depth === p.depth;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setCurrentDate(p.date);
                    setDepth(p.depth);
                  }}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    background: isSelected ? '#ffffff' : 'var(--bg-secondary)',
                    color: isSelected ? '#000000' : 'var(--text-primary)',
                    border: isSelected ? '1px solid #ffffff' : '1px solid var(--border-default)',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    boxShadow: isSelected ? '0 0 12px rgba(255, 255, 255, 0.3)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Icon size={14} />
                    <span className="mono" style={{ fontSize: '9px', opacity: 0.75 }}>
                      {p.tag}
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 700, lineHeight: 1.2 }}>
                    {p.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 365-Day Timeline Scrubber Bar */}
      <div className="glass-panel" style={{ padding: '16px 20px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '10px',
          flexWrap: 'wrap',
          gap: '12px',
        }}>
          {/* Date and Day number */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Calendar size={16} />
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-pure)' }}>
              {new Date(currentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <span className="mono tag-badge" style={{ fontSize: '11px' }}>
              Day {dateIndex + 1} / {totalDays}
            </span>
          </div>

          {/* Player controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => {
                const prev = Math.max(0, dateIndex - 1);
                if (availableDates[prev]) setCurrentDate(availableDates[prev]);
              }}
              className="glass-panel-subtle"
              style={{ padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}
              title="Previous Day"
            >
              <SkipBack size={14} />
            </button>

            <button
              onClick={() => setIsPlaying(!isPlaying)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: '#ffffff',
                color: '#000000',
                padding: '6px 14px',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 700,
                fontSize: '12px',
                boxShadow: '0 0 10px rgba(255, 255, 255, 0.4)',
              }}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              {isPlaying ? 'PAUSE' : 'PLAY 365 DAYS'}
            </button>

            <button
              onClick={() => {
                const next = Math.min(totalDays - 1, dateIndex + 1);
                if (availableDates[next]) setCurrentDate(availableDates[next]);
              }}
              className="glass-panel-subtle"
              style={{ padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}
              title="Next Day"
            >
              <SkipForward size={14} />
            </button>

            {/* Speed toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '6px' }}>
              {[1, 2, 5].map((spd) => (
                <button
                  key={spd}
                  onClick={() => setPlaybackSpeed(spd)}
                  className="mono"
                  style={{
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: playbackSpeed === spd ? 'var(--border-bright)' : 'var(--bg-secondary)',
                    color: playbackSpeed === spd ? '#ffffff' : 'var(--text-muted)',
                    border: '1px solid var(--border-default)',
                  }}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Timeline Range Slider */}
        <input
          type="range"
          min={0}
          max={totalDays - 1}
          value={dateIndex}
          onChange={handleSliderChange}
          style={{ width: '100%', cursor: 'pointer' }}
        />

        {/* Month Markers */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '6px',
          fontSize: '10px',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
        }}>
          <span>JAN</span>
          <span>MAR</span>
          <span>MAY</span>
          <span>JUL</span>
          <span>SEP</span>
          <span>NOV</span>
          <span>DEC</span>
        </div>
      </div>
    </div>
  );
}
