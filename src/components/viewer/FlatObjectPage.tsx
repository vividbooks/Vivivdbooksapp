import React, { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Calculator } from 'lucide-react';
import { getObjectDef } from '../../data/objects';
import { Flat2DViewer } from './Flat2DViewer';
import { ObjectControls } from './ObjectControls';

function useWindowWidth() {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return w;
}

export function FlatObjectPage() {
  const { objectId } = useParams<{ objectId: string }>();
  const navigate = useNavigate();
  const windowWidth = useWindowWidth();
  const isDesktop = windowWidth >= 900;
  const def = getObjectDef(objectId || '');

  const [params, setParams] = useState<Record<string, number>>(() => {
    if (!def) return {};
    const p: Record<string, number> = {};
    for (const d of def.parameterDefs) p[d.id] = d.defaultValue;
    return p;
  });

  useEffect(() => {
    if (!def) return;
    const p: Record<string, number> = {};
    for (const d of def.parameterDefs) p[d.id] = d.defaultValue;
    setParams(p);
  }, [objectId]);

  const handleParamChange = useCallback((id: string, value: number) => {
    setParams((prev) => ({ ...prev, [id]: value }));
  }, []);

  if (!def || !def.is2D || !def.computeVertices2D) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#EFF1F8' }}>
        <div className="text-center">
          <p className="text-slate-600 text-lg mb-4">Útvar „{objectId}" nebyl nalezen.</p>
          <button onClick={() => navigate('/')} className="text-blue-600 hover:underline flex items-center gap-2 mx-auto">
            <ArrowLeft className="h-4 w-4" /> Zpět
          </button>
        </div>
      </div>
    );
  }

  const mathProperties = def.computeProperties(params);
  const vertices = def.computeVertices2D(params);
  const isCircle = objectId === 'kruh2d';

  const sidebarWidth = isDesktop ? 320 : 280;
  const gap = 16;
  const marginFromEdge = 16;

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#fff', overflow: 'hidden' }}>
      {/* Levý panel */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: marginFromEdge,
          bottom: 0,
          width: sidebarWidth,
          background: '#ffffff',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: '12px 12px 0 0',
        }}
      >
        <button
          onClick={() => navigate('/')}
          className="flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors"
          style={{ flexShrink: 0, width: 40, height: 40, margin: 12, borderRadius: '50%', background: '#f8fafc', border: '1px solid #e2e8f0' }}
          title="Zpět"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
          <ObjectControls
            objectId={objectId}
            objectName={def.name}
            shapeBadge={def.badge}
            params={params}
            parameterDefs={def.parameterDefs}
            onParamChange={handleParamChange}
            unfoldProgress={0}
            onUnfoldProgressChange={() => {}}
            isWireframe={false}
            onWireframeToggle={() => {}}
            hasUnfold={false}
            mathProperties={mathProperties}
            is2D={true}
          />
        </div>
        <Link
          to="/cviceni"
          className="flex items-center justify-center gap-2 text-sm text-amber-700 hover:text-amber-800 py-3 px-3 rounded-lg bg-amber-50 border border-amber-100"
          style={{ textDecoration: 'none', flexShrink: 0, margin: '0 12px 12px' }}
        >
          <Calculator className="h-4 w-4" />
          Cvičení: obvod a obsah
        </Link>
      </div>

      {/* Pravá oblast – 2D zobrazení */}
      <div
        style={{
          position: 'absolute',
          top: gap,
          left: marginFromEdge + sidebarWidth + gap,
          right: gap,
          bottom: gap,
          borderRadius: 16,
          background: '#E0E7FF',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}
      >
        <Flat2DViewer
          vertices={vertices}
          params={params}
          paramIds={def.parameterDefs.map((d) => d.id)}
          fillColor={def.color}
          backgroundColor="#E0E7FF"
          isCircle={isCircle}
        />
      </div>
    </div>
  );
}
