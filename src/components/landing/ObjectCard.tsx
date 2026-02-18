import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { ObjectDef } from '../../data/objects';
import { Tile3DPreview } from './Tile3DPreview';
import { Tile2DPreview } from './Tile2DPreview';

interface Props {
  object: ObjectDef;
}

export function ObjectCard({ object }: Props) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(object.path)}
      onTouchEnd={(e) => { e.preventDefault(); navigate(object.path); }}
      role="button"
      tabIndex={0}
      className="flex flex-col text-left w-full"
      style={{
        borderRadius: '24px',
        border: '1px solid #e5e7eb',
        background: 'white',
        boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
        overflow: 'hidden',
        transition: 'all 200ms',
        cursor: 'pointer',
        WebkitMaskImage: '-webkit-radial-gradient(white, black)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.02)';
        e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)';
        const arrow = e.currentTarget.querySelector('.arrow-icon') as HTMLElement;
        if (arrow) { arrow.style.opacity = '1'; arrow.style.transform = 'translateX(4px)'; }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0,0,0,0.05)';
        const arrow = e.currentTarget.querySelector('.arrow-icon') as HTMLElement;
        if (arrow) { arrow.style.opacity = '0'; arrow.style.transform = 'translateX(0)'; }
      }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; }}
    >
      {/* Náhled – 3D rotující nebo 2D statický */}
      {object.is2D ? (
        <Tile2DPreview object={object} height={140} backgroundColor={object.color} />
      ) : (
        <Tile3DPreview object={object} height={140} backgroundColor={object.color} />
      )}

      {/* Dolní část – stejná barva jako horní */}
      <div className="flex flex-col flex-1" style={{ padding: '20px', backgroundColor: object.color }}>
        <h3 style={{ fontSize: '18px', fontWeight: 400, color: '#4e5871', marginBottom: '6px' }}>
          {object.name}
        </h3>
        <p style={{ fontSize: '13px', fontWeight: 400, color: '#4e5871', opacity: 0.7, lineHeight: '20px', marginBottom: '16px' }}>
          {object.description}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-end" style={{ marginTop: 'auto' }}>
          <ArrowRight
            className="arrow-icon"
            size={16}
            style={{
              color: '#4d49f3',
              opacity: 0.5,
              transition: 'all 200ms',
            }}
          />
        </div>
      </div>
    </div>
  );
}
