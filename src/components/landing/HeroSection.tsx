import React, { useState, useEffect } from 'react';
import { Box, Pyramid, Cylinder as CylinderIcon, Circle, Hexagon } from 'lucide-react';

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' ? window.innerWidth >= 1024 : false);
  useEffect(() => {
    const h = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return isDesktop;
}

export function HeroSection() {
  const isDesktop = useIsDesktop();

  return (
    <div
      style={{
        margin: '16px',
        borderRadius: '32px',
        backgroundColor: '#fefce8',
        boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: isDesktop ? 'row' : 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isDesktop ? '40px 56px' : '40px 32px',
          gap: '32px',
        }}
      >
        {/* Text */}
        <div style={{ flex: 1, maxWidth: '512px' }}>
          <h1
            style={{
              color: '#09056f',
              fontFamily: "'Fenomen Sans', sans-serif",
              fontSize: isDesktop ? '64px' : '48px',
              lineHeight: 1.1,
              fontWeight: 600,
              marginBottom: '24px',
              letterSpacing: '-0.02em',
            }}
          >
            Geometrie online
          </h1>
          <p
            style={{
              fontFamily: "'Fenomen Sans', sans-serif",
              color: '#09056f',
              fontSize: '17px',
              lineHeight: '26px',
              fontWeight: 400,
              marginBottom: '16px',
              maxWidth: '448px',
            }}
          >
            Interaktivní výuka geometrie pro 2.–8. třídu podle RVP ZV.
            Rýsujte kružítkem na obrazovce, otáčejte 3D tělesy,
            rozbalujte je do sítě a procvičujte výpočty — vše v jedné aplikaci.
          </p>
        </div>

        {/* Illustration (desktop only) */}
        {isDesktop && (
          <div style={{ position: 'relative', width: 300, height: 200, flexShrink: 0 }}>
            <Box
              size={72}
              strokeWidth={1.2}
              style={{ position: 'absolute', top: 8, left: 32, opacity: 0.35, color: '#4d49f3', transform: 'rotate(-8deg)' }}
            />
            <Pyramid
              size={56}
              strokeWidth={1.2}
              style={{ position: 'absolute', top: 30, right: 30, opacity: 0.3, color: '#4d49f3', transform: 'rotate(5deg)' }}
            />
            <CylinderIcon
              size={48}
              strokeWidth={1.2}
              style={{ position: 'absolute', bottom: 10, left: 100, opacity: 0.25, color: '#4d49f3', transform: 'rotate(3deg)' }}
            />
            <Circle
              size={44}
              strokeWidth={1.2}
              style={{ position: 'absolute', bottom: 30, right: 70, opacity: 0.2, color: '#4d49f3' }}
            />
            <Hexagon
              size={50}
              strokeWidth={1.2}
              style={{ position: 'absolute', top: 10, right: 120, opacity: 0.2, color: '#4d49f3', transform: 'rotate(15deg)' }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
