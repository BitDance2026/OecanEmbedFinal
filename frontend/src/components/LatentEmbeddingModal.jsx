import React from 'react';
import { X, Sparkles, Cpu, CheckCircle2, ShieldAlert } from 'lucide-react';

export default function LatentEmbeddingModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '24px',
    }}
    onClick={onClose}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '860px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '28px',
          position: 'relative',
          background: '#0e0e12',
          border: '1px solid var(--border-bright)',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.9)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
            padding: '6px',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
          }}
        >
          <X size={18} />
        </button>

        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <Sparkles size={22} />
          <h2 style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Satellite Latent Embedding Space (64-D)
          </h2>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Physical validation of the 112× compressed latent representation learned by OceanEmbed Compact.
        </p>

        {/* Scientific Highlights Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}>
          <div style={{ background: 'var(--bg-card)', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>COMPRESSION RATIO</div>
            <div className="mono" style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-pure)', margin: '4px 0' }}>112× COMPACT</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>7×32×32 (7,168 inputs) → 64 latent numbers</div>
          </div>

          <div style={{ background: 'var(--bg-card)', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>MONSOON STATE ACCURACY</div>
            <div className="mono" style={{ fontSize: '20px', fontWeight: 800, color: '#ffffff', margin: '4px 0' }}>66.6% vs 33.8%</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Embedding identifies season 2× better than lat/lon alone</div>
          </div>

          <div style={{ background: 'var(--bg-card)', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>SPATIAL VS COMPACT LOSS</div>
            <div className="mono" style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-pure)', margin: '4px 0' }}>&lt; 0.3% GAP</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Zero predictive information lost during compression</div>
          </div>
        </div>

        {/* Embedding Image Visual */}
        <div style={{
          background: '#000000',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-default)',
          overflow: 'hidden',
          marginBottom: '20px',
          textAlign: 'center',
        }}>
          <img
            src="/embedding-image"
            alt="OceanEmbed Compact 64-dim Latent Space Analysis"
            style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '420px', objectFit: 'contain' }}
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
        </div>

        {/* Core Takeaway */}
        <div style={{
          background: 'var(--bg-secondary)',
          padding: '14px 18px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-default)',
          fontSize: '12px',
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
        }}>
          <strong style={{ color: 'var(--text-pure)' }}>Physical Significance:</strong> The embedding does not merely memorize geographical location; it clusters according to monsoon dynamics (SW Monsoon, NE Monsoon, and Inter-monsoon transitions) and tracks sea surface temperature gradients without losing deep subsurface reconstruction power.
        </div>
      </div>
    </div>
  );
}
