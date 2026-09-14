import React from 'react';
import { Waves, Activity, Layers, Database, Sparkles, ExternalLink, RefreshCw } from 'lucide-react';
import { COLORMAPS } from '../utils/colormaps';

export default function Header({
  activeColormap,
  setActiveColormap,
  isLive,
  serverInfo,
  onRefresh,
  onOpenLatentModal,
  onOpenArgoModal,
  argoCount = 625,
}) {
  return (
    <header style={{
      borderBottom: '1px solid var(--border-default)',
      background: 'rgba(7, 7, 9, 0.92)',
      backdropFilter: 'blur(12px)',
      position: 'sticky',
      top: 0,
      zIndex: 40,
      padding: '14px 28px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '20px',
      flexWrap: 'wrap',
    }}>
      {/* Brand & Project Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: '8px',
          background: '#ffffff',
          color: '#000000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 16px rgba(255, 255, 255, 0.25)',
        }}>
          <Waves size={22} strokeWidth={2.4} />
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{
              fontSize: '18px',
              fontWeight: 800,
              letterSpacing: '0.08em',
              color: 'var(--text-pure)',
              textTransform: 'uppercase',
            }}>
              OCEANEMBED
            </h1>
            <span className="tag-badge white" style={{ fontSize: '10px', padding: '2px 6px' }}>
              3D AI Latent Engine
            </span>
          </div>
          <p style={{
            fontSize: '12px',
            color: 'var(--text-secondary)',
            marginTop: '2px',
            letterSpacing: '0.01em',
          }}>
            Satellite-to-Subsurface Ocean Temperature Reconstruction · North Indian Ocean (0–1000m)
          </p>
        </div>
      </div>

      {/* Navigation & Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        {/* Status Indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-default)',
          padding: '6px 12px',
          borderRadius: 'var(--radius-sm)',
          fontSize: '12px',
          color: 'var(--text-secondary)',
        }}>
          <span style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: isLive ? '#ffffff' : '#71717a',
            boxShadow: isLive ? '0 0 8px #ffffff' : 'none',
            display: 'inline-block',
          }} />
          <span className="mono" style={{ color: 'var(--text-pure)', fontWeight: 600 }}>
            {isLive ? '2022 NETCDF ENGINE' : 'CONNECTING...'}
          </span>
        </div>

        {/* Colormap Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Palette:
          </span>
          <select
            value={activeColormap}
            onChange={(e) => setActiveColormap(e.target.value)}
            style={{
              background: 'var(--bg-card)',
              color: 'var(--text-pure)',
              border: '1px solid var(--border-medium)',
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {Object.entries(COLORMAPS).map(([key, item]) => (
              <option key={key} value={key} style={{ background: '#111114', color: '#ffffff' }}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        {/* Latent Modal Button */}
        <button
          onClick={onOpenLatentModal}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
            padding: '6px 12px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '12px',
            fontWeight: 500,
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-white)'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
        >
          <Sparkles size={14} />
          Latent Space (64-D)
        </button>

        {/* ARGO Float Validation Button */}
        <button
          onClick={onOpenArgoModal}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
            padding: '6px 12px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '12px',
            fontWeight: 500,
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-white)'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
        >
          <Activity size={14} />
          ARGO Floats ({argoCount})
        </button>
      </div>
    </header>
  );
}
