import React, { useState, useEffect, useCallback, useRef } from 'react';
import Header from './components/Header';
import StatCards from './components/StatCards';
import OceanMap from './components/OceanMap';
import ControlsBar from './components/ControlsBar';
import DepthProfileCurve from './components/DepthProfileCurve';
import BasinComparison from './components/BasinComparison';
import LatentEmbeddingModal from './components/LatentEmbeddingModal';
import ArgoValidationPanel from './components/ArgoValidationPanel';

export default function App() {
  // State
  const [domainInfo, setDomainInfo] = useState(null);
  const [availableDates, setAvailableDates] = useState([]);
  const [currentDate, setCurrentDate] = useState('2022-06-15');
  const [depth, setDepth] = useState(100); // Default to thermocline core
  const [selectedLat, setSelectedLat] = useState(15.0);
  const [selectedLon, setSelectedLon] = useState(68.0); // Arabian Sea
  const [activeColormap, setActiveColormap] = useState('monochrome'); // Classic Black & White default
  const [isPlaying, setIsPlaying] = useState(false);
  const [showArgoFloats, setShowArgoFloats] = useState(false);

  // Modals
  const [isLatentModalOpen, setIsLatentModalOpen] = useState(false);
  const [isArgoModalOpen, setIsArgoModalOpen] = useState(false);

  // Data fetching states
  const [mapData, setMapData] = useState(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [profileData, setProfileData] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [statsData, setStatsData] = useState(null);
  const [argoSamples, setArgoSamples] = useState([]);
  const [isLive, setIsLive] = useState(false);

  // In-memory cache for map slices and profiles to ensure 60fps smooth scrubbing without race conditions
  const mapCache = useRef(new Map());
  const profileCache = useRef(new Map());
  const activeProfileReqId = useRef(0);
  const activeMapReqId = useRef(0);

  // 1. Initial Domain & Stats Fetch
  useEffect(() => {
    const initApp = async () => {
      try {
        const [domainRes, statsRes, argoRes] = await Promise.all([
          fetch('/domain').then((r) => r.json()),
          fetch('/stats').then((r) => r.json()),
          fetch('/argo-samples?limit=0').then((r) => r.json()),
        ]);

        if (domainRes && domainRes.available_dates) {
          setDomainInfo(domainRes);
          setAvailableDates(domainRes.available_dates);
          setIsLive(true);
        }
        if (statsRes) setStatsData(statsRes);
        if (argoRes && argoRes.samples) setArgoSamples(argoRes.samples);
      } catch (err) {
        console.error('Failed to initialize app data:', err);
        setIsLive(false);
      }
    };
    initApp();
  }, []);

  // Water droplet click splash effect
  useEffect(() => {
    const handlePointerDown = (e) => {
      const container = document.createElement('div');
      container.className = 'water-splash-container';
      container.style.left = `${e.clientX}px`;
      container.style.top = `${e.clientY}px`;

      // 1. Primary and secondary expanding water ripple rings
      const ring1 = document.createElement('div');
      ring1.className = 'water-splash-ring';
      container.appendChild(ring1);

      const ring2 = document.createElement('div');
      ring2.className = 'water-splash-ring ring-2';
      container.appendChild(ring2);

      // 2. Burst of miniature splashing droplets
      const numDroplets = 7;
      for (let i = 0; i < numDroplets; i++) {
        const droplet = document.createElement('div');
        droplet.className = 'water-splash-droplet';

        // Disperse droplets in radial directions with organic variation
        const angle = (i * (360 / numDroplets) + (Math.random() * 26 - 13)) * (Math.PI / 180);
        const distance = 14 + Math.random() * 20; // 14px to 34px scatter radius
        const tx = Math.cos(angle) * distance;
        const ty = Math.sin(angle) * distance;
        const size = 3 + Math.random() * 3.5; // 3px to 6.5px droplet size

        droplet.style.setProperty('--tx', `${tx}px`);
        droplet.style.setProperty('--ty', `${ty}px`);
        droplet.style.width = `${size}px`;
        droplet.style.height = `${size}px`;
        droplet.style.animationDuration = `${0.36 + Math.random() * 0.16}s`;

        container.appendChild(droplet);
      }

      document.body.appendChild(container);
      setTimeout(() => {
        container.remove();
      }, 550);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  // 2. Fetch Map Slice on date/depth change (with cache and request ID sequencing)
  const fetchMapSlice = useCallback(async (dDate, dDepth) => {
    const cacheKey = `${dDate}_${dDepth}`;
    if (mapCache.current.has(cacheKey)) {
      setMapData(mapCache.current.get(cacheKey));
      setMapLoading(false);
      return;
    }

    const reqId = ++activeMapReqId.current;
    try {
      setMapLoading(true);
      const res = await fetch(`/map?date=${dDate}&depth=${dDepth}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      mapCache.current.set(cacheKey, data);
      if (activeMapReqId.current === reqId) {
        setMapData(data);
      }
    } catch (err) {
      console.error('Error fetching map slice:', err);
    } finally {
      if (activeMapReqId.current === reqId) {
        setMapLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (currentDate) {
      fetchMapSlice(currentDate, depth);
    }
  }, [currentDate, depth, fetchMapSlice]);

  // 3. Fetch Subsurface Depth Profile for selected point & date (with cache and request ID sequencing)
  const fetchProfile = useCallback(async (lat, lon, date) => {
    if (lat === null || lon === null || !date) return;
    const cacheKey = `${lat}_${lon}_${date}`;
    if (profileCache.current.has(cacheKey)) {
      setProfileData(profileCache.current.get(cacheKey));
      setProfileLoading(false);
      return;
    }

    const reqId = ++activeProfileReqId.current;
    try {
      setProfileLoading(true);
      const res = await fetch(`/profile?lat=${lat}&lon=${lon}&date=${date}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      profileCache.current.set(cacheKey, data);
      if (activeProfileReqId.current === reqId) {
        setProfileData(data);
      }
    } catch (err) {
      console.error('Error fetching depth profile:', err);
    } finally {
      if (activeProfileReqId.current === reqId) {
        setProfileLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchProfile(selectedLat, selectedLon, currentDate);
  }, [selectedLat, selectedLon, currentDate, fetchProfile]);

  const handleSelectPoint = useCallback((lat, lon, optDate) => {
    setSelectedLat(lat);
    setSelectedLon(lon);
    if (optDate) {
      setCurrentDate(optDate);
    }
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-pure)', paddingBottom: '60px' }}>
      {/* Header */}
      <Header
        activeColormap={activeColormap}
        setActiveColormap={setActiveColormap}
        isLive={isLive}
        serverInfo={domainInfo}
        onRefresh={() => fetchMapSlice(currentDate, depth)}
        onOpenLatentModal={() => setIsLatentModalOpen(true)}
        onOpenArgoModal={() => setIsArgoModalOpen(true)}
        argoCount={argoSamples?.length || 625}
      />

      {/* Top Headline Stat Cards */}
      <StatCards stats={statsData} />

      {/* Main Workspace Layout */}
      <main style={{
        margin: '20px 28px 0 28px',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.75fr) minmax(320px, 1fr)',
        gap: '20px',
        alignItems: 'start',
      }}>
        {/* Left Column: Ocean Canvas Map & Interactive Controls */}
        <section style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <OceanMap
            mapData={mapData}
            loading={mapLoading}
            selectedLat={selectedLat}
            selectedLon={selectedLon}
            onSelectPoint={handleSelectPoint}
            activeColormap={activeColormap}
            argoSamples={argoSamples}
            showArgoFloats={showArgoFloats}
            setShowArgoFloats={setShowArgoFloats}
            depth={depth}
            date={currentDate}
          />

          <ControlsBar
            depth={depth}
            setDepth={setDepth}
            currentDate={currentDate}
            setCurrentDate={setCurrentDate}
            availableDates={availableDates}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
          />
        </section>

        {/* Right Column: Subsurface Profile & Basin Insights */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <DepthProfileCurve
            profileData={profileData}
            loading={profileLoading}
            selectedDepth={depth}
            onSelectDepth={setDepth}
            date={currentDate}
          />

          <BasinComparison
            metrics={statsData?.model_metrics}
            mapStats={mapData?.stats}
            date={currentDate}
            depth={depth}
          />
        </section>
      </main>

      {/* Latent Space Explainer Modal */}
      <LatentEmbeddingModal
        isOpen={isLatentModalOpen}
        onClose={() => setIsLatentModalOpen(false)}
      />

      {/* ARGO Float Validation Modal */}
      <ArgoValidationPanel
        isOpen={isArgoModalOpen}
        onClose={() => setIsArgoModalOpen(false)}
        argoData={statsData?.argo_validation}
        argoSamples={argoSamples}
      />
    </div>
  );
}
