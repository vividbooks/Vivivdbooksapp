import { useState } from 'react';
import { memo } from 'react';
import { ArrowRight, Compass, Triangle, Ruler, Shapes, FlipHorizontal } from 'lucide-react';
import Pero from '../imports/Pero';
import Pravitko from '../imports/Pravitko';
import Kruzitko from '../imports/Kruzitko';
import Uhel from '../imports/Uhel';
import TabuleIllustration from '../imports/Group23925';
import PocitacIllustration from '../imports/Group23926';

type ViewType = 'bisector' | 'triangle' | 'custom-triangle' | 'interactive-triangle' | 'angle-triangle' | 'axial-symmetry' | 'free-editor-board' | 'free-editor-computer';

interface GeometryMenuProps {
  onSelect: (construction: ViewType) => void;
  darkMode: boolean;
  onDarkModeChange?: (v: boolean) => void;
}

const CZ = {
  pageTitle: 'Geometrie online',
  pageDesc: 'Interaktivn\u00ed n\u00e1stroj pro v\u00fduku geometrie na z\u00e1kladn\u00edch \u0161kol\u00e1ch. Voln\u00e9 r\u00fdsov\u00e1n\u00ed i veden\u00e9 konstrukce na jednom m\u00edst\u011b.',
  startDrawing: 'Za\u010d\u00edt r\u00fdsovat',
  filterAll: 'V\u0161e',
  filterDrawing: 'Voln\u00e9 r\u00fdsov\u00e1n\u00ed',
  filterConstruction: 'Konstrukce',
  sectionDrawing: 'Voln\u00e9 r\u00fdsov\u00e1n\u00ed',
  sectionConstruction: 'Konstrukce',
  open: 'Otev\u0159\u00edt',
  card1Title: 'Tabule',
  card1Desc: 'Interaktivn\u00ed tabule pro v\u00fduku. Dotykov\u00e9 ovl\u00e1d\u00e1n\u00ed.',
  card2Title: 'Po\u010d\u00edta\u010d',
  card2Desc: 'Klasick\u00e9 ovl\u00e1d\u00e1n\u00ed my\u0161\u00ed. Body, p\u0159\u00edmky, kru\u017enice, \u00fahly a dal\u0161\u00ed.',
  bisectorTitle: 'Osa \u00fase\u010dky',
  bisectorDesc: 'Konstrukce osy \u00fase\u010dky pomoc\u00ed kru\u017enic',
  axialTitle: 'Osov\u011b soum\u011brn\u00fd obraz',
  axialDesc: 'Konstrukce obrazu troj\u00faheln\u00edku v osov\u00e9 soum\u011brnosti',
  triangleSSSTitle: 'Troj\u00faheln\u00edk SSS',
  triangleSSSDesc: 'Konstrukce troj\u00faheln\u00edku ze t\u0159\u00ed stran',
  customTriTitle: 'Vlastn\u00ed troj\u00faheln\u00edk',
  customTriDesc: 'Nar\u00fdsuj si troj\u00faheln\u00edk s vlastn\u00edmi rozm\u011bry',
  angleTriTitle: 'Troj\u00faheln\u00edk z \u00fahl\u016f',
  angleTriDesc: 'Konstrukce troj\u00faheln\u00edku ze strany a dvou \u00fahl\u016f',
  grade2: '2. ro\u010dn\u00edk',
  grade6: '6. ro\u010dn\u00edk',
  grade7: '7. ro\u010dn\u00edk',
};

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M3.5 2.5L9.5 6L3.5 9.5V2.5Z" fill="white" />
    </svg>
  );
}

