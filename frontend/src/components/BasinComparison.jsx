import React from 'react';
import { Columns, ArrowRight, ShieldCheck, Waves, Thermometer, Flame, ArrowUpDown } from 'lucide-react';

export default function BasinComparison({ metrics, mapStats, date, depth = 100 }) {
  const basinData = metrics?.per_basin || {
    "Arabian Sea": { rmse: 0.4315, corr: 0.8977, skill: 0.5651, n: 96686925 },
    "Bay of Bengal": { rmse: 0.3196, corr: 0.9464, skill: 0.6774, n: 44942235 },
  };

  const arb = basinData["Arabian Sea"];
  const bob = basinData["Bay of Bengal"];

  // Dynamic live basin stats from map slice
  const arbMean = mapStats?.arb_mean_c ?? null;
  const bobMean = mapStats?.bob_mean_c ?? null;
  const arbMin = mapStats?.arb_min_c ?? null;
  const arbMax = mapStats?.arb_max_c ?? null;
  const bobMin = mapStats?.bob_min_c ?? null;
  const bobMax = mapStats?.bob_max_c ?? null;
  const basinDiff = mapStats?.basin_diff_c ?? (arbMean !== null && bobMean !== null ? roundVal(arbMean - bobMean, 2) : null);

  function roundVal(v, dec = 2) {
    return Number(v.toFixed(dec));
  }

  // Derive oceanographic regime from date and temperature delta
  const getRegimeTag = () => {
    if (basinDiff === null) return 'MONSOON BASIN SPLIT';
    if (basinDiff < -0.3) return 'ARABIAN SEA UPWELLING COOLING';
    if (basinDiff > 0.3) return 'BOB RIVER RUNOFF STRATIFICATION';
    return 'INTER-BASIN THERMAL EQUILIBRIUM';
  };

  return (
    <div className="glass-panel" style={{ padding: '20px', marginTop: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Columns size={16} />
          <h3 style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Regional Basin Ocean Dynamics (78°E Split)
          </h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {date && (
            <span className="tag-badge" style={{ fontSize: '10px' }}>
              {date} · {depth}m
            </span>
          )}
          <span className="tag-badge white" style={{ fontSize: '9px' }}>
            {getRegimeTag()}
          </span>
        </div>
      </div>

      {/* Cross-Basin Live Thermal Differential Banner */}
      {arbMean !== null && bobMean !== null && (
        <div style={{
          background: 'linear-gradient(90deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02))',
          border: '1px solid var(--border-medium)',
          borderRadius: 'var(--radius-sm)',
          padding: '10px 14px',
          marginBottom: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Thermometer size={15} style={{ color: '#ffffff' }} />
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              Thermal Contrast across 78°E ({depth}m):
            </span>
            <span className="mono" style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-pure)' }}>
              {basinDiff > 0 ? `+${basinDiff.toFixed(2)}` : basinDiff.toFixed(2)}°C
            </span>
          </div>

          <div className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Arabian Sea: <strong style={{ color: '#ffffff' }}>{arbMean.toFixed(1)}°C</strong> vs Bay of Bengal: <strong style={{ color: '#ffffff' }}>{bobMean.toFixed(1)}°C</strong>
          </div>
        </div>
      )}

      {/* Basin Comparison Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '12px',
      }}>
        {/* Arabian Sea */}
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-sm)',
          padding: '14px 16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-pure)' }}>
              ARABIAN SEA (West &lt; 78°E)
            </span>
            <span className="tag-badge" style={{ fontSize: '9px' }}>
              UPWELLING DRIVEN
            </span>
          </div>

          {/* Live temperature row for active date & depth */}
          {arbMean !== null && (
            <div style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              marginBottom: '10px',
              padding: '6px 8px',
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: '4px',
              border: '1px solid var(--border-subtle)',
            }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Temp @ {depth}m:
              </span>
              <span className="mono" style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
                {arbMean.toFixed(2)}°C {arbMin !== null && arbMax !== null ? `(${arbMin.toFixed(1)}–${arbMax.toFixed(1)}°C)` : ''}
              </span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '10px' }}>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>RMSE (NORM)</div>
              <div className="mono" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-pure)' }}>
                {arb.rmse ? arb.rmse.toFixed(3) : '0.431'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>CORRELATION</div>
              <div className="mono" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-pure)' }}>
                {arb.corr ? arb.corr.toFixed(3) : '0.898'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>SKILL GAIN</div>
              <div className="mono" style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
                {arb.skill ? `+${(arb.skill * 100).toFixed(1)}%` : '+56.5%'}
              </div>
            </div>
          </div>

          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            Dominated by Findlater Jet wind-stress curl, intense seasonal coastal upwelling off Somalia and Oman, and high surface evaporation.
          </p>
        </div>

        {/* Bay of Bengal */}
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-sm)',
          padding: '14px 16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-pure)' }}>
              BAY OF BENGAL (East ≥ 78°E)
            </span>
            <span className="tag-badge white" style={{ fontSize: '9px' }}>
              FRESHWATER STRATIFIED
            </span>
          </div>

          {/* Live temperature row for active date & depth */}
          {bobMean !== null && (
            <div style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              marginBottom: '10px',
              padding: '6px 8px',
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: '4px',
              border: '1px solid var(--border-subtle)',
            }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Temp @ {depth}m:
              </span>
              <span className="mono" style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
                {bobMean.toFixed(2)}°C {bobMin !== null && bobMax !== null ? `(${bobMin.toFixed(1)}–${bobMax.toFixed(1)}°C)` : ''}
              </span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '10px' }}>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>RMSE (NORM)</div>
              <div className="mono" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-pure)' }}>
                {bob.rmse ? bob.rmse.toFixed(3) : '0.320'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>CORRELATION</div>
              <div className="mono" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-pure)' }}>
                {bob.corr ? bob.corr.toFixed(3) : '0.946'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>SKILL GAIN</div>
              <div className="mono" style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
                {bob.skill ? `+${(bob.skill * 100).toFixed(1)}%` : '+67.7%'}
              </div>
            </div>
          </div>

          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            Dominated by immense monsoon river runoff (Ganges-Brahmaputra), creating low-salinity barrier layers that strongly trap upper-ocean heat.
          </p>
        </div>
      </div>
    </div>
  );
}

