import React from 'react';
import { TrendingUp, Award, Compass, Gauge, Zap, Layers } from 'lucide-react';

export default function StatCards({ stats }) {
  const cards = [
    {
      label: 'SKILL VS CLIMATOLOGY',
      value: '+59.7%',
      subtext: '60% better than naive baseline guessing',
      badge: 'PROVEN GAIN',
      icon: TrendingUp,
    },
    {
      label: 'REFERENCE MODEL CORRELATION',
      value: '0.914',
      subtext: 'vs GLORYS12V1 on held-out test year 2022',
      badge: 'HELD-OUT 2022',
      icon: Award,
    },
    {
      label: 'REAL IN-SITU ARGO MATCHUP',
      value: '0.987',
      subtext: 'vs 623 physical oceanographic floats',
      badge: 'INDEPENDENT',
      icon: Compass,
    },
    {
      label: 'AVERAGE FLOAT ERROR',
      value: '1.18 °C',
      subtext: 'Full-column RMSE across 0–1000m depths',
      badge: 'PRECISION',
      icon: Gauge,
    },
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
      gap: '16px',
      margin: '20px 28px 0 28px',
    }}>
      {cards.map((card, idx) => {
        const IconComponent = card.icon;
        return (
          <div
            key={idx}
            className="glass-panel"
            style={{
              padding: '18px 20px',
              position: 'relative',
              overflow: 'hidden',
              transition: 'transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-bright)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-default)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            {/* Top row */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px',
            }}>
              <span style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--text-muted)',
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
              }}>
                {card.label}
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="tag-badge" style={{ fontSize: '9px', padding: '1px 5px' }}>
                  {card.badge}
                </span>
                <IconComponent size={14} style={{ color: 'var(--text-muted)' }} />
              </div>
            </div>

            {/* Big Value */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span className="mono" style={{
                fontSize: '28px',
                fontWeight: 800,
                color: 'var(--text-pure)',
                letterSpacing: '-0.02em',
              }}>
                {card.value}
              </span>
            </div>

            {/* Subtext */}
            <p style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
              marginTop: '6px',
              lineHeight: 1.4,
            }}>
              {card.subtext}
            </p>

            {/* Bottom Accent line */}
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '2px',
              background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent)',
            }} />
          </div>
        );
      })}
    </div>
  );
}
