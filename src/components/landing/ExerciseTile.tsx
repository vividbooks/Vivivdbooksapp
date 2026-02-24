import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { ObjectDef } from '../../data/objects';
import type { TaskType } from '../viewer/ObjectQuizPanel';
import { Tile3DPreview } from './Tile3DPreview';
import { Tile2DPreview } from './Tile2DPreview';

function getGenitive(name: string): string {
  const m: Record<string, string> = {
    Krychle: 'krychle',
    Kvádr: 'kvádru',
    Hranol: 'hranolu',
    Jehlan: 'jehlanu',
    Válec: 'válce',
    Kužel: 'kužele',
    Koule: 'koule',
    Čtverec: 'čtverce',
    Obdélník: 'obdélníku',
    Trojúhelník: 'trojúhelníku',
    Kruh: 'kruhu',
    Lichoběžník: 'lichoběžníku',
    Kosočtverec: 'kosočtverce',
    Kosodélník: 'kosodélníku',
  };
  return m[name] ?? name.toLowerCase();
}

interface Props {
  object: ObjectDef;
  taskType: TaskType;
}

export function ExerciseTile({ object, taskType }: Props) {
  const navigate = useNavigate();
  const genitive = getGenitive(object.name);
  const TASK_LABELS: Record<string, string> = {
    objem: `Počítání objemu ${genitive}`,
    povrch: `Počítání povrchu ${genitive}`,
    obvod: `Počítání obvodu ${genitive}`,
    obsah: `Počítání obsahu ${genitive}`,
  };
  const title = TASK_LABELS[taskType] ?? `Cvičení: ${genitive}`;

  const setupPath = `/cviceni/${object.id}/${taskType}`;

  return (
    <div
      onClick={() => navigate(setupPath)}
      onTouchEnd={(e) => { e.preventDefault(); navigate(setupPath); }}
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
        e.currentTarget.style.boxShadow =
          '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)';
        const arrow = e.currentTarget.querySelector('.arrow-icon') as HTMLElement;
        if (arrow) {
          arrow.style.opacity = '1';
          arrow.style.transform = 'translateX(4px)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0,0,0,0.05)';
        const arrow = e.currentTarget.querySelector('.arrow-icon') as HTMLElement;
        if (arrow) {
          arrow.style.opacity = '0';
          arrow.style.transform = 'translateX(0)';
        }
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = 'scale(0.98)';
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = 'scale(1.02)';
      }}
    >
      {/* Náhled – 3D nebo 2D */}
      {object.is2D ? (
        <Tile2DPreview object={object} height={140} backgroundColor={object.color} />
      ) : (
        <Tile3DPreview object={object} height={140} backgroundColor={object.color} />
      )}
      {/* Dolní část – stejná barva jako horní */}
      <div className="flex flex-col flex-1" style={{ padding: '16px 20px', backgroundColor: object.color }}>
        <span
          style={{
            display: 'inline-block',
            alignSelf: 'flex-start',
            padding: '6px 14px',
            borderRadius: '9999px',
            background: taskType === 'objem' || taskType === 'obvod' ? '#4d49f3' : '#0ea5e9',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 600,
            marginBottom: '10px',
          }}
        >
          {{ objem: 'Objem', povrch: 'Povrch', obvod: 'Obvod', obsah: 'Obsah' }[taskType]}
        </span>
        <div className="flex items-center justify-between">
          <h3 style={{ fontSize: '18px', fontWeight: 400, color: '#4e5871', margin: 0 }}>
            {object.name}
          </h3>
          <ArrowRight
            className="arrow-icon"
            size={16}
            style={{ color: '#4d49f3', opacity: 0, transition: 'all 200ms', flexShrink: 0 }}
          />
        </div>
      </div>
    </div>
  );
}
