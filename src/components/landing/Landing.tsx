import React, { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ObjectCard } from './ObjectCard';
import { ExerciseTile } from './ExerciseTile';
import { objects } from '../../data/objects';
import type { TaskType } from '../viewer/ObjectQuizPanel';
import {
  Compass,
  Triangle,
  Ruler,
  Shapes,
  FlipHorizontal,
  ArrowRight,
  Pencil,
  BookOpen,
  Square,
  Box,
} from 'lucide-react';

// SVG illustrations from rysovani design
import TabuleIllustration from '../../../rysovani/src/imports/Group23925';
import PocitacIllustration from '../../../rysovani/src/imports/Group23926';

const exercises = objects.flatMap((obj) => {
  const types: TaskType[] = obj.is2D ? ['obvod', 'obsah'] : ['objem', 'povrch'];
  return types.map((taskType) => ({ object: obj, taskType }));
});

type ViewFilter = 'rysovani' | 'konstrukce' | 'telesa' | 'rovinne' | 'cviceni';

const TAB_ORDER: ViewFilter[] = ['rysovani', 'konstrukce', 'telesa', 'rovinne', 'cviceni'];

const filterBtnStyle = (
  value: ViewFilter,
  active: ViewFilter,
) => ({
  fontFamily: "'Fenomen Sans', sans-serif",
  padding: '12px 28px',
  borderRadius: '9999px',
  fontSize: '16px',
  fontWeight: 600 as const,
  border: active === value ? '2px solid transparent' : '2px solid #4e5871',
  background: active === value ? '#4d49f3' : 'white',
  color: active === value ? 'white' : '#4e5871',
  boxShadow: active === value ? '0px 10px 15px 0px #e0e7ff, 0px 4px 6px 0px #e0e7ff' : 'none',
  transition: 'all 200ms',
  cursor: 'pointer' as const,
});

const HEADING_MAP: Record<ViewFilter, string> = {
  rysovani: 'Rýsování',
  konstrukce: 'Konstrukce',
  telesa: 'Tělesa',
  rovinne: 'Rovinné útvary',
  cviceni: 'Cvičení',
};

const bodies3D = objects.filter((o) => !o.is2D);
const flat2D = objects.filter((o) => o.is2D);

/* ── Cvičení filter helpers ── */

type TaskFilter = 'all' | TaskType;

const TASK_LABELS: Record<string, string> = {
  all: 'Vše',
  objem: 'Objem',
  povrch: 'Povrch',
  obvod: 'Obvod',
  obsah: 'Obsah',
};

const TASK_FILTERS: TaskFilter[] = ['all', 'objem', 'povrch', 'obvod', 'obsah'];

const subFilterStyle = (active: boolean): React.CSSProperties => ({
  fontFamily: "'Fenomen Sans', sans-serif",
  padding: '8px 18px',
  borderRadius: '9999px',
  fontSize: '14px',
  fontWeight: 500,
  border: active ? '2px solid transparent' : '1.5px solid #c5c8d4',
  background: active ? '#4d49f3' : 'white',
  color: active ? 'white' : '#4e5871',
  boxShadow: active ? '0 4px 10px 0 #e0e7ff' : 'none',
  transition: 'all 200ms',
  cursor: 'pointer',
  margin: '3px',
});

/* ── Rýsování – volné kreslení data ── */

interface DrawingItem {
  id: string;
  title: string;
  description: string;
  color: string;
  previewBg: string;
  view: string;
  Illustration: React.ComponentType;
  illustrationStyle?: React.CSSProperties;
  innerStyle?: React.CSSProperties;
}

const drawingItems: DrawingItem[] = [
  {
    id: 'free-board',
    title: 'Tabule',
    description: 'Interaktivní tabule pro výuku. Dotykové ovládání.',
    color: '#dcf3ff',
    previewBg: '#e3f4ff',
    view: 'free-editor-board',
    Illustration: TabuleIllustration,
    // Original SVG is 1055×1071, scale to 0.2, rotated
    illustrationStyle: { width: 274, height: 200, position: 'relative' as const },
    innerStyle: { width: 1055, height: 1071, position: 'absolute' as const, top: '50%', left: '50%', transform: 'translate(-50%, -50%) scale(0.2) rotate(-6deg)' },
  },
  {
    id: 'free-computer',
    title: 'Počítač',
    description: 'Klasické ovládání myší. Body, přímky, kružnice, úhly a další.',
    color: '#fff8b3',
    previewBg: '#fefce8',
    view: 'free-editor-computer',
    Illustration: PocitacIllustration,
    // Original SVG is 1236×852, scale to 0.22
    illustrationStyle: { width: 280, height: 190, position: 'relative' as const },
    innerStyle: { width: 1236, height: 852, position: 'absolute' as const, top: '50%', left: '50%', transform: 'translate(-50%, -50%) scale(0.22)' },
  },
];