// Memoizováno pro lepší performance na starších zařízeních
const CategoryCard = memo(({
  title,
  description,
  bgColor,
  previewBg,
  preview,
  onClick,
}: {
  title: string;
  description: string;
  bgColor: string;
  previewBg: string;
  preview: React.ReactNode;
  onClick: () => void;
}) => {
  return (
    <button
      onClick={onClick}
      onTouchEnd={(e) => { e.preventDefault(); onClick(); }}
      className="group flex flex-col overflow-hidden rounded-[32px] border-2 border-transparent transition-all hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] text-left cursor-pointer w-full"
      style={{ backgroundColor: bgColor, fontWeight: 400 }}
    >
      <div
        className="relative w-full h-[200px] overflow-hidden flex items-center justify-center"
        style={{ backgroundColor: previewBg }}
      >
        {preview}
      </div>
      <div className="flex flex-col justify-between flex-1 p-6 pt-6 pb-0">
        <div>
          <div className="text-[#4e5871] mb-2 text-[20px]" style={{ fontWeight: 400 }}>
            {title}
          </div>
          <p className="text-[#4e5871] opacity-70 text-[14px] leading-[22px]" style={{ fontWeight: 400 }}>
            {description}
          </p>
        </div>
        <div className="mt-4 mb-6">
          <div className="bg-[#4d49f3] h-[44px] rounded-[14px] shadow-[0px_10px_15px_0px_#e0e7ff,0px_4px_6px_0px_#e0e7ff] flex items-center justify-center gap-2 transition-all group-hover:bg-[#3d39e3]">
            <PlayIcon />
            <span className="text-white text-[15px]" style={{ fontWeight: 400 }}>
              {CZ.open}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
});
CategoryCard.displayName = 'CategoryCard';

// Memoizováno pro lepší performance na starších zařízeních
const ConstructionCard = memo(({
  title,
  description,
  grade,
  icon: Icon,
  color,
  onClick,
}: {
  title: string;
  description: string;
  grade: string;
  icon: React.ElementType;
  color: string;
  onClick: () => void;
}) => {
  return (
    <button
      onClick={onClick}
      onTouchEnd={(e) => { e.preventDefault(); onClick(); }}
      className="group flex flex-col overflow-hidden rounded-[24px] border border-[#e5e7eb] bg-white shadow-sm transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] text-left cursor-pointer w-full"
      style={{ fontWeight: 400 }}
    >
      <div className="relative w-full h-[140px] flex items-center justify-center" style={{ backgroundColor: color }}>
        <div className="w-14 h-14 flex items-center justify-center">
          <Icon className="size-11 text-[#4e5871] opacity-60" />
        </div>
      </div>
      <div className="p-5 pb-5 flex flex-col flex-1">
        <div className="text-[#4e5871] mb-1.5 text-[18px]" style={{ fontWeight: 400 }}>
          {title}
        </div>
        <p className="text-[#4e5871] opacity-70 text-[13px] leading-[20px] mb-4 flex-1" style={{ fontWeight: 400 }}>
          {description}
        </p>
        <div className="flex items-center justify-end">
          <ArrowRight className="size-4 text-[#4d49f3] opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1" />
        </div>
      </div>
    </button>
  );
});
ConstructionCard.displayName = 'ConstructionCard';

export function GeometryMenu({ onSelect }: GeometryMenuProps) {
  const [activeFilter, setActiveFilter] = useState<'all' | 'drawing' | 'construction'>('all');

  const constructions = [
    { id: 'bisector' as const, title: CZ.bisectorTitle, description: CZ.bisectorDesc, icon: Compass, grade: CZ.grade2, color: '#dcf3ff' },
    { id: 'axial-symmetry' as const, title: CZ.axialTitle, description: CZ.axialDesc, icon: FlipHorizontal, grade: CZ.grade6, color: '#f5f8d0' },
    { id: 'triangle' as const, title: CZ.triangleSSSTitle, description: CZ.triangleSSSDesc, icon: Triangle, grade: CZ.grade7, color: '#fff8b3' },
    { id: 'custom-triangle' as const, title: CZ.customTriTitle, description: CZ.customTriDesc, icon: Ruler, grade: CZ.grade7, color: '#fce8f4' },
    { id: 'angle-triangle' as const, title: CZ.angleTriTitle, description: CZ.angleTriDesc, icon: Shapes, grade: CZ.grade7, color: '#e8f5e9' },
  ];

  const filters = [
    { id: 'all' as const, label: CZ.filterAll },
    { id: 'drawing' as const, label: CZ.filterDrawing },
    { id: 'construction' as const, label: CZ.filterConstruction },
  ];

  return (
    <div className="min-h-screen bg-white overflow-y-auto" style={{ fontWeight: 400 }}>
      {/* Hero */}
      <div className="mx-4 sm:mx-8 mt-4 rounded-[32px] bg-[#fefce8] overflow-hidden shadow-sm">
        <div className="flex flex-col lg:flex-row items-center justify-between px-8 sm:px-14 py-10 gap-8">
          <div className="flex-1 max-w-xl">
            <div className="text-[#09056f] text-[42px] sm:text-[56px] leading-[1.1] mb-6" style={{ fontFamily: "Fenomen Sans, sans-serif", fontWeight: 400 }}>
              {CZ.pageTitle}
            </div>
            <p className="text-[#09056f] text-[16px] leading-[26px] mb-4 max-w-md" style={{ fontWeight: 400 }}>
              {CZ.pageDesc}
            </p>
            <div className="flex items-center gap-1 text-[#4d49f3] cursor-pointer hover:underline">
              <span className="text-[15px]" style={{ fontWeight: 400 }}>{CZ.startDrawing}</span>
              <ArrowRight className="size-4" />
            </div>
          </div>
          <div className="relative w-[300px] h-[180px] flex-shrink-0 hidden md:block">
            <div className="absolute top-2 left-8 w-[160px] h-[100px] rotate-[-8deg] opacity-90">
              <Pravitko />
            </div>
            <div className="absolute top-6 right-6 w-[60px] h-[150px] rotate-[5deg] opacity-90">
              <Kruzitko />
            </div>
            <div className="absolute bottom-0 left-[100px] w-[100px] h-[60px] rotate-[3deg] opacity-90">
              <Uhel />
            </div>
            <div className="absolute top-0 right-[90px] w-[80px] h-[50px] rotate-[-3deg] opacity-80">
              <Pero />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center justify-center gap-3 mt-10 mb-4 px-4 flex-wrap">
        {filters.map(f => (
          <button
            key={f.id}
            onClick={() => setActiveFilter(f.id)}
            onTouchEnd={(e) => { e.preventDefault(); setActiveFilter(f.id); }}
            className={`px-6 py-2.5 rounded-full text-[14px] border-2 transition-all cursor-pointer ${
              activeFilter === f.id
                ? 'bg-[#4d49f3] text-white border-transparent shadow-[0px_10px_15px_0px_#e0e7ff,0px_4px_6px_0px_#e0e7ff]'
                : 'bg-white text-[#4e5871] border-[#4e5871] hover:bg-gray-50'
            }`}
            style={{ fontWeight: 400 }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Drawing section */}
      {(activeFilter === 'all' || activeFilter === 'drawing') && (
        <div className="max-w-5xl mx-auto px-4 sm:px-8 mt-8">
          <div className="flex items-center justify-center mb-8">
            <div className="text-[#4e5871] text-[32px] text-center" style={{ fontWeight: 400 }}>
              {CZ.sectionDrawing}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
            <CategoryCard
              title={CZ.card1Title}
              description={CZ.card1Desc}
              bgColor="#dcf3ff"
              previewBg="#e3f4ff"
              preview={
                <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                  <div style={{ width: 274, height: 200, position: 'relative' }}>
                    <div style={{ width: 1055, height: 1071, position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) scale(0.2) rotate(-6deg)' }}>
                      <TabuleIllustration />
                    </div>
                  </div>
                </div>
              }
              onClick={() => onSelect('free-editor-board')}
            />
            <CategoryCard
              title={CZ.card2Title}
              description={CZ.card2Desc}
              bgColor="#fff8b3"
              previewBg="#fefce8"
              preview={
                <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                  <div style={{ width: 280, height: 190, position: 'relative' }}>
                    <div style={{ width: 1236, height: 852, position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) scale(0.22)' }}>
                      <PocitacIllustration />
                    </div>
                  </div>
                </div>
              }
              onClick={() => onSelect('free-editor-computer')}
            />
          </div>
        </div>
      )}

      {/* Construction section */}
      {(activeFilter === 'all' || activeFilter === 'construction') && (
        <div className="max-w-5xl mx-auto px-4 sm:px-8 mt-16 pb-20">
          <div className="flex items-center justify-center mb-8">
            <div className="text-[#4e5871] text-[32px] text-center" style={{ fontWeight: 400 }}>
              {CZ.sectionConstruction}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {constructions.map(c => (
              <ConstructionCard
                key={c.id}
                title={c.title}
                description={c.description}
                grade={c.grade}
                icon={c.icon}
                color={c.color}
                onClick={() => onSelect(c.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}