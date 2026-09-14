/**
 * Colormap utilities for high-performance ocean thermal visualization.
 * Returns [r, g, b, alpha] where alpha is 0 for land/masked cells.
 */

// 1. Sleek Classic Monochrome (Deep Black to Platinum to Luminous White)
export function getMonochromeColor(val, min, max, opacity = 210) {
  if (val === null || val === undefined || isNaN(val)) {
    return [0, 0, 0, 0]; // Transparent for land so base map shows through!
  }
  const norm = Math.max(0, Math.min(1, (val - min) / (max - min || 1)));
  const v = Math.pow(norm, 0.95);
  const brightness = Math.round(v * 255);
  return [brightness, brightness, brightness, opacity];
}

// 2. Thermal Indigo-Coral-White (Classic High-Tech with warm highlights)
export function getThermalColor(val, min, max, opacity = 215) {
  if (val === null || val === undefined || isNaN(val)) {
    return [0, 0, 0, 0];
  }
  const norm = Math.max(0, Math.min(1, (val - min) / (max - min || 1)));
  
  let r, g, b;
  if (norm < 0.25) {
    const t = norm / 0.25;
    r = Math.round(15 + t * 45);
    g = Math.round(15 + t * 50);
    b = Math.round(30 + t * 90);
  } else if (norm < 0.6) {
    const t = (norm - 0.25) / 0.35;
    r = Math.round(60 + t * 140);
    g = Math.round(65 + t * 95);
    b = Math.round(120 + t * 40);
  } else if (norm < 0.85) {
    const t = (norm - 0.6) / 0.25;
    r = Math.round(200 + t * 45);
    g = Math.round(160 + t * 75);
    b = Math.round(160 + t * 75);
  } else {
    const t = (norm - 0.85) / 0.15;
    r = Math.round(245 + t * 10);
    g = Math.round(235 + t * 20);
    b = Math.round(235 + t * 20);
  }
  return [r, g, b, opacity];
}

export function getTurboColor(val, min, max, opacity = 220) {
  if (val === null || val === undefined || isNaN(val)) {
    return [0, 0, 0, 0];
  }
  const x = Math.max(0, Math.min(1, (val - min) / (max - min || 1)));
  const r = Math.round(255 * (0.1357 + x * (4.5974 - x * (42.3277 - x * (130.5887 - x * (150.5667 - x * 58.1375))))));
  const g = Math.round(255 * (0.0914 + x * (2.1856 + x * (4.8052 - x * (14.0195 + x * (4.2109 + x * 2.7747))))));
  const b = Math.round(255 * (0.1067 + x * (12.5832 - x * (27.2854 - x * (30.0736 - x * (85.2582 - x * 47.7448))))));
  return [
    Math.max(0, Math.min(255, r)),
    Math.max(0, Math.min(255, g)),
    Math.max(0, Math.min(255, b)),
    opacity
  ];
}

// 4. Ice Oceanic (Cyan to White)
export function getOceanicColor(val, min, max, opacity = 215) {
  if (val === null || val === undefined || isNaN(val)) {
    return [0, 0, 0, 0];
  }
  const norm = Math.max(0, Math.min(1, (val - min) / (max - min || 1)));
  const r = Math.round(Math.pow(norm, 1.4) * 255);
  const g = Math.round((0.2 + 0.8 * norm) * 255);
  const b = Math.round((0.4 + 0.6 * Math.pow(norm, 0.6)) * 255);
  return [r, g, b, opacity];
}

export const COLORMAPS = {
  monochrome: {
    name: 'Classic Monochrome',
    fn: getMonochromeColor,
    gradientCss: 'linear-gradient(to right, #000000, #555555, #aaaaaa, #ffffff)',
  },
  thermal: {
    name: 'Thermal Indigo-White',
    fn: getThermalColor,
    gradientCss: 'linear-gradient(to right, #101020, #404580, #c8a0a0, #ffffff)',
  },
  turbo: {
    name: 'Turbo Spectral',
    fn: getTurboColor,
    gradientCss: 'linear-gradient(to right, #30123b, #1ae4b6, #a2fc3c, #e83610, #7a0403)',
  },
  oceanic: {
    name: 'Abyssal Cyan',
    fn: getOceanicColor,
    gradientCss: 'linear-gradient(to right, #05101a, #0088aa, #55d0ee, #ffffff)',
  }
};