/* ── Konstrukce data ── */

interface ConstructionItem {
  id: string;
  title: string;
  description: string;
  grade: string;
  icon: React.ElementType;
  color: string;
  view: string;
}

const constructionItems: ConstructionItem[] = [
  {
    id: 'bisector',
    title: 'Osa úsečky',
    description: 'Konstrukce osy úsečky pomocí kružnic',
    grade: '2. ročník',
    icon: Compass,
    color: '#dcf3ff',
    view: 'bisector',
  },
  {
    id: 'axial-symmetry',
    title: 'Osově souměrný obraz',
    description: 'Konstrukce obrazu trojúhelníku v osové souměrnosti',
    grade: '6. ročník',
    icon: FlipHorizontal,
    color: '#f5f8d0',
    view: 'axial-symmetry',
  },
  {
    id: 'triangle-sss',
    title: 'Trojúhelník SSS',
    description: 'Konstrukce trojúhelníku ze tří stran',
    grade: '7. ročník',
    icon: Triangle,
    color: '#fff8b3',
    view: 'triangle',
  },
  {
    id: 'custom-triangle',
    title: 'Vlastní trojúhelník',
    description: 'Narýsuj si trojúhelník s vlastními rozměry',
    grade: '7. ročník',
    icon: Ruler,
    color: '#fce8f4',
    view: 'interactive-triangle',
  },
  {
    id: 'angle-triangle',
    title: 'Trojúhelník z úhlů',
    description: 'Konstrukce trojúhelníku ze strany a dvou úhlů',
    grade: '7. ročník',
    icon: Shapes,
    color: '#e8f5e9',
    view: 'angle-triangle',
  },
];

/* ── Návody data ── */

interface TutorialItem {
  id: string;
  title: string;
  description: string;
  grade: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  route: string;
}

const tutorialItems: TutorialItem[] = [
  {
    id: 'ctverec2d-obvod',
    title: 'Obvod čtverce',
    description: 'Nauč se, co je obvod a jak ho spočítat ze strany čtverce.',
    grade: '3. ročník',
    icon: Square,
    color: '#4d49f3',
    bgColor: '#e0e7ff',
    route: '/tutorial/ctverec2d-obvod',
  },
  {
    id: 'ctverec2d-obsah',
    title: 'Obsah čtverce',
    description: 'Zjisti, kolik čtverečních centimetrů se vejde do čtverce.',
    grade: '4. ročník',
    icon: Square,
    color: '#e11d48',
    bgColor: '#ffe4e6',
    route: '/tutorial/ctverec2d-obsah',
  },
  {
    id: 'krychle-objem',
    title: 'Objem krychle',
    description: 'Vyplň krychli malými kostkami a odvoď vzorec pro objem.',
    grade: '5. ročník',
    icon: Box,
    color: '#059669',
    bgColor: '#d1fae5',
    route: '/tutorial/krychle-objem',
  },
];

/* ── Card components ── */

function TutorialCard({ item }: { item: TutorialItem }) {
  const navigate = useNavigate();
  const Icon = item.icon;
  return (
    <button
      onClick={() => navigate(item.route)}
      onTouchEnd={(e) => { e.preventDefault(); navigate(item.route); }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '24px',
        overflow: 'hidden',
        border: '1px solid #e5e7eb',
        background: 'white',
        boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
        textDecoration: 'none',
        textAlign: 'left' as const,
        color: 'inherit',
        transition: 'all 200ms',
        cursor: 'pointer',
        width: '100%',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.02)';
        e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0,0,0,0.05)';
      }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; }}
    >
      {/* Icon area */}
      <div
        style={{
          height: 140,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: item.bgColor,
        }}
      >
        <Icon size={48} strokeWidth={1.4} style={{ color: item.color, opacity: 0.8 }} />
      </div>

      {/* Content */}
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ color: '#4e5871', fontSize: '18px', fontWeight: 500, marginBottom: '6px' }}>
          {item.title}
        </div>
        <p style={{ color: '#4e5871', opacity: 0.7, fontSize: '13px', lineHeight: '20px', fontWeight: 400, marginBottom: '16px', flex: 1 }}>
          {item.description}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '9999px',
              background: '#f0f0ff',
              color: '#4d49f3',
              fontSize: '12px',
              fontWeight: 400,
            }}
          >
            <BookOpen size={12} />
            {item.grade}
          </span>
          <ArrowRight size={16} style={{ color: '#4d49f3', opacity: 0.5 }} />
        </div>
      </div>
    </button>
  );
}

