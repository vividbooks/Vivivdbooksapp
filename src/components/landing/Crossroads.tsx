import { useNavigate } from 'react-router-dom';
import { Compass, Ruler, Box, Shapes, BookOpen, ArrowRight } from 'lucide-react';

const cardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  borderRadius: '32px',
  overflow: 'hidden',
  border: '2px solid #e5e7eb',
  background: 'white',
  boxShadow: '0 1px 4px 0 rgba(0,0,0,0.06)',
  textAlign: 'left',
  color: 'inherit',
  transition: 'all 250ms',
  cursor: 'pointer',
  width: '100%',
  maxWidth: '480px',
  minWidth: '0',
  flex: '1 1 320px',
  margin: '12px',
  WebkitMaskImage: '-webkit-radial-gradient(white, black)',
};

export function Crossroads() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        fontFamily: "'Fenomen Sans', sans-serif",
      }}
    >
      {/* Title */}
      <h1
        style={{
          color: '#09056f',
          fontSize: '52px',
          fontWeight: 600,
          marginBottom: '12px',
          textAlign: 'center',
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
        }}
      >
        Geometrie online
      </h1>
      <p
        style={{
          color: '#4e5871',
          fontSize: '17px',
          lineHeight: '26px',
          fontWeight: 400,
          marginBottom: '48px',
          textAlign: 'center',
          maxWidth: '520px',
        }}
      >
        Interaktivní výuka geometrie pro 2.–8. třídu. Vyber si aplikaci.
      </p>

      {/* Two cards */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          width: '100%',
          maxWidth: '1044px',
        }}
      >
        {/* Card 1: Rýsování a konstrukce */}
        <div
          style={cardStyle}
          onClick={() => navigate('/rysovani-app')}
          onTouchEnd={(e) => { e.preventDefault(); navigate('/rysovani-app'); }}
          role="button"
          tabIndex={0}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.02)';
            e.currentTarget.style.boxShadow = '0 16px 32px -8px rgba(77,73,243,0.18), 0 6px 12px -4px rgba(77,73,243,0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 1px 4px 0 rgba(0,0,0,0.06)';
          }}
          onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; }}
          onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; }}
        >
          {/* Illustration */}
          <div
            style={{
              height: 180,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#dcf3ff',
              gap: '20px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <Compass
              size={56}
              strokeWidth={1.2}
              style={{ color: '#4d49f3', opacity: 0.4, transform: 'rotate(-12deg)' }}
            />
            <Ruler
              size={52}
              strokeWidth={1.2}
              style={{ color: '#4d49f3', opacity: 0.3, transform: 'rotate(8deg)' }}
            />
            <Shapes
              size={48}
              strokeWidth={1.2}
              style={{ color: '#4d49f3', opacity: 0.25, transform: 'rotate(-5deg)' }}
            />
          </div>

          {/* Content */}
          <div style={{ padding: '28px 32px 32px' }}>
            <div
              style={{
                color: '#09056f',
                fontSize: '26px',
                fontWeight: 600,
                marginBottom: '10px',
              }}
            >
              Rýsování a konstrukce
            </div>
            <p
              style={{
                color: '#4e5871',
                opacity: 0.75,
                fontSize: '15px',
                lineHeight: '24px',
                fontWeight: 400,
                marginBottom: '20px',
              }}
            >
              Volné rýsování na tabuli nebo počítači. Přednastavené konstrukce trojúhelníků, osy úsečky a osové souměrnosti.
            </p>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#4d49f3',
                fontSize: '15px',
                fontWeight: 500,
              }}
            >
              Otevřít
              <ArrowRight size={16} />
            </div>
          </div>
        </div>

        {/* Card 2: Tělesa, rovinné útvary a cvičení */}
        <div
          style={cardStyle}
          onClick={() => navigate('/telesa-app')}
          onTouchEnd={(e) => { e.preventDefault(); navigate('/telesa-app'); }}
          role="button"
          tabIndex={0}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.02)';
            e.currentTarget.style.boxShadow = '0 16px 32px -8px rgba(77,73,243,0.18), 0 6px 12px -4px rgba(77,73,243,0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 1px 4px 0 rgba(0,0,0,0.06)';
          }}
          onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; }}
          onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; }}
        >
          {/* Illustration */}
          <div
            style={{
              height: 180,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#fefce8',
              gap: '20px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <Box
              size={56}
              strokeWidth={1.2}
              style={{ color: '#4d49f3', opacity: 0.4, transform: 'rotate(-8deg)' }}
            />
            <Shapes
              size={48}
              strokeWidth={1.2}
              style={{ color: '#4d49f3', opacity: 0.3, transform: 'rotate(5deg)' }}
            />
            <BookOpen
              size={44}
              strokeWidth={1.2}
              style={{ color: '#4d49f3', opacity: 0.25, transform: 'rotate(3deg)' }}
            />
          </div>

          {/* Content */}
          <div style={{ padding: '28px 32px 32px' }}>
            <div
              style={{
                color: '#09056f',
                fontSize: '26px',
                fontWeight: 600,
                marginBottom: '10px',
              }}
            >
              Tělesa, útvary a cvičení
            </div>
            <p
              style={{
                color: '#4e5871',
                opacity: 0.75,
                fontSize: '15px',
                lineHeight: '24px',
                fontWeight: 400,
                marginBottom: '20px',
              }}
            >
              3D tělesa, rovinné útvary, interaktivní návody a procvičování výpočtů objemu, povrchu, obvodu a obsahu.
            </p>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#4d49f3',
                fontSize: '15px',
                fontWeight: 500,
              }}
            >
              Otevřít
              <ArrowRight size={16} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
