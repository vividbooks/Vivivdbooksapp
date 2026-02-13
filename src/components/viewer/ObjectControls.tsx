import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Slider } from '../ui/slider';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { Expand, ChevronDown, Calculator, Grid3X3, BookOpen, ArrowRight } from 'lucide-react';
import type { ParameterDef, MathProperty } from '../geometry/shared';

// Mapping: objectId → available tutorial links
const TUTORIAL_LINKS: Record<string, { label: string; route: string; color: string }[]> = {
  ctverec: [
    { label: 'Jak vypočítat obvod', route: '/tutorial/ctverec2d-obvod', color: '#4d49f3' },
    { label: 'Jak vypočítat obsah', route: '/tutorial/ctverec2d-obsah', color: '#e11d48' },
  ],
  obdelnik: [
    { label: 'Jak vypočítat obvod', route: '/tutorial/obdelnik-obvod', color: '#4d49f3' },
    { label: 'Jak vypočítat obsah', route: '/tutorial/obdelnik-obsah', color: '#e11d48' },
  ],
  trojuhelnik: [
    { label: 'Jak vypočítat obvod', route: '/tutorial/trojuhelnik-obvod', color: '#4d49f3' },
    { label: 'Jak vypočítat obsah', route: '/tutorial/trojuhelnik-obsah', color: '#e11d48' },
  ],
  kruh2d: [
    { label: 'Jak vypočítat obvod', route: '/tutorial/kruh2d-obvod', color: '#4d49f3' },
    { label: 'Jak vypočítat obsah', route: '/tutorial/kruh2d-obsah', color: '#e11d48' },
  ],
  krychle: [
    { label: 'Jak vypočítat objem', route: '/tutorial/krychle-objem', color: '#059669' },
    { label: 'Jak vypočítat povrch', route: '/tutorial/krychle-povrch', color: '#e11d48' },
  ],
  kvadr: [
    { label: 'Jak vypočítat objem', route: '/tutorial/kvadr-objem', color: '#059669' },
    { label: 'Jak vypočítat povrch', route: '/tutorial/kvadr-povrch', color: '#e11d48' },
  ],
  jehlan: [
    { label: 'Jak vypočítat objem', route: '/tutorial/jehlan-objem', color: '#059669' },
    { label: 'Jak vypočítat povrch', route: '/tutorial/jehlan-povrch', color: '#e11d48' },
  ],
  valec: [
    { label: 'Jak vypočítat objem', route: '/tutorial/valec-objem', color: '#059669' },
    { label: 'Jak vypočítat povrch', route: '/tutorial/valec-povrch', color: '#e11d48' },
  ],
  hranol: [
    { label: 'Jak vypočítat objem', route: '/tutorial/hranol-objem', color: '#059669' },
    { label: 'Jak vypočítat povrch', route: '/tutorial/hranol-povrch', color: '#e11d48' },
  ],
  kuzel: [
    { label: 'Jak vypočítat objem', route: '/tutorial/kuzel-objem', color: '#059669' },
    { label: 'Jak vypočítat povrch', route: '/tutorial/kuzel-povrch', color: '#e11d48' },
  ],
  koule: [
    { label: 'Jak vypočítat objem', route: '/tutorial/koule-objem', color: '#059669' },
    { label: 'Jak vypočítat povrch', route: '/tutorial/koule-povrch', color: '#e11d48' },
  ],
};

interface Props {
  objectId?: string;
  objectName: string;
  shapeBadge: string;
  params: Record<string, number>;
  parameterDefs: ParameterDef[];
  onParamChange: (id: string, value: number) => void;
  unfoldProgress: number;
  onUnfoldProgressChange: (v: number) => void;
  isWireframe: boolean;
  onWireframeToggle: (v: boolean) => void;
  hasUnfold: boolean;
  mathProperties: MathProperty[];
  is2D?: boolean;
}