function DrawingCard({ item }: { item: DrawingItem }) {
  const navigate = useNavigate();
  const { Illustration } = item;
  return (
    <div
      onClick={() => navigate(`/rysovani?view=${item.view}`)}
      onTouchEnd={(e) => { e.preventDefault(); navigate(`/rysovani?view=${item.view}`); }}
      role="button"
      tabIndex={0}
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '32px',
        overflow: 'hidden',
        border: '1px solid #e5e7eb',
        background: item.color,
        textDecoration: 'none',
        textAlign: 'left' as const,
        color: 'inherit',
        transition: 'all 200ms',
        cursor: 'pointer',
        width: '100%',
        WebkitMaskImage: '-webkit-radial-gradient(white, black)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.02)';
        e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = 'none';
      }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; }}
    >
      {/* Preview area with SVG illustration */}
      <div
        style={{
          height: 200,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          backgroundColor: item.previewBg,
          overflow: 'hidden',
        }}
      >
        <div style={item.illustrationStyle}>
          <div style={item.innerStyle}>
            <Illustration />
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '24px', paddingTop: '24px', paddingBottom: 0 }}>
        <div style={{ color: '#4e5871', fontSize: '20px', fontWeight: 400, marginBottom: '8px' }}>
          {item.title}
        </div>
        <p style={{ color: '#4e5871', opacity: 0.7, fontSize: '14px', lineHeight: '22px', fontWeight: 400 }}>
          {item.description}
        </p>
        <div style={{ marginTop: '16px', marginBottom: '24px' }}>
          <div
            style={{
              background: '#4d49f3',
              height: '44px',
              borderRadius: '14px',
              boxShadow: '0px 10px 15px 0px #e0e7ff, 0px 4px 6px 0px #e0e7ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'background 200ms',
            }}
          >
            <Pencil size={14} style={{ color: 'white' }} />
            <span style={{ color: 'white', fontSize: '15px', fontWeight: 400 }}>Otevřít</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConstructionCard({ item }: { item: ConstructionItem }) {
  const navigate = useNavigate();
  const Icon = item.icon;
  return (
    <div
      onClick={() => navigate(`/rysovani?view=${item.view}`)}
      onTouchEnd={(e) => { e.preventDefault(); navigate(`/rysovani?view=${item.view}`); }}
      role="button"
      tabIndex={0}
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '24px',
        overflow: 'hidden',
        border: '1px solid #e5e7eb',
        background: 'white',
        boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
        textDecoration: 'none',
        textAlign: 'left' as const,
        color: 'inherit',
        transition: 'all 200ms',
        cursor: 'pointer',
        width: '100%',
        WebkitMaskImage: '-webkit-radial-gradient(white, black)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.02)';
        e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0,0,0,0.05)';
      }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; }}
    >
      {/* Icon area */}
      <div
        style={{
          height: 140,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: item.color,
        }}
      >
        <Icon size={44} strokeWidth={1.4} style={{ color: '#4e5871', opacity: 0.6 }} />
      </div>

      {/* Content */}
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ color: '#4e5871', fontSize: '18px', fontWeight: 400, marginBottom: '6px' }}>
          {item.title}
        </div>
        <p style={{ color: '#4e5871', opacity: 0.7, fontSize: '13px', lineHeight: '20px', fontWeight: 400, marginBottom: '16px', flex: 1 }}>
          {item.description}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {item.grade ? (
            <span
              style={{
                display: 'inline-block',
                padding: '4px 10px',
                borderRadius: '9999px',
                background: '#f0f0ff',
                color: '#4d49f3',
                fontSize: '12px',
                fontWeight: 400,
              }}
            >
              {item.grade}
            </span>
          ) : <span />}
          <ArrowRight size={16} style={{ color: '#4d49f3', opacity: 0.5 }} />
        </div>
      </div>
    </div>
  );
}

/* ── Main Landing ── */

export type LandingMode = 'rysovani-app' | 'telesa-app';

const MODE_CONFIG: Record<LandingMode, { title: string; filters: ViewFilter[]; defaultFilter: ViewFilter }> = {
  'rysovani-app': {
    title: 'Rýsování a konstrukce',
    filters: ['rysovani', 'konstrukce'],
    defaultFilter: 'rysovani',
  },
  'telesa-app': {
    title: 'Tělesa, útvary a cvičení',
    filters: ['telesa', 'rovinne', 'cviceni'],
    defaultFilter: 'telesa',
  },
};

