import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getObjectDef } from '../../data/objects';
import type { TaskType } from '../viewer/ObjectQuizPanel';
import type { ParameterDef } from '../geometry/shared';

function parseTaskType(s: string | undefined): TaskType {
  if (s === 'objem' || s === 'povrch' || s === 'obvod' || s === 'obsah') return s;
  return 'objem';
}

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

/** Jedna řádka vlastních hodnot = jeden záznam parametrů */
function rowToQuery(def: ParameterDef[], row: Record<string, number>): string {
  return def.map((d) => String(row[d.id] ?? d.defaultValue)).join(',');
}

function queryToRow(def: ParameterDef[], q: string): Record<string, number> {
  const parts = q.split(',');
  const row: Record<string, number> = {};
  def.forEach((d, i) => {
    const v = parseFloat(parts[i] ?? '');
    row[d.id] = Number.isFinite(v) ? v : d.defaultValue;
  });
  return row;
}

export function CviceniSetupPage() {
  const { objectId, taskType: taskTypeParam } = useParams<{ objectId: string; taskType: string }>();
  const navigate = useNavigate();
  const taskType = parseTaskType(taskTypeParam);
  const def = getObjectDef(objectId || '');

  const [paramMode, setParamMode] = useState<'random' | 'custom'>('random');
  const [answerMode, setAnswerMode] = useState<'number' | 'choices'>('number');
  const [customRows, setCustomRows] = useState<Record<string, number>[]>(() =>
    def ? [def.parameterDefs.reduce((acc, d) => ({ ...acc, [d.id]: d.defaultValue }), {} as Record<string, number>)] : []
  );

  const addRow = () => {
    if (!def) return;
    const newRow = def.parameterDefs.reduce(
      (acc, d) => ({ ...acc, [d.id]: d.defaultValue }),
      {} as Record<string, number>
    );
    setCustomRows((prev) => [...prev, newRow]);
  };

  const updateRow = (rowIndex: number, paramId: string, value: number) => {
    setCustomRows((prev) =>
      prev.map((row, i) =>
        i === rowIndex ? { ...row, [paramId]: value } : row
      )
    );
  };

  const removeRow = (rowIndex: number) => {
    if (customRows.length <= 1) return;
    setCustomRows((prev) => prev.filter((_, i) => i !== rowIndex));
  };

  const sharePath = useMemo(() => {
    if (!def) return '';
    const params = new URLSearchParams();
    params.set('answerMode', answerMode);
    if (paramMode === 'random') {
      params.set('params', 'random');
    } else {
      const ordered = customRows.map((row) => rowToQuery(def.parameterDefs, row));
      params.set('rows', ordered.join('|'));
    }
    return `/${objectId}/cviceni/${taskType}?${params.toString()}`;
  }, [objectId, taskType, def, paramMode, answerMode, customRows]);

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return sharePath;
    return `${window.location.origin}${sharePath}`;
  }, [sharePath]);

  const handleStart = () => {
    navigate(sharePath);
  };

  if (!def) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <p>Těleso nenalezeno.</p>
        <button type="button" onClick={() => navigate('/')}>
          Zpět
        </button>
      </div>
    );
  }

  const genitive = getGenitive(def.name);
  const TITLE_MAP: Record<TaskType, string> = {
    objem: `Počítání objemu ${genitive}`,
    povrch: `Počítání povrchu ${genitive}`,
    obvod: `Počítání obvodu ${genitive}`,
    obsah: `Počítání obsahu ${genitive}`,
  };
  const title = TITLE_MAP[taskType];

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: 24, paddingBottom: 80 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, color: '#0f172a', marginBottom: 24 }}>
        {title}
      </h1>

      {/* 1) Náhodné hodnoty / Svoje hodnoty */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 8 }}>
          Rozměry
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => setParamMode('random')}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: paramMode === 'random' ? '2px solid #4d49f3' : '1px solid #e2e8f0',
              background: paramMode === 'random' ? '#eef2ff' : '#fff',
              color: paramMode === 'random' ? '#4d49f3' : '#64748b',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Náhodné hodnoty
          </button>
          <button
            type="button"
            onClick={() => setParamMode('custom')}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: paramMode === 'custom' ? '2px solid #4d49f3' : '1px solid #e2e8f0',
              background: paramMode === 'custom' ? '#eef2ff' : '#fff',
              color: paramMode === 'custom' ? '#4d49f3' : '#64748b',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Svoje hodnoty
          </button>
        </div>
        {paramMode === 'custom' && (
          <div style={{ marginTop: 16 }}>
            {customRows.map((row, rowIndex) => (
              <div
                key={rowIndex}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 12,
                  padding: 12,
                  background: '#f8fafc',
                  borderRadius: 8,
                }}
              >
                <span style={{ fontSize: 12, color: '#64748b', marginRight: 8 }}>
                  Cvičení {rowIndex + 1}
                </span>
                {def.parameterDefs.map((p) => (
                  <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 12, color: '#64748b' }}>{p.id}:</span>
                    <input
                      type="number"
                      min={p.min}
                      max={p.max}
                      step={p.step}
                      value={row[p.id] ?? p.defaultValue}
                      onChange={(e) => updateRow(rowIndex, p.id, parseFloat(e.target.value) || p.defaultValue)}
                      style={{
                        width: 64,
                        padding: '6px 8px',
                        borderRadius: 6,
                        border: '1px solid #e2e8f0',
                        fontSize: 14,
                      }}
                    />
                  </label>
                ))}
                {customRows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(rowIndex)}
                    style={{
                      marginLeft: 'auto',
                      padding: '4px 10px',
                      fontSize: 12,
                      color: '#94a3b8',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    Odebrat
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addRow}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px dashed #cbd5e1',
                background: '#fff',
                color: '#64748b',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              + Přidat řádek (nové cvičení)
            </button>
          </div>
        )}
      </div>

      {/* 2) ABC / Napsat číslo */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 8 }}>
          Způsob odpovědi
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => setAnswerMode('number')}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: answerMode === 'number' ? '2px solid #4d49f3' : '1px solid #e2e8f0',
              background: answerMode === 'number' ? '#eef2ff' : '#fff',
              color: answerMode === 'number' ? '#4d49f3' : '#64748b',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Napsat číslo
          </button>
          <button
            type="button"
            onClick={() => setAnswerMode('choices')}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: answerMode === 'choices' ? '2px solid #4d49f3' : '1px solid #e2e8f0',
              background: answerMode === 'choices' ? '#eef2ff' : '#fff',
              color: answerMode === 'choices' ? '#4d49f3' : '#64748b',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Možnosti A–D
          </button>
        </div>
      </div>

      {/* 3) Zahájit */}
      <button
        type="button"
        onClick={handleStart}
        style={{
          width: '100%',
          padding: '14px 24px',
          borderRadius: 12,
          border: 'none',
          background: '#4d49f3',
          color: '#fff',
          fontSize: 16,
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 4px 14px 0 rgba(77, 73, 243, 0.4)',
        }}
      >
        Zahájit
      </button>

      {/* Odkaz na sdílení */}
      <div style={{ marginTop: 24, padding: 16, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>
          Odkaz na sdílení cvičení
        </div>
        <a
          href={shareUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 13, color: '#4d49f3', wordBreak: 'break-all' }}
        >
          {shareUrl}
        </a>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(shareUrl)}
          style={{
            display: 'block',
            marginTop: 8,
            padding: '6px 12px',
            fontSize: 12,
            borderRadius: 6,
            border: '1px solid #e2e8f0',
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          Zkopírovat odkaz
        </button>
      </div>
    </div>
  );
}