export function ObjectControls({
  objectId,
  objectName,
  shapeBadge,
  params,
  parameterDefs,
  onParamChange,
  unfoldProgress,
  onUnfoldProgressChange,
  isWireframe,
  onWireframeToggle,
  hasUnfold,
  mathProperties,
  is2D = false,
}: Props) {
  const navigate = useNavigate();
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(is2D);
  const tutorials = objectId ? TUTORIAL_LINKS[objectId] ?? [] : [];

  return (
    <div className="space-y-4">
      <div style={{ paddingBottom: 8 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 400, color: '#0f172a' }}>{objectName}</h2>
          <Badge variant="secondary" className="bg-blue-50 text-blue-700 border border-blue-200" style={{ fontWeight: 400 }}>
            {shapeBadge}
          </Badge>
        </div>
        <div className="space-y-6">
          {/* Dynamic parameter sliders */}
          {parameterDefs.map((def) => (
            <div key={def.id} className="space-y-3">
              <Label className="text-slate-700">
                {def.label}: {params[def.id]}{def.unit ? ` ${def.unit}` : ''}
              </Label>
              <Slider
                value={[params[def.id]]}
                onValueChange={(v) => onParamChange(def.id, v[0])}
                min={def.min}
                max={def.max}
                step={def.step}
                className="w-full"
              />
            </div>
          ))}

          {/* Wireframe toggle (3D only) */}
          {!is2D && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Grid3X3 className="h-4 w-4 text-slate-600" />
                  <Label className="text-slate-700">Drátěný model</Label>
                </div>
                <Switch checked={isWireframe} onCheckedChange={onWireframeToggle} />
              </div>
              <div className="text-sm text-slate-500">
                {isWireframe ? 'Zobrazit pouze hrany (bez výplně)' : 'Barevné stěny s výplní'}
              </div>
            </div>
          )}

          {/* Unfold slider */}
          {hasUnfold && (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex items-center space-x-2">
                <Expand className="h-4 w-4 text-slate-600" />
                <Label className="text-slate-700">
                  Rozbalení do sítě: {Math.round(unfoldProgress * 100)}%
                </Label>
              </div>
              <Slider
                value={[unfoldProgress]}
                onValueChange={(v) => onUnfoldProgressChange(v[0])}
                min={0}
                max={1}
                step={0.01}
                className="w-full"
              />
              {unfoldProgress < 1 && (
                <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                  {unfoldProgress === 0
                    ? '💡 Tip: Táhněte pro otáčení, kolečkem myši přiblížíte nebo oddálíte.'
                    : '💡 Táhněte slider pro postupné rozbalení'}
                </div>
              )}
            </div>
          )}

          {/* Tip when no unfold */}
          {!hasUnfold && (
            <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
              💡 Tip: Táhněte pro otáčení, kolečkem myši přiblížíte nebo oddálíte.
            </div>
          )}
        </div>
      </div>

      {/* Matematické vlastnosti */}
      <Collapsible open={isPropertiesOpen} onOpenChange={setIsPropertiesOpen}>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="w-full flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors text-left"
              style={{ padding: '14px 16px', border: 'none', background: 'none', fontSize: '1rem', fontWeight: 400, color: '#0f172a' }}
            >
              <div className="flex items-center">
                <Calculator className="mr-2 h-4 w-4 text-slate-600" />
                <span>Matematické vlastnosti</span>
              </div>
              <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isPropertiesOpen ? 'rotate-180' : ''}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-3" style={{ padding: '0 16px 16px' }}>
              {mathProperties.map((prop, i) => (
                <div key={i} className="flex justify-between items-center">
                  <span className="text-slate-700">{prop.label}:</span>
                  <Badge
                    className={
                      prop.color === 'emerald'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-purple-50 text-purple-700 border-purple-200'
                    }
                  >
                    {prop.value}
                  </Badge>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* Tutorial links */}
      {tutorials.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', paddingLeft: 2 }}>
            Tutoriály
          </div>
          {tutorials.map((t) => (
            <button
              key={t.route}
              type="button"
              onClick={() => navigate(t.route)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 14px',
                borderRadius: 12,
                border: '1px solid #e2e8f0',
                background: '#fff',
                cursor: 'pointer',
                transition: 'all 200ms',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f8fafc';
                e.currentTarget.style.borderColor = t.color;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#fff';
                e.currentTarget.style.borderColor = '#e2e8f0';
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: `${t.color}15`, display: 'flex',
                alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <BookOpen size={16} style={{ color: t.color }} />
              </div>
              <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 500, color: '#334155' }}>
                {t.label}
              </span>
              <ArrowRight size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