export function Landing({ mode }: { mode: LandingMode }) {
  const [searchParams] = useSearchParams();
  const config = MODE_CONFIG[mode];
  const tabFromUrl = searchParams.get('tab');
  const initialTab = (tabFromUrl && config.filters.includes(tabFromUrl as ViewFilter))
    ? tabFromUrl as ViewFilter
    : config.defaultFilter;
  const [activeFilter, setActiveFilter] = useState<ViewFilter>(initialTab);

  // Cvičení sub-filters
  const [exObjFilter, setExObjFilter] = useState<string>('all');
  const [exTaskFilter, setExTaskFilter] = useState<TaskFilter>('all');

  const filteredExercises = useMemo(() => {
    return exercises.filter(({ object, taskType }) => {
      if (exObjFilter !== 'all' && object.id !== exObjFilter) return false;
      if (exTaskFilter !== 'all' && taskType !== exTaskFilter) return false;
      return true;
    });
  }, [exObjFilter, exTaskFilter]);

  return (
    <div style={{ backgroundColor: '#ffffff', minHeight: '100vh' }}>

      {/* Horní lišta: Název + Filtry */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          padding: '24px 24px 0',
          maxWidth: '1320px',
          margin: '0 auto',
        }}
      >
        {/* Název aplikace */}
        <h1
          style={{
            fontFamily: "'Fenomen Sans', sans-serif",
            fontSize: '28px',
            fontWeight: 600,
            color: '#09056f',
            letterSpacing: '-0.01em',
            whiteSpace: 'nowrap',
            marginRight: '8px',
          }}
        >
          {config.title}
        </h1>

        {/* Filtry (bobánky) */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          {config.filters.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setActiveFilter(f)}
              onTouchEnd={(e) => { e.preventDefault(); setActiveFilter(f); }}
              style={{ ...filterBtnStyle(f, activeFilter), margin: '4px' }}
            >
              {HEADING_MAP[f]}
            </button>
          ))}
        </div>
      </div>

      {/* Dlaždice */}
      <div id="content" style={{ maxWidth: '1280px', margin: '32px auto', padding: '0 16px', marginBottom: '80px' }}>
        <h2
          style={{
            fontFamily: "'Fenomen Sans', sans-serif",
            fontSize: '42px',
            fontWeight: 600,
            color: '#09056f',
            marginBottom: '28px',
            textAlign: 'left',
            letterSpacing: '-0.02em',
          }}
        >
          {HEADING_MAP[activeFilter]}
        </h2>

        {/* Rýsování – Volné rýsování (Tabule + Počítač) */}
        {activeFilter === 'rysovani' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px', maxWidth: '660px' }}>
            {drawingItems.map((item) => (
              <DrawingCard key={item.id} item={item} />
            ))}
          </div>
        )}

        {/* Konstrukce */}
        {activeFilter === 'konstrukce' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '24px' }}>
            {constructionItems.map((item) => (
              <ConstructionCard key={item.id} item={item} />
            ))}
          </div>
        )}

        {/* 3D tělesa */}
        {activeFilter === 'telesa' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '24px' }}>
            {bodies3D.map((obj) => <ObjectCard key={obj.id} object={obj} />)}
          </div>
        )}

        {/* Rovinné útvary */}
        {activeFilter === 'rovinne' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '24px' }}>
            {flat2D.map((obj) => <ObjectCard key={obj.id} object={obj} />)}
          </div>
        )}

        {/* Cvičení */}
        {activeFilter === 'cviceni' && (
          <>
            {/* ── Sub-filters ── */}
            <div style={{ maxWidth: '900px', margin: '0 auto 32px', display: 'flex', flexDirection: 'column' }}>
              {/* Objekt filter */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ color: '#4e5871', fontSize: '13px', fontWeight: 500, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Objekt
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setExObjFilter('all')}
                    style={subFilterStyle(exObjFilter === 'all')}
                  >
                    Vše
                  </button>
                  {objects.map((obj) => (
                    <button
                      key={obj.id}
                      type="button"
                      onClick={() => setExObjFilter(obj.id)}
                      style={subFilterStyle(exObjFilter === obj.id)}
                    >
                      {obj.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Typ výpočtu filter */}
              <div>
                <div style={{ color: '#4e5871', fontSize: '13px', fontWeight: 500, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Co počítáš
                </div>
                <div className="flex flex-wrap gap-2">
                  {TASK_FILTERS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setExTaskFilter(t)}
                      style={subFilterStyle(exTaskFilter === t)}
                    >
                      {TASK_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Tiles */}
            {filteredExercises.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '24px' }}>
                {filteredExercises.map(({ object, taskType }) => (
                  <ExerciseTile key={`${object.id}-${taskType}`} object={object} taskType={taskType} />
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <p style={{ color: '#4e5871', opacity: 0.6, fontSize: '18px' }}>
                  Žádná cvičení neodpovídají zvoleným filtrům.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
