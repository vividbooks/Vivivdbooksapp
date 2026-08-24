import type { GeometrySubmissionSnapshot } from '../../../rysovani/src/components/FreeGeometryEditor';

export type AssignmentSolutionStep = {
  text: string;
  snapshot: GeometrySubmissionSnapshot;
};

export type AssignmentModelSolution = {
  snapshot: GeometrySubmissionSnapshot;
  explanation: string;
  steps: AssignmentSolutionStep[];
};

type SolPoint = GeometrySubmissionSnapshot['points'][number];
type SolShape = GeometrySubmissionSnapshot['shapes'][number];

function pt(
  id: string,
  x: number,
  y: number,
  label: string,
  extra: { hidden?: boolean } = {},
): SolPoint {
  return { id, x, y, label, locked: true, ...extra };
}

function seg(
  id: string,
  p1: string,
  p2: string,
  extra: { thinStroke?: boolean } = {},
): SolShape {
  return {
    id,
    type: 'segment',
    label: '',
    points: [p1, p2],
    locked: true,
    thinStroke: extra.thinStroke,
    definition: { p1Id: p1, p2Id: p2 },
  };
}

function circle(id: string, c: string, rim: string, label: string): SolShape {
  return {
    id,
    type: 'circle',
    label,
    points: [c, rim],
    locked: true,
    thinStroke: true,
    definition: { p1Id: c, p2Id: rim },
  };
}

function pickSnapshot(
  allPoints: SolPoint[],
  allShapes: SolShape[],
  pointIds: string[],
  shapeIds: string[],
): GeometrySubmissionSnapshot {
  const idSet = new Set(pointIds);
  const shapes = allShapes.filter(s => shapeIds.includes(s.id));
  const needed = new Set(idSet);
  for (const s of shapes) {
    if (s.definition.p1Id) needed.add(s.definition.p1Id);
    if (s.definition.p2Id) needed.add(s.definition.p2Id);
  }
  return {
    points: allPoints.filter(p => needed.has(p.id)),
    shapes,
    freehandPaths: [],
  };
}

function ln(
  id: string,
  p1: string,
  p2: string,
  extra: { label?: string; dashed?: boolean } = {},
): SolShape {
  return {
    id,
    type: extra.dashed ? 'lineDashed' : 'line',
    label: extra.label ?? '',
    points: [p1, p2],
    locked: true,
    thinStroke: extra.dashed,
    definition: { p1Id: p1, p2Id: p2 },
  };
}

type V = { x: number; y: number };

const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: V, s: number): V => ({ x: a.x * s, y: a.y * s });
const mid = (a: V, b: V): V => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dot = (a: V, b: V): number => a.x * b.x + a.y * b.y;
const rot90 = (a: V): V => ({ x: -a.y, y: a.x });
const hypotV = (a: V): number => Math.hypot(a.x, a.y);
const unit = (a: V): V => {
  const len = hypotV(a) || 1;
  return { x: a.x / len, y: a.y / len };
};

function lineIntersect(p: V, r: V, q: V, s: V): V {
  const den = r.x * s.y - r.y * s.x;
  const t = ((q.x - p.x) * s.y - (q.y - p.y) * s.x) / den;
  return add(p, mul(r, t));
}

function circumcenter(a: V, b: V, c: V): V {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  return {
    x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
  };
}

function circleCircle(c1: V, r1: number, c2: V, r2: number): [V, V] {
  const dvec = sub(c2, c1);
  const d = hypotV(dvec);
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const u = unit(dvec);
  const base = add(c1, mul(u, a));
  const n = rot90(u);
  return [add(base, mul(n, h)), sub(base, mul(n, h))];
}

function reflectPoint(p: V, origin: V, dir: V): V {
  const u = unit(dir);
  const proj = mul(u, dot(sub(p, origin), u));
  return sub(mul(add(origin, proj), 2), p);
}

function modelSolution(explanation: string, steps: AssignmentSolutionStep[]): AssignmentModelSolution {
  return { explanation, steps, snapshot: steps[steps.length - 1]!.snapshot };
}

/** Rovnoběžník ABCD: |BD| = 2|AC|, B nebo D na přímce p. */
function parallelogramLongerDiagonalSolution(): AssignmentModelSolution {
  const A = { x: 190, y: 320 };
  const C = { x: 400, y: 210 };
  const sx = (A.x + C.x) / 2;
  const sy = (A.y + C.y) / 2;
  const ac = Math.hypot(C.x - A.x, C.y - A.y);
  const py = 130;
  const half = Math.sqrt(Math.max(0, ac * ac - (sy - py) ** 2));
  const p1 = { x: sx + half, y: py };
  const p2 = { x: sx - half, y: py };
  const q1 = { x: 2 * sx - p1.x, y: 2 * sy - p1.y };
  const q2 = { x: 2 * sx - p2.x, y: 2 * sy - p2.y };
  const rim = { x: sx + (C.x - A.x), y: sy + (C.y - A.y) };

  const allPoints: SolPoint[] = [
    pt('sol-a', A.x, A.y, '', { hidden: true }),
    pt('sol-c', C.x, C.y, '', { hidden: true }),
    pt('sol-s', sx, sy, 'S'),
    pt('sol-rim', rim.x, rim.y, '', { hidden: true }),
    pt('sol-b1', p1.x, p1.y, 'B₁'),
    pt('sol-d1', q1.x, q1.y, 'D₁'),
    pt('sol-b2', p2.x, p2.y, 'B₂'),
    pt('sol-d2', q2.x, q2.y, 'D₂'),
  ];
  const allShapes: SolShape[] = [
    circle('sol-k', 'sol-s', 'sol-rim', 'k'),
    seg('sol-ac', 'sol-a', 'sol-c', { thinStroke: true }),
    seg('sol-bd1', 'sol-b1', 'sol-d1', { thinStroke: true }),
    seg('sol-bd2', 'sol-b2', 'sol-d2', { thinStroke: true }),
    seg('sol-ab1', 'sol-a', 'sol-b1'),
    seg('sol-b1c', 'sol-b1', 'sol-c'),
    seg('sol-cd1', 'sol-c', 'sol-d1'),
    seg('sol-d1a', 'sol-d1', 'sol-a'),
    seg('sol-ab2', 'sol-a', 'sol-b2'),
    seg('sol-b2c', 'sol-b2', 'sol-c'),
    seg('sol-cd2', 'sol-c', 'sol-d2'),
    seg('sol-d2a', 'sol-d2', 'sol-a'),
  ];

  const steps: AssignmentSolutionStep[] = [
    {
      text: 'Úhlopříčky rovnoběžníku se půlí. Sestrojte střed S úsečky AC — ten bude zároveň středem úhlopříčky BD.',
      snapshot: pickSnapshot(allPoints, allShapes, ['sol-s'], ['sol-ac']),
    },
    {
      text: 'Z podmínky |BD| = 2·|AC| plyne |SB| = |SD| = |AC|. Sestrojte kružnici k se středem S a poloměrem |AC|.',
      snapshot: pickSnapshot(allPoints, allShapes, ['sol-s'], ['sol-ac', 'sol-k']),
    },
    {
      text: 'Vrchol B nebo D leží na přímce p, a zároveň na kružnici k. Sestrojte průsečíky kružnice k s přímkou p a označte je B₁ a B₂.',
      snapshot: pickSnapshot(allPoints, allShapes, ['sol-s', 'sol-b1', 'sol-b2'], ['sol-ac', 'sol-k']),
    },
    {
      text: 'Protější vrchol je obraz ve středové souměrnosti se středem S. Sestrojte obrazy bodů B₁ a B₂ podle S a označte je D₁ a D₂ (leží na kružnici k, na přímce BS).',
      snapshot: pickSnapshot(
        allPoints,
        allShapes,
        ['sol-s', 'sol-b1', 'sol-b2', 'sol-d1', 'sol-d2'],
        ['sol-ac', 'sol-k', 'sol-bd1', 'sol-bd2'],
      ),
    },
    {
      text: 'Narýsujte rovnoběžník AB₁CD₁. Vrchol B₁ leží na přímce p.',
      snapshot: pickSnapshot(
        allPoints,
        allShapes,
        ['sol-s', 'sol-b1', 'sol-b2', 'sol-d1', 'sol-d2'],
        ['sol-ac', 'sol-k', 'sol-bd1', 'sol-bd2', 'sol-ab1', 'sol-b1c', 'sol-cd1', 'sol-d1a'],
      ),
    },
    {
      text: 'Narýsujte rovnoběžník AB₂CD₂. Vrchol B₂ leží na přímce p.',
      snapshot: pickSnapshot(
        allPoints,
        allShapes,
        ['sol-s', 'sol-b1', 'sol-b2', 'sol-d1', 'sol-d2'],
        [
          'sol-ac',
          'sol-k',
          'sol-bd1',
          'sol-bd2',
          'sol-ab1',
          'sol-b1c',
          'sol-cd1',
          'sol-d1a',
          'sol-ab2',
          'sol-b2c',
          'sol-cd2',
          'sol-d2a',
        ],
      ),
    },
    {
      text: 'Další dvě řešení vzniknou záměnou označení B a D: pak leží na přímce p vrchol D. Celkem jsou tedy čtyři řešení.',
      snapshot: pickSnapshot(
        allPoints,
        allShapes,
        ['sol-s', 'sol-b1', 'sol-b2', 'sol-d1', 'sol-d2'],
        [
          'sol-ac',
          'sol-k',
          'sol-bd1',
          'sol-bd2',
          'sol-ab1',
          'sol-b1c',
          'sol-cd1',
          'sol-d1a',
          'sol-ab2',
          'sol-b2c',
          'sol-cd2',
          'sol-d2a',
        ],
      ),
    },
  ];

  const last = steps[steps.length - 1]!;
  return {
    explanation:
      'Úhlopříčky rovnoběžníku se půlí. Střed S úsečky AC je středem BD a body B, D leží na kružnici k(S, |AC|). Průsečíky k s přímkou p dají dvě polohy vrcholu B; protější D je středově souměrný podle S. Záměnou B a D vzniknou další dvě řešení.',
    snapshot: last.snapshot,
    steps,
  };
}

/** Čtverec CDEF vepsaný kružnici opsané trojúhelníku ABC. */
function squareInscribedInCircleSolution(): AssignmentModelSolution {
  const A = { x: 150, y: 330 };
  const B = { x: 470, y: 330 };
  const C = { x: 300, y: 120 };
  const S = circumcenter(A, B, C);
  const v = sub(C, S);
  const D = add(S, rot90(v));
  const E = sub(S, v);
  const F = sub(S, rot90(v));
  const nab = mid(A, B);
  const nab2 = add(nab, rot90(sub(B, A)));
  const nac = mid(A, C);
  const nac2 = add(nac, rot90(sub(C, A)));

  const allPoints: SolPoint[] = [
    pt('sol-a', A.x, A.y, '', { hidden: true }),
    pt('sol-b', B.x, B.y, '', { hidden: true }),
    pt('sol-c', C.x, C.y, '', { hidden: true }),
    pt('sol-s', S.x, S.y, 'S'),
    pt('sol-nab', nab.x, nab.y, '', { hidden: true }),
    pt('sol-nab2', nab2.x, nab2.y, '', { hidden: true }),
    pt('sol-nac', nac.x, nac.y, '', { hidden: true }),
    pt('sol-nac2', nac2.x, nac2.y, '', { hidden: true }),
    pt('sol-d', D.x, D.y, 'D'),
    pt('sol-e', E.x, E.y, 'E'),
    pt('sol-f', F.x, F.y, 'F'),
  ];
  const allShapes: SolShape[] = [
    ln('sol-os-ab', 'sol-nab', 'sol-nab2', { dashed: true }),
    ln('sol-os-ac', 'sol-nac', 'sol-nac2', { dashed: true }),
    circle('sol-k', 'sol-s', 'sol-c', 'k'),
    ln('sol-cs', 'sol-c', 'sol-e', { dashed: true }),
    ln('sol-df', 'sol-d', 'sol-f', { dashed: true }),
    seg('sol-cd', 'sol-c', 'sol-d'),
    seg('sol-de', 'sol-d', 'sol-e'),
    seg('sol-ef', 'sol-e', 'sol-f'),
    seg('sol-fc', 'sol-f', 'sol-c'),
  ];
  const snap = (p: string[], s: string[]) => pickSnapshot(allPoints, allShapes, p, s);

  return modelSolution(
    'Střed S kružnice opsané je průsečík os stran. Vrcholy čtverce CDEF vepsaného téže kružnici dostaneme otočením bodu C kolem S o 90°, 180° a 270°: E je obraz C podle S, D a F leží na kolmici k CS vedené středem S.',
    [
      {
        text: 'Střed S kružnice opsané trojúhelníku ABC je průsečík os stran. Sestrojte osu strany AB a osu strany AC.',
        snapshot: snap(['sol-s'], ['sol-os-ab', 'sol-os-ac']),
      },
      {
        text: 'Průsečík os označte S a sestrojte kružnici k se středem S procházející bodem C (prochází i body A, B).',
        snapshot: snap(['sol-s'], ['sol-os-ab', 'sol-os-ac', 'sol-k']),
      },
      {
        text: 'Úhlopříčky čtverce vepsaného kružnici jsou průměry a jsou na sebe kolmé. Protější vrchol k C je obraz E ve středové souměrnosti se středem S.',
        snapshot: snap(['sol-s', 'sol-e'], ['sol-k', 'sol-cs']),
      },
      {
        text: 'Kolmice k průměru CE vedená středem S protne kružnici k ve zbývajících vrcholech D a F.',
        snapshot: snap(['sol-s', 'sol-d', 'sol-e', 'sol-f'], ['sol-k', 'sol-cs', 'sol-df']),
      },
      {
        text: 'Narýsujte čtverec CDEF. (Opačné pořadí vrcholů D, F odpovídá jen změně orientace — jde o tentýž čtverec.)',
        snapshot: snap(
          ['sol-s', 'sol-d', 'sol-e', 'sol-f'],
          ['sol-k', 'sol-cs', 'sol-df', 'sol-cd', 'sol-de', 'sol-ef', 'sol-fc'],
        ),
      },
    ],
  );
}

/** Rovnoramenný ABC se základnou AB, výška BM na AC, A na q. */
function isoscelesWithHeightSolution(): AssignmentModelSolution {
  const B = { x: 440, y: 250 };
  const M = { x: 310, y: 175 };
  const qy = 350;
  const acDir = rot90(sub(M, B));
  const A = lineIntersect(M, acDir, { x: 0, y: qy }, { x: 1, y: 0 });
  const nab = mid(A, B);
  const osAb = rot90(sub(B, A));
  const C = lineIntersect(M, acDir, nab, osAb);
  const ac2 = add(M, acDir);
  const os2 = add(nab, osAb);

  const allPoints: SolPoint[] = [
    pt('sol-b', B.x, B.y, '', { hidden: true }),
    pt('sol-m', M.x, M.y, '', { hidden: true }),
    pt('sol-a', A.x, A.y, 'A'),
    pt('sol-c', C.x, C.y, 'C'),
    pt('sol-ac2', ac2.x, ac2.y, '', { hidden: true }),
    pt('sol-nab', nab.x, nab.y, '', { hidden: true }),
    pt('sol-os2', os2.x, os2.y, '', { hidden: true }),
  ];
  const allShapes: SolShape[] = [
    ln('sol-ac-line', 'sol-m', 'sol-ac2', { dashed: true }),
    ln('sol-os-ab', 'sol-nab', 'sol-os2', { dashed: true }),
    seg('sol-bm', 'sol-b', 'sol-m', { thinStroke: true }),
    seg('sol-ab', 'sol-a', 'sol-b'),
    seg('sol-bc', 'sol-b', 'sol-c'),
    seg('sol-ca', 'sol-c', 'sol-a'),
  ];
  const snap = (p: string[], s: string[]) => pickSnapshot(allPoints, allShapes, p, s);

  return modelSolution(
    'BM je výška na stranu AC, proto je AC kolmá na BM a prochází bodem M. Vrchol A je průsečík této kolmice s přímkou q. Z |AC| = |BC| plyne, že C leží na ose úsečky AB; zároveň leží na přímce AC.',
    [
      {
        text: 'Úsečka BM je výška na stranu AC, proto je přímka AC kolmá na BM a prochází bodem M. Sestrojte tuto kolmici.',
        snapshot: snap([], ['sol-bm', 'sol-ac-line']),
      },
      {
        text: 'Vrchol A leží na přímce q i na sestrojené kolmici. Označte jejich průsečík A.',
        snapshot: snap(['sol-a'], ['sol-bm', 'sol-ac-line']),
      },
      {
        text: 'Trojúhelník je rovnoramenný se základnou AB, tedy |AC| = |BC|. Bod C proto leží na ose úsečky AB. Sestrojte osu AB.',
        snapshot: snap(['sol-a'], ['sol-bm', 'sol-ac-line', 'sol-os-ab']),
      },
      {
        text: 'Vrchol C je průsečík osy úsečky AB s přímkou AC. Označte jej.',
        snapshot: snap(['sol-a', 'sol-c'], ['sol-bm', 'sol-ac-line', 'sol-os-ab']),
      },
      {
        text: 'Narýsujte trojúhelník ABC.',
        snapshot: snap(['sol-a', 'sol-c'], ['sol-bm', 'sol-ac-line', 'sol-os-ab', 'sol-ab', 'sol-bc', 'sol-ca']),
      },
    ],
  );
}

/** Obdélník ABCD, D na p, S střed CD. */
function rectangleWithSideMidpointSolution(): AssignmentModelSolution {
  const A = { x: 180, y: 330 };
  const S = { x: 430, y: 210 };
  const py = 150;
  const Q = mid(A, S);
  const r = hypotV(sub(S, A)) / 2;
  const dx = Math.sqrt(Math.max(0, r * r - (py - Q.y) ** 2));
  const d1 = { x: Q.x + dx, y: py };
  const d2 = { x: Q.x - dx, y: py };
  const c1 = sub(mul(S, 2), d1);
  const c2 = sub(mul(S, 2), d2);
  const b1 = sub(add(A, c1), d1);
  const b2 = sub(add(A, c2), d2);
  const rim = { x: Q.x + r, y: Q.y };

  const allPoints: SolPoint[] = [
    pt('sol-a', A.x, A.y, '', { hidden: true }),
    pt('sol-s', S.x, S.y, '', { hidden: true }),
    pt('sol-q', Q.x, Q.y, '', { hidden: true }),
    pt('sol-rim', rim.x, rim.y, '', { hidden: true }),
    pt('sol-d1', d1.x, d1.y, 'D₁'),
    pt('sol-c1', c1.x, c1.y, 'C₁'),
    pt('sol-b1', b1.x, b1.y, 'B₁'),
    pt('sol-d2', d2.x, d2.y, 'D₂'),
    pt('sol-c2', c2.x, c2.y, 'C₂'),
    pt('sol-b2', b2.x, b2.y, 'B₂'),
  ];
  const allShapes: SolShape[] = [
    circle('sol-thales', 'sol-q', 'sol-rim', ''),
    seg('sol-as', 'sol-a', 'sol-s', { thinStroke: true }),
    seg('sol-d1c1', 'sol-d1', 'sol-c1', { thinStroke: true }),
    seg('sol-d2c2', 'sol-d2', 'sol-c2', { thinStroke: true }),
    seg('sol-ab1', 'sol-a', 'sol-b1'),
    seg('sol-b1c1', 'sol-b1', 'sol-c1'),
    seg('sol-c1d1', 'sol-c1', 'sol-d1'),
    seg('sol-d1a', 'sol-d1', 'sol-a'),
    seg('sol-ab2', 'sol-a', 'sol-b2'),
    seg('sol-b2c2', 'sol-b2', 'sol-c2'),
    seg('sol-c2d2', 'sol-c2', 'sol-d2'),
    seg('sol-d2a', 'sol-d2', 'sol-a'),
  ];
  const snap = (p: string[], s: string[]) => pickSnapshot(allPoints, allShapes, p, s);

  return modelSolution(
    'Z pravoúhlosti při D plyne, že D leží na Thaletově kružnici s průměrem AS. Její průsečíky s přímkou p dají dvě polohy D; C je obraz D podle středu S a B doplní obdélník.',
    [
      {
        text: 'V obdélníku je úhel při D pravý a S je střed CD, proto CD prochází bodem S. Z (D−A) ⊥ (D−S) plyne, že D leží na Thaletově kružnici s průměrem AS. Sestrojte tuto kružnici.',
        snapshot: snap([], ['sol-as', 'sol-thales']),
      },
      {
        text: 'Vrchol D leží na přímce p. Průsečíky Thaletovy kružnice s přímkou p označte D₁ a D₂.',
        snapshot: snap(['sol-d1', 'sol-d2'], ['sol-as', 'sol-thales']),
      },
      {
        text: 'Bod S je středem CD, proto C je obraz D ve středové souměrnosti se středem S. Sestrojte C₁ a C₂.',
        snapshot: snap(['sol-d1', 'sol-d2', 'sol-c1', 'sol-c2'], ['sol-as', 'sol-thales', 'sol-d1c1', 'sol-d2c2']),
      },
      {
        text: 'Vrchol B doplňte jako čtvrtý vrchol obdélníku: B = A + C − D. Narýsujte obdélník AB₁C₁D₁.',
        snapshot: snap(
          ['sol-d1', 'sol-d2', 'sol-c1', 'sol-c2', 'sol-b1'],
          ['sol-thales', 'sol-d1c1', 'sol-ab1', 'sol-b1c1', 'sol-c1d1', 'sol-d1a'],
        ),
      },
      {
        text: 'Stejně sestrojte obdélník AB₂C₂D₂. Úloha má dvě řešení.',
        snapshot: snap(
          ['sol-d1', 'sol-d2', 'sol-c1', 'sol-c2', 'sol-b1', 'sol-b2'],
          [
            'sol-thales',
            'sol-d1c1',
            'sol-d2c2',
            'sol-ab1',
            'sol-b1c1',
            'sol-c1d1',
            'sol-d1a',
            'sol-ab2',
            'sol-b2c2',
            'sol-c2d2',
            'sol-d2a',
          ],
        ),
      },
    ],
  );
}

/** Trojúhelník z těžnice t_c a výšky v_c = 4 cm. */
function triangleMedianHeightSolution(): AssignmentModelSolution {
  const A = { x: 140, y: 340 };
  const B = { x: 460, y: 340 };
  const M = { x: 270, y: 265 };
  const N = mid(A, B);
  const h = 4 * 50;
  const C = lineIntersect(N, sub(M, N), { x: 0, y: N.y - h }, { x: 1, y: 0 });
  const T = { x: (A.x + B.x + C.x) / 3, y: (A.y + B.y + C.y) / 3 };
  const n2 = add(N, sub(M, N));

  const allPoints: SolPoint[] = [
    pt('sol-a', A.x, A.y, '', { hidden: true }),
    pt('sol-b', B.x, B.y, '', { hidden: true }),
    pt('sol-m', M.x, M.y, '', { hidden: true }),
    pt('sol-n', N.x, N.y, 'N'),
    pt('sol-c', C.x, C.y, 'C'),
    pt('sol-t', T.x, T.y, 'T'),
    pt('sol-n2', n2.x, n2.y, '', { hidden: true }),
  ];
  const allShapes: SolShape[] = [
    ln('sol-tc', 'sol-n', 'sol-n2', { dashed: true, label: 't_c' }),
    seg('sol-ab', 'sol-a', 'sol-b', { thinStroke: true }),
    seg('sol-ac', 'sol-a', 'sol-c'),
    seg('sol-bc', 'sol-b', 'sol-c'),
    seg('sol-cn', 'sol-c', 'sol-n', { thinStroke: true }),
  ];
  const snap = (p: string[], s: string[]) => pickSnapshot(allPoints, allShapes, p, s);

  return modelSolution(
    'Těžnice t_c spojuje C se středem N strany AB a prochází daným bodem M. Výška v_c = 4 cm určuje rovnoběžku s AB ve vzdálenosti 4 cm; C je ten z průsečíků, pro který leží M uvnitř trojúhelníku. Těžiště T dělí těžnici v poměru 2 : 1.',
    [
      {
        text: 'Těžnice t_c půlí stranu AB. Sestrojte střed N úsečky AB. Těžnice je přímka NM.',
        snapshot: snap(['sol-n'], ['sol-ab', 'sol-tc']),
      },
      {
        text: 'Vrchol C leží na těžnici t_c. Výška v_c k straně AB měří 4 cm, AB je vodorovná, proto má C y-ovou souřadnici o 4 cm menší než AB (M leží uvnitř trojúhelníku, C je na téže straně od AB). Označte C.',
        snapshot: snap(['sol-n', 'sol-c'], ['sol-ab', 'sol-tc']),
      },
      {
        text: 'Narýsujte trojúhelník ABC a těžnici CN.',
        snapshot: snap(['sol-n', 'sol-c'], ['sol-ab', 'sol-tc', 'sol-ac', 'sol-bc', 'sol-cn']),
      },
      {
        text: 'Těžiště T dělí každou těžnici v poměru 2 : 1 (blíže ke straně). Na CN sestrojte T tak, že |CT| = 2·|TN|.',
        snapshot: snap(['sol-n', 'sol-c', 'sol-t'], ['sol-ab', 'sol-ac', 'sol-bc', 'sol-cn']),
      },
    ],
  );
}

/** Rovnoramenný ABC se základnou AB, S střed ramene, A nebo B na q. */
function isoscelesLegMidpointSolution(): AssignmentModelSolution {
  const C = { x: 300, y: 130 };
  const S = { x: 390, y: 235 };
  const qy = 350;
  const Afixed = sub(mul(S, 2), C);
  const r = hypotV(sub(Afixed, C));
  const dx = Math.sqrt(Math.max(0, r * r - (qy - C.y) ** 2));
  const Bq1 = { x: C.x + dx, y: qy };
  const Bq2 = { x: C.x - dx, y: qy };
  const rim = { x: C.x + r, y: C.y };

  const allPoints: SolPoint[] = [
    pt('sol-c', C.x, C.y, '', { hidden: true }),
    pt('sol-s', S.x, S.y, '', { hidden: true }),
    pt('sol-rim', rim.x, rim.y, '', { hidden: true }),
    pt('sol-af', Afixed.x, Afixed.y, 'A₁'),
    pt('sol-b1', Bq1.x, Bq1.y, 'B₁'),
    pt('sol-b2', Bq2.x, Bq2.y, 'B₂'),
  ];
  const allShapes: SolShape[] = [
    circle('sol-k', 'sol-c', 'sol-rim', ''),
    seg('sol-cs', 'sol-c', 'sol-af', { thinStroke: true }),
    seg('sol-ca1', 'sol-c', 'sol-af'),
    seg('sol-cb1', 'sol-c', 'sol-b1'),
    seg('sol-a1b1', 'sol-af', 'sol-b1'),
    seg('sol-cb2', 'sol-c', 'sol-b2'),
    seg('sol-a1b2', 'sol-af', 'sol-b2'),
  ];
  const snap = (p: string[], s: string[]) => pickSnapshot(allPoints, allShapes, p, s);

  return modelSolution(
    'Pokud S půlí rameno CA, je A obraz C podle S a B leží na kružnici k(C, |CA|) ∩ q (dvě polohy). Další dvě řešení vzniknou záměnou A a B: tentýž obraz podle S je pak vrchol B a na q leží A. Celkem čtyři označení, dvě různá geometrická umístění.',
    [
      {
        text: 'Bod S je středem ramene. Nejprve předpokládejte, že S je střed CA. Pak A je obraz C ve středové souměrnosti se středem S (A₁).',
        snapshot: snap(['sol-af'], ['sol-cs']),
      },
      {
        text: 'Trojúhelník je rovnoramenný se základnou AB, proto |CA| = |CB|. Bod B leží na kružnici se středem C a poloměrem |CA₁| a zároveň na přímce q. Průsečíky označte B₁ a B₂.',
        snapshot: snap(['sol-af', 'sol-b1', 'sol-b2'], ['sol-cs', 'sol-k']),
      },
      {
        text: 'Narýsujte trojúhelníky A₁B₁C a A₁B₂C. V obou leží na přímce q vrchol B.',
        snapshot: snap(
          ['sol-af', 'sol-b1', 'sol-b2'],
          ['sol-k', 'sol-ca1', 'sol-cb1', 'sol-a1b1', 'sol-cb2', 'sol-a1b2'],
        ),
      },
      {
        text: 'Pokud S půlí rameno CB, je totéž A₁ vrcholem B a body B₁, B₂ vrcholy A. Záměnou označení A a B vzniknou další dvě řešení. Úloha má čtyři řešení.',
        snapshot: snap(
          ['sol-af', 'sol-b1', 'sol-b2'],
          ['sol-k', 'sol-ca1', 'sol-cb1', 'sol-a1b1', 'sol-cb2', 'sol-a1b2'],
        ),
      },
    ],
  );
}

/** Čtverec ABCD se středem O a stranou BC na p. */
function squareSideOnLineSolution(): AssignmentModelSolution {
  const O = { x: 300, y: 180 };
  const py = 340;
  const half = py - O.y;
  const B = { x: O.x - half, y: py };
  const Cc = { x: O.x + half, y: py };
  const Aa = { x: O.x - half, y: O.y - half };
  const D = { x: O.x + half, y: O.y - half };
  const foot = { x: O.x, y: py };

  const allPoints: SolPoint[] = [
    pt('sol-o', O.x, O.y, '', { hidden: true }),
    pt('sol-foot', foot.x, foot.y, '', { hidden: true }),
    pt('sol-a', Aa.x, Aa.y, 'A'),
    pt('sol-b', B.x, B.y, 'B'),
    pt('sol-c', Cc.x, Cc.y, 'C'),
    pt('sol-d', D.x, D.y, 'D'),
  ];
  const allShapes: SolShape[] = [
    seg('sol-of', 'sol-o', 'sol-foot', { thinStroke: true }),
    seg('sol-ab', 'sol-a', 'sol-b'),
    seg('sol-bc', 'sol-b', 'sol-c'),
    seg('sol-cd', 'sol-c', 'sol-d'),
    seg('sol-da', 'sol-d', 'sol-a'),
  ];
  const snap = (p: string[], s: string[]) => pickSnapshot(allPoints, allShapes, p, s);

  return modelSolution(
    'Strana BC leží na vodorovné přímce p, proto je čtverec osově souměrný podle kolmice z O na p. Vzdálenost O od p je polovina strany. Vrcholy jsou o a/2 vlevo/vpravo a stejně daleko na opačnou stranu od O. Záměna B a C je jen změna orientace.',
    [
      {
        text: 'Strana BC leží na přímce p, střed čtverce je O. Kolmice z O na p půlí stranu BC; pata je střed strany BC. Vzdálenost |Op| je rovna polovině strany čtverce.',
        snapshot: snap(['sol-foot'], ['sol-of']),
      },
      {
        text: 'Na přímce p vyneste od paty na obě strany polovinu strany a označte B, C. Protější strana AD je rovnoběžná s p ve stejné vzdálenosti na druhé straně od O. Označte A, D.',
        snapshot: snap(['sol-a', 'sol-b', 'sol-c', 'sol-d'], ['sol-of']),
      },
      {
        text: 'Narýsujte čtverec ABCD. Prohození označení B a C (opačný oběh) dává totéž geometrické řešení.',
        snapshot: snap(['sol-a', 'sol-b', 'sol-c', 'sol-d'], ['sol-of', 'sol-ab', 'sol-bc', 'sol-cd', 'sol-da']),
      },
    ],
  );
}

/** Rovnoramenný lichoběžník, |CD| = ½|AB|, C, D na p. */
function isoscelesTrapezoidSolution(): AssignmentModelSolution {
  const A = { x: 150, y: 340 };
  const B = { x: 490, y: 340 };
  const py = 160;
  const ab = hypotV(sub(B, A));
  const overhang = (ab - ab / 2) / 2;
  const D = { x: A.x + overhang, y: py };
  const C = { x: B.x - overhang, y: py };

  const allPoints: SolPoint[] = [
    pt('sol-a', A.x, A.y, '', { hidden: true }),
    pt('sol-b', B.x, B.y, '', { hidden: true }),
    pt('sol-d', D.x, D.y, 'D'),
    pt('sol-c', C.x, C.y, 'C'),
  ];
  const allShapes: SolShape[] = [
    seg('sol-ab', 'sol-a', 'sol-b', { thinStroke: true }),
    seg('sol-ad', 'sol-a', 'sol-d'),
    seg('sol-dc', 'sol-d', 'sol-c'),
    seg('sol-cb', 'sol-c', 'sol-b'),
  ];
  const snap = (p: string[], s: string[]) => pickSnapshot(allPoints, allShapes, p, s);

  return modelSolution(
    'AB ∥ p, proto je CD vodorovná. V rovnoramenném lichoběžníku jsou přesahy základny AB přes CD stejně velké: (|AB| − |CD|)/2 = |AB|/4. Od A a B vyneseme tento přesah na p a dostaneme D a C.',
    [
      {
        text: 'Základny AB a CD jsou rovnoběžné a C, D leží na p, proto je CD částí přímky p. |CD| = ½·|AB|, tedy každý z přesahů základny AB je čtvrtina |AB|.',
        snapshot: snap([], ['sol-ab']),
      },
      {
        text: 'Od kolmých průmětů A a B na p vyneste dovnitř přesah |AB|/4. Označte D (u A) a C (u B).',
        snapshot: snap(['sol-d', 'sol-c'], ['sol-ab']),
      },
      {
        text: 'Narýsujte rovnoramenný lichoběžník ABCD. Řešení je jediné.',
        snapshot: snap(['sol-d', 'sol-c'], ['sol-ab', 'sol-ad', 'sol-dc', 'sol-cb']),
      },
    ],
  );
}

/** Kosočtverec ABCD s úhlopříčkou AC, B na p. */
function rhombusDiagonalSolution(): AssignmentModelSolution {
  const A = { x: 160, y: 280 };
  const C = { x: 480, y: 200 };
  const py = 160;
  const S = mid(A, C);
  const bdDir = rot90(sub(C, A));
  const B = lineIntersect(S, bdDir, { x: 0, y: py }, { x: 1, y: 0 });
  const D = sub(mul(S, 2), B);
  const bd2 = add(S, bdDir);

  const allPoints: SolPoint[] = [
    pt('sol-a', A.x, A.y, '', { hidden: true }),
    pt('sol-c', C.x, C.y, '', { hidden: true }),
    pt('sol-s', S.x, S.y, 'S'),
    pt('sol-b', B.x, B.y, 'B'),
    pt('sol-d', D.x, D.y, 'D'),
    pt('sol-bd2', bd2.x, bd2.y, '', { hidden: true }),
  ];
  const allShapes: SolShape[] = [
    seg('sol-ac', 'sol-a', 'sol-c', { thinStroke: true }),
    ln('sol-bd-line', 'sol-s', 'sol-bd2', { dashed: true }),
    seg('sol-bd', 'sol-b', 'sol-d', { thinStroke: true }),
    seg('sol-ab', 'sol-a', 'sol-b'),
    seg('sol-bc', 'sol-b', 'sol-c'),
    seg('sol-cd', 'sol-c', 'sol-d'),
    seg('sol-da', 'sol-d', 'sol-a'),
  ];
  const snap = (p: string[], s: string[]) => pickSnapshot(allPoints, allShapes, p, s);

  return modelSolution(
    'Úhlopříčky kosočtverce se půlí a jsou na sebe kolmé. Střed S úsečky AC je středem BD, přímka BD je kolmá na AC. B je průsečík této kolmice s p, D je obraz B podle S.',
    [
      {
        text: 'Úhlopříčky kosočtverce se půlí. Sestrojte střed S úhlopříčky AC.',
        snapshot: snap(['sol-s'], ['sol-ac']),
      },
      {
        text: 'Úhlopříčky kosočtverce jsou na sebe kolmé. Sestrojte kolmici k AC vedenou bodem S — na ní leží úhlopříčka BD.',
        snapshot: snap(['sol-s'], ['sol-ac', 'sol-bd-line']),
      },
      {
        text: 'Vrchol B leží na přímce p i na sestrojené kolmici. Označte B a jeho obraz D ve středové souměrnosti se středem S.',
        snapshot: snap(['sol-s', 'sol-b', 'sol-d'], ['sol-ac', 'sol-bd-line', 'sol-bd']),
      },
      {
        text: 'Narýsujte kosočtverec ABCD. Řešení je jediné.',
        snapshot: snap(
          ['sol-s', 'sol-b', 'sol-d'],
          ['sol-ac', 'sol-bd', 'sol-ab', 'sol-bc', 'sol-cd', 'sol-da'],
        ),
      },
    ],
  );
}

/** Kosočtverec ABCD se stranou AB, D na p. */
function rhombusSideSolution(): AssignmentModelSolution {
  const A = { x: 200, y: 300 };
  const B = { x: 420, y: 300 };
  const py = 120;
  const r = hypotV(sub(B, A));
  const dx = Math.sqrt(Math.max(0, r * r - (py - A.y) ** 2));
  const d1 = { x: A.x + dx, y: py };
  const d2 = { x: A.x - dx, y: py };
  const c1 = sub(add(B, d1), A);
  const c2 = sub(add(B, d2), A);
  const rim = { x: A.x + r, y: A.y };

  const allPoints: SolPoint[] = [
    pt('sol-a', A.x, A.y, '', { hidden: true }),
    pt('sol-b', B.x, B.y, '', { hidden: true }),
    pt('sol-rim', rim.x, rim.y, '', { hidden: true }),
    pt('sol-d1', d1.x, d1.y, 'D₁'),
    pt('sol-c1', c1.x, c1.y, 'C₁'),
    pt('sol-d2', d2.x, d2.y, 'D₂'),
    pt('sol-c2', c2.x, c2.y, 'C₂'),
  ];
  const allShapes: SolShape[] = [
    circle('sol-k', 'sol-a', 'sol-rim', ''),
    seg('sol-ab', 'sol-a', 'sol-b', { thinStroke: true }),
    seg('sol-ad1', 'sol-a', 'sol-d1'),
    seg('sol-d1c1', 'sol-d1', 'sol-c1'),
    seg('sol-c1b', 'sol-c1', 'sol-b'),
    seg('sol-ad2', 'sol-a', 'sol-d2'),
    seg('sol-d2c2', 'sol-d2', 'sol-c2'),
    seg('sol-c2b', 'sol-c2', 'sol-b'),
  ];
  const snap = (p: string[], s: string[]) => pickSnapshot(allPoints, allShapes, p, s);

  return modelSolution(
    'V kosočtverci |AD| = |AB|. D je průsečík kružnice k(A, |AB|) s přímkou p (dvě polohy). C = B + D − A doplní rovnoběžník, který je kosočtvercem.',
    [
      {
        text: 'Všechny strany kosočtverce jsou stejně dlouhé, proto |AD| = |AB|. Sestrojte kružnici se středem A a poloměrem |AB|.',
        snapshot: snap([], ['sol-ab', 'sol-k']),
      },
      {
        text: 'Vrchol D leží na přímce p i na této kružnici. Průsečíky označte D₁ a D₂.',
        snapshot: snap(['sol-d1', 'sol-d2'], ['sol-ab', 'sol-k']),
      },
      {
        text: 'Vrchol C doplňte jako čtvrtý vrchol rovnoběžníku: C = B + D − A. Narýsujte kosočtverce AB C₁ D₁ a AB C₂ D₂. Úloha má dvě řešení.',
        snapshot: snap(
          ['sol-d1', 'sol-d2', 'sol-c1', 'sol-c2'],
          ['sol-k', 'sol-ab', 'sol-ad1', 'sol-d1c1', 'sol-c1b', 'sol-ad2', 'sol-d2c2', 'sol-c2b'],
        ),
      },
    ],
  );
}

/** Kružnice tečná k rovnoběžkám p, q a procházející M. */
function circleBetweenParallelsSolution(): AssignmentModelSolution {
  const py = 140;
  const qy = 340;
  const M = { x: 350, y: 290 };
  const midY = (py + qy) / 2;
  const r = Math.abs(qy - py) / 2;
  const dy = M.y - midY;
  const dx = Math.sqrt(Math.max(0, r * r - dy * dy));
  const s1 = { x: M.x + dx, y: midY };
  const s2 = { x: M.x - dx, y: midY };
  const rim1 = { x: s1.x, y: py };
  const rim2 = { x: s2.x, y: py };
  const rimM = { x: M.x + r, y: M.y };

  const allPoints: SolPoint[] = [
    pt('sol-m', M.x, M.y, '', { hidden: true }),
    pt('sol-s1', s1.x, s1.y, 'S₁'),
    pt('sol-s2', s2.x, s2.y, 'S₂'),
    pt('sol-rim1', rim1.x, rim1.y, '', { hidden: true }),
    pt('sol-rim2', rim2.x, rim2.y, '', { hidden: true }),
    pt('sol-rimm', rimM.x, rimM.y, '', { hidden: true }),
  ];
  const allShapes: SolShape[] = [
    ln('sol-mid', 'sol-s1', 'sol-s2', { dashed: true }),
    circle('sol-km', 'sol-m', 'sol-rimm', ''),
    circle('sol-k1', 'sol-s1', 'sol-rim1', 'k₁'),
    circle('sol-k2', 'sol-s2', 'sol-rim2', 'k₂'),
  ];
  const snap = (p: string[], s: string[]) => pickSnapshot(allPoints, allShapes, p, s);

  return modelSolution(
    'Kružnice tečná k oběma rovnoběžkám má střed na ose pásu a poloměr rovný polovině vzdálenosti přímek. Zároveň |SM| = r, proto S leží na kružnici k(M, r) i na ose pásu — dva středy.',
    [
      {
        text: 'Středy kružnic tečných k oběma rovnoběžkám p, q leží na ose pásu (rovnoběžka uprostřed mezi p a q). Poloměr je polovina vzdálenosti přímek p a q.',
        snapshot: snap(['sol-s1', 'sol-s2'], ['sol-mid']),
      },
      {
        text: 'Kružnice prochází bodem M, proto |SM| = r. Střed S je průsečík osy pásu s kružnicí se středem M a poloměrem r. Označte S₁ a S₂.',
        snapshot: snap(['sol-s1', 'sol-s2'], ['sol-mid', 'sol-km']),
      },
      {
        text: 'Narýsujte obě kružnice k₁(S₁, r) a k₂(S₂, r). Úloha má dvě řešení.',
        snapshot: snap(['sol-s1', 'sol-s2'], ['sol-mid', 'sol-k1', 'sol-k2']),
      },
    ],
  );
}

/** Trojúhelník z těžiště T. */
function centroidTriangleSolution(): AssignmentModelSolution {
  const A = { x: 140, y: 320 };
  const B = { x: 500, y: 320 };
  const T = { x: 300, y: 240 };
  const N = mid(A, B);
  const C = sub(sub(mul(T, 3), A), B);

  const allPoints: SolPoint[] = [
    pt('sol-a', A.x, A.y, '', { hidden: true }),
    pt('sol-b', B.x, B.y, '', { hidden: true }),
    pt('sol-t', T.x, T.y, '', { hidden: true }),
    pt('sol-n', N.x, N.y, 'N'),
    pt('sol-c', C.x, C.y, 'C'),
  ];
  const allShapes: SolShape[] = [
    seg('sol-ab', 'sol-a', 'sol-b', { thinStroke: true }),
    ln('sol-tc', 'sol-n', 'sol-c', { dashed: true }),
    seg('sol-ac', 'sol-a', 'sol-c'),
    seg('sol-bc', 'sol-b', 'sol-c'),
  ];
  const snap = (p: string[], s: string[]) => pickSnapshot(allPoints, allShapes, p, s);

  return modelSolution(
    'Těžiště leží na těžnici z C ke středu N strany AB a dělí ji v poměru 2 : 1 (blíže k N). C = T + 2(T − N), neboli C = 3T − A − B.',
    [
      {
        text: 'Těžiště leží na těžnici ke straně AB. Sestrojte střed N úsečky AB. Těžnice je přímka NT.',
        snapshot: snap(['sol-n'], ['sol-ab', 'sol-tc']),
      },
      {
        text: 'Těžiště T dělí těžnici v poměru |CT| : |TN| = 2 : 1. Od T vyneste za T dvojnásobek vektoru T−N a označte C.',
        snapshot: snap(['sol-n', 'sol-c'], ['sol-ab', 'sol-tc']),
      },
      {
        text: 'Narýsujte trojúhelník ABC. Řešení je jediné.',
        snapshot: snap(['sol-n', 'sol-c'], ['sol-ab', 'sol-tc', 'sol-ac', 'sol-bc']),
      },
    ],
  );
}

/** Tečny z bodu P ke kružnici k. */
function tangentsToCircleSolution(): AssignmentModelSolution {
  const S = { x: 280, y: 240 };
  const rim = { x: 430, y: 240 };
  const P = { x: 500, y: 100 };
  const r = hypotV(sub(rim, S));
  const Q = mid(P, S);
  const [T1, T2] = circleCircle(S, r, Q, hypotV(sub(P, S)) / 2);

  const allPoints: SolPoint[] = [
    pt('sol-s', S.x, S.y, '', { hidden: true }),
    pt('sol-rim', rim.x, rim.y, '', { hidden: true }),
    pt('sol-p', P.x, P.y, '', { hidden: true }),
    pt('sol-q', Q.x, Q.y, '', { hidden: true }),
    pt('sol-t1', T1.x, T1.y, 'T₁'),
    pt('sol-t2', T2.x, T2.y, 'T₂'),
  ];
  const allShapes: SolShape[] = [
    circle('sol-k', 'sol-s', 'sol-rim', 'k'),
    circle('sol-thales', 'sol-q', 'sol-p', ''),
    seg('sol-ps', 'sol-p', 'sol-s', { thinStroke: true }),
    seg('sol-pt1', 'sol-p', 'sol-t1'),
    seg('sol-pt2', 'sol-p', 'sol-t2'),
    seg('sol-st1', 'sol-s', 'sol-t1', { thinStroke: true }),
    seg('sol-st2', 'sol-s', 'sol-t2', { thinStroke: true }),
  ];
  const snap = (p: string[], s: string[]) => pickSnapshot(allPoints, allShapes, p, s);

  return modelSolution(
    'Body dotyku leží na k a úhel PST je pravý. Tedy T leží na Thaletově kružnici s průměrem PS. Průsečíky obou kružnic jsou T₁, T₂; tečny jsou PT₁ a PT₂.',
    [
      {
        text: 'Poloměr ke bodu dotyku je kolmý na tečnu. Body T proto leží na kružnici k i na Thaletově kružnici s průměrem PS. Sestrojte střed Q úsečky PS a Thaletovu kružnici.',
        snapshot: snap(['sol-q'], ['sol-k', 'sol-ps', 'sol-thales']),
      },
      {
        text: 'Průsečíky Thaletovy kružnice s kružnicí k označte T₁ a T₂ — to jsou body dotyku.',
        snapshot: snap(['sol-q', 'sol-t1', 'sol-t2'], ['sol-k', 'sol-ps', 'sol-thales']),
      },
      {
        text: 'Narýsujte tečny PT₁ a PT₂. Poloměry ST₁, ST₂ jsou kolmé na tečny. Úloha má dvě řešení.',
        snapshot: snap(
          ['sol-t1', 'sol-t2'],
          ['sol-k', 'sol-thales', 'sol-pt1', 'sol-pt2', 'sol-st1', 'sol-st2'],
        ),
      },
    ],
  );
}

/** Tětiva délky 4 cm rovnoběžná s p. */
function chordOfGivenLengthSolution(): AssignmentModelSolution {
  const S = { x: 300, y: 200 };
  const r = 150;
  const p1 = { x: 40, y: 380 };
  const p2 = { x: 620, y: 340 };
  const half = 4 * 50 * 0.5;
  const h = Math.sqrt(Math.max(0, r * r - half * half));
  const n = unit(rot90(sub(p2, p1)));
  const u = unit(sub(p2, p1));
  const m1 = add(S, mul(n, h));
  const m2 = sub(S, mul(n, h));
  const x1 = add(m1, mul(u, half));
  const y1 = sub(m1, mul(u, half));
  const x2 = add(m2, mul(u, half));
  const y2 = sub(m2, mul(u, half));
  const rim = { x: S.x + r, y: S.y };

  const allPoints: SolPoint[] = [
    pt('sol-s', S.x, S.y, '', { hidden: true }),
    pt('sol-rim', rim.x, rim.y, '', { hidden: true }),
    pt('sol-m1', m1.x, m1.y, '', { hidden: true }),
    pt('sol-m2', m2.x, m2.y, '', { hidden: true }),
    pt('sol-x1', x1.x, x1.y, 'X₁'),
    pt('sol-y1', y1.x, y1.y, 'Y₁'),
    pt('sol-x2', x2.x, x2.y, 'X₂'),
    pt('sol-y2', y2.x, y2.y, 'Y₂'),
  ];
  const allShapes: SolShape[] = [
    circle('sol-k', 'sol-s', 'sol-rim', 'k'),
    circle('sol-h', 'sol-s', 'sol-m1', ''),
    ln('sol-chord1', 'sol-x1', 'sol-y1', { dashed: true }),
    ln('sol-chord2', 'sol-x2', 'sol-y2', { dashed: true }),
    seg('sol-xy1', 'sol-x1', 'sol-y1'),
    seg('sol-xy2', 'sol-x2', 'sol-y2'),
    seg('sol-sm1', 'sol-s', 'sol-m1', { thinStroke: true }),
    seg('sol-sm2', 'sol-s', 'sol-m2', { thinStroke: true }),
  ];
  const snap = (p: string[], s: string[]) => pickSnapshot(allPoints, allShapes, p, s);

  return modelSolution(
    'Střed tětivy délky 4 cm leží ve vzdálenosti √(r² − 2²) od S a spojnice středu tětivy se S je kolmá na tětivu, tedy i na p. Dvě rovnoběžky s p v této vzdálenosti od S protnou k v hledaných tětivách.',
    [
      {
        text: 'Střed M tětivy XY délky 4 cm splňuje |XM| = 2 cm a |SM| = √(r² − 2²). SM je kolmá na tětivu, a protože XY ∥ p, je SM kolmá na p.',
        snapshot: snap(['sol-m1', 'sol-m2'], ['sol-k', 'sol-h', 'sol-sm1', 'sol-sm2']),
      },
      {
        text: 'Na kolmici k p vedené bodem S vyneste |SM| na obě strany a označte středy tětiv. Rovnoběžky s p těmito středy protnou k v bodech X₁, Y₁ a X₂, Y₂.',
        snapshot: snap(
          ['sol-x1', 'sol-y1', 'sol-x2', 'sol-y2'],
          ['sol-k', 'sol-h', 'sol-chord1', 'sol-chord2'],
        ),
      },
      {
        text: 'Narýsujte obě tětivy X₁Y₁ a X₂Y₂. Úloha má dvě řešení.',
        snapshot: snap(
          ['sol-x1', 'sol-y1', 'sol-x2', 'sol-y2'],
          ['sol-k', 'sol-xy1', 'sol-xy2', 'sol-sm1', 'sol-sm2'],
        ),
      },
    ],
  );
}

/** Kružnice skrz A, B, střed na p. */
function circleThroughTwoPointsSolution(): AssignmentModelSolution {
  const A = { x: 200, y: 140 };
  const B = { x: 480, y: 180 };
  const py = 320;
  const N = mid(A, B);
  const osDir = rot90(sub(B, A));
  const S = lineIntersect(N, osDir, { x: 0, y: py }, { x: 1, y: 0 });
  const os2 = add(N, osDir);

  const allPoints: SolPoint[] = [
    pt('sol-a', A.x, A.y, '', { hidden: true }),
    pt('sol-b', B.x, B.y, '', { hidden: true }),
    pt('sol-n', N.x, N.y, '', { hidden: true }),
    pt('sol-os2', os2.x, os2.y, '', { hidden: true }),
    pt('sol-s', S.x, S.y, 'S'),
  ];
  const allShapes: SolShape[] = [
    ln('sol-os', 'sol-n', 'sol-os2', { dashed: true }),
    seg('sol-ab', 'sol-a', 'sol-b', { thinStroke: true }),
    circle('sol-k', 'sol-s', 'sol-a', 'k'),
  ];
  const snap = (p: string[], s: string[]) => pickSnapshot(allPoints, allShapes, p, s);

  return modelSolution(
    'Množina středů kružnic procházejících A i B je osa úsečky AB. Hledaný střed je její průsečík s přímkou p.',
    [
      {
        text: 'Střed kružnice procházející body A i B leží na ose úsečky AB. Sestrojte osu AB.',
        snapshot: snap(['sol-n'], ['sol-ab', 'sol-os']),
      },
      {
        text: 'Střed S leží zároveň na přímce p. Označte průsečík osy AB s přímkou p písmenem S.',
        snapshot: snap(['sol-s'], ['sol-ab', 'sol-os']),
      },
      {
        text: 'Narýsujte kružnici k se středem S procházející bodem A (prochází i bodem B). Řešení je jediné.',
        snapshot: snap(['sol-s'], ['sol-os', 'sol-k']),
      },
    ],
  );
}

/** Těžnice a rovnoběžka q s AB, C na q. */
function medianAndParallelSolution(): AssignmentModelSolution {
  const A = { x: 140, y: 340 };
  const B = { x: 500, y: 340 };
  const M = { x: 280, y: 240 };
  const qy = 120;
  const N = mid(A, B);
  const C = lineIntersect(N, sub(M, N), { x: 0, y: qy }, { x: 1, y: 0 });
  const n2 = add(N, sub(M, N));

  const allPoints: SolPoint[] = [
    pt('sol-a', A.x, A.y, '', { hidden: true }),
    pt('sol-b', B.x, B.y, '', { hidden: true }),
    pt('sol-m', M.x, M.y, '', { hidden: true }),
    pt('sol-n', N.x, N.y, 'N'),
    pt('sol-c', C.x, C.y, 'C'),
    pt('sol-n2', n2.x, n2.y, '', { hidden: true }),
  ];
  const allShapes: SolShape[] = [
    ln('sol-tc', 'sol-n', 'sol-n2', { dashed: true }),
    seg('sol-ab', 'sol-a', 'sol-b', { thinStroke: true }),
    seg('sol-ac', 'sol-a', 'sol-c'),
    seg('sol-bc', 'sol-b', 'sol-c'),
    seg('sol-cn', 'sol-c', 'sol-n', { thinStroke: true }),
  ];
  const snap = (p: string[], s: string[]) => pickSnapshot(allPoints, allShapes, p, s);

  return modelSolution(
    'Těžnice z C jde ke středu N strany AB a prochází M. C je průsečík přímky NM s rovnoběžkou q.',
    [
      {
        text: 'Těžnice z vrcholu C půlí stranu AB. Sestrojte střed N úsečky AB. Těžnice je přímka NM.',
        snapshot: snap(['sol-n'], ['sol-ab', 'sol-tc']),
      },
      {
        text: 'Vrchol C leží na těžnici i na přímce q. Označte jejich průsečík C.',
        snapshot: snap(['sol-n', 'sol-c'], ['sol-ab', 'sol-tc']),
      },
      {
        text: 'Narýsujte trojúhelník ABC. Řešení je jediné.',
        snapshot: snap(['sol-n', 'sol-c'], ['sol-ab', 'sol-tc', 'sol-ac', 'sol-bc', 'sol-cn']),
      },
    ],
  );
}

/** Pravidelný šestiúhelník ABCDEF z úhlopříčky AD. */
function hexagonFromDiagonalSolution(): AssignmentModelSolution {
  const A = { x: 190, y: 240 };
  const D = { x: 450, y: 240 };
  const O = mid(A, D);
  const R = hypotV(sub(D, O));
  const at = (deg: number): V => {
    const t = (deg * Math.PI) / 180;
    return { x: O.x + R * Math.cos(t), y: O.y + R * Math.sin(t) };
  };
  const Bb = at(120);
  const Cc = at(60);
  const E = at(-60);
  const F = at(-120);
  const rim = { x: O.x + R, y: O.y };

  const allPoints: SolPoint[] = [
    pt('sol-a', A.x, A.y, '', { hidden: true }),
    pt('sol-d', D.x, D.y, '', { hidden: true }),
    pt('sol-o', O.x, O.y, 'O'),
    pt('sol-rim', rim.x, rim.y, '', { hidden: true }),
    pt('sol-b', Bb.x, Bb.y, 'B'),
    pt('sol-c', Cc.x, Cc.y, 'C'),
    pt('sol-e', E.x, E.y, 'E'),
    pt('sol-f', F.x, F.y, 'F'),
  ];
  const allShapes: SolShape[] = [
    circle('sol-k', 'sol-o', 'sol-rim', ''),
    seg('sol-ad', 'sol-a', 'sol-d', { thinStroke: true }),
    seg('sol-ab', 'sol-a', 'sol-b'),
    seg('sol-bc', 'sol-b', 'sol-c'),
    seg('sol-cd', 'sol-c', 'sol-d'),
    seg('sol-de', 'sol-d', 'sol-e'),
    seg('sol-ef', 'sol-e', 'sol-f'),
    seg('sol-fa', 'sol-f', 'sol-a'),
  ];
  const snap = (p: string[], s: string[]) => pickSnapshot(allPoints, allShapes, p, s);

  return modelSolution(
    'Úhlopříčka AD pravidelného šestiúhelníku je průměr opsané kružnice. Střed O je střed AD, poloměr |OA|. Zbývající vrcholy jsou otočení o ±60° a ±120° kolem O.',
    [
      {
        text: 'V pravidelném šestiúhelníku je úhlopříčka spojující protější vrcholy průměrem. Sestrojte střed O úsečky AD a kružnici se středem O a poloměrem |OA|.',
        snapshot: snap(['sol-o'], ['sol-ad', 'sol-k']),
      },
      {
        text: 'Strana šestiúhelníku je rovna poloměru. Na kružnici vyneste od A (a od D) tětivy délky |OA|. Označte B, C, E, F v pořadí kolem kružnice.',
        snapshot: snap(['sol-o', 'sol-b', 'sol-c', 'sol-e', 'sol-f'], ['sol-ad', 'sol-k']),
      },
      {
        text: 'Narýsujte pravidelný šestiúhelník ABCDEF. Řešení je jediné (až na oběh).',
        snapshot: snap(
          ['sol-o', 'sol-b', 'sol-c', 'sol-e', 'sol-f'],
          ['sol-k', 'sol-ab', 'sol-bc', 'sol-cd', 'sol-de', 'sol-ef', 'sol-fa'],
        ),
      },
    ],
  );
}

/** Kružnice tečná k p v A a procházející B. */
function circleTangentToLineSolution(): AssignmentModelSolution {
  const A = { x: 280, y: 340 };
  const B = { x: 400, y: 140 };
  const S = lineIntersect(A, { x: 0, y: 1 }, mid(A, B), rot90(sub(B, A)));

  const allPoints: SolPoint[] = [
    pt('sol-a', A.x, A.y, '', { hidden: true }),
    pt('sol-b', B.x, B.y, '', { hidden: true }),
    pt('sol-s', S.x, S.y, 'S'),
  ];
  const allShapes: SolShape[] = [
    ln('sol-normal', 'sol-a', 'sol-s', { dashed: true }),
    circle('sol-k', 'sol-s', 'sol-a', 'k'),
    seg('sol-sb', 'sol-s', 'sol-b', { thinStroke: true }),
  ];
  const snap = (p: string[], s: string[]) => pickSnapshot(allPoints, allShapes, p, s);

  return modelSolution(
    'Tečna v A je kolmá na poloměr, proto S leží na kolmici k p v bodě A. Zároveň |SA| = |SB|, takže S je průsečík této kolmice s osou úsečky AB.',
    [
      {
        text: 'Kružnice se dotýká přímky p v bodě A, proto je poloměr SA kolmý na p. Sestrojte kolmici k p vedenou bodem A — na ní leží střed S.',
        snapshot: snap(['sol-s'], ['sol-normal']),
      },
      {
        text: 'Kružnice prochází i bodem B, proto |SA| = |SB|. Střed S je ten bod kolmice, který má od A i B stejnou vzdálenost (průsečík kolmice s osou AB). Označte S.',
        snapshot: snap(['sol-s'], ['sol-normal']),
      },
      {
        text: 'Narýsujte kružnici k se středem S procházející bodem A (prochází i bodem B). Řešení je jediné.',
        snapshot: snap(['sol-s'], ['sol-normal', 'sol-k', 'sol-sb']),
      },
    ],
  );
}

/** Trojúhelník z ortocentra V. */
function triangleFromOrthocenterSolution(): AssignmentModelSolution {
  const A = { x: 160, y: 330 };
  const B = { x: 470, y: 330 };
  const V = { x: 310, y: 250 };
  const av2 = add(V, sub(V, A));
  const C = lineIntersect(V, { x: 0, y: 1 }, B, rot90(sub(V, A)));
  const vert = { x: V.x, y: V.y - 80 };
  const bc2 = add(B, rot90(sub(V, A)));

  const allPoints: SolPoint[] = [
    pt('sol-a', A.x, A.y, '', { hidden: true }),
    pt('sol-b', B.x, B.y, '', { hidden: true }),
    pt('sol-v', V.x, V.y, '', { hidden: true }),
    pt('sol-av2', av2.x, av2.y, '', { hidden: true }),
    pt('sol-vert', vert.x, vert.y, '', { hidden: true }),
    pt('sol-bc2', bc2.x, bc2.y, '', { hidden: true }),
    pt('sol-c', C.x, C.y, 'C'),
  ];
  const allShapes: SolShape[] = [
    ln('sol-alt-c', 'sol-v', 'sol-vert', { dashed: true }),
    ln('sol-av', 'sol-a', 'sol-av2', { dashed: true }),
    ln('sol-bc-perp', 'sol-b', 'sol-bc2', { dashed: true }),
    seg('sol-ab', 'sol-a', 'sol-b', { thinStroke: true }),
    seg('sol-ac', 'sol-a', 'sol-c'),
    seg('sol-bc', 'sol-b', 'sol-c'),
  ];
  const snap = (p: string[], s: string[]) => pickSnapshot(allPoints, allShapes, p, s);

  return modelSolution(
    'AB je vodorovná, proto výška z C na AB je svislá a prochází V. Výška z A je přímka AV a je kolmá na BC. Vrchol C je průsečík svislice z V s kolmicí k AV vedenou bodem B.',
    [
      {
        text: 'Strana AB je vodorovná, proto je výška na AB svislá. Ortocentrum V na ní leží, takže vrchol C leží na svislici vedené bodem V.',
        snapshot: snap([], ['sol-ab', 'sol-alt-c']),
      },
      {
        text: 'Výška z A prochází V, proto je AV kolmá na stranu BC. Sestrojte kolmici k AV vedenou bodem B — na ní leží C.',
        snapshot: snap([], ['sol-ab', 'sol-alt-c', 'sol-av', 'sol-bc-perp']),
      },
      {
        text: 'Vrchol C je průsečík svislice z V s kolmicí k AV z B. Narýsujte trojúhelník ABC. Řešení je jediné.',
        snapshot: snap(['sol-c'], ['sol-ab', 'sol-alt-c', 'sol-av', 'sol-ac', 'sol-bc']),
      },
    ],
  );
}

/** Trojúhelník z osy úhlu při A. */
function triangleFromAngleBisectorSolution(): AssignmentModelSolution {
  const A = { x: 160, y: 340 };
  const B = { x: 470, y: 340 };
  const o2 = { x: 430, y: 165 };
  const py = 120;
  const Bp = reflectPoint(B, A, sub(o2, A));
  const C = lineIntersect(A, sub(Bp, A), { x: 0, y: py }, { x: 1, y: 0 });

  const allPoints: SolPoint[] = [
    pt('sol-a', A.x, A.y, '', { hidden: true }),
    pt('sol-b', B.x, B.y, '', { hidden: true }),
    pt('sol-o2', o2.x, o2.y, '', { hidden: true }),
    pt('sol-bp', Bp.x, Bp.y, "B′"),
    pt('sol-c', C.x, C.y, 'C'),
  ];
  const allShapes: SolShape[] = [
    ln('sol-o', 'sol-a', 'sol-o2', { dashed: true, label: 'o' }),
    seg('sol-bbp', 'sol-b', 'sol-bp', { thinStroke: true }),
    ln('sol-abp', 'sol-a', 'sol-bp', { dashed: true }),
    seg('sol-ab', 'sol-a', 'sol-b', { thinStroke: true }),
    seg('sol-ac', 'sol-a', 'sol-c'),
    seg('sol-bc', 'sol-b', 'sol-c'),
  ];
  const snap = (p: string[], s: string[]) => pickSnapshot(allPoints, allShapes, p, s);

  return modelSolution(
    'Osa úhlu je množina bodů stejně vzdálených od ramen. Ekvivalentně: obraz B′ bodu B v osové souměrnosti podle o leží na druhém ramenu AC. C je průsečík AB′ s přímkou p.',
    [
      {
        text: 'Osa úhlu při A je osou souměrnosti ramen AB a AC. Sestrojte obraz B′ bodu B v osové souměrnosti podle přímky o.',
        snapshot: snap(['sol-bp'], ['sol-ab', 'sol-o', 'sol-bbp']),
      },
      {
        text: 'Bod B′ leží na ramenu AC. Přímka AB′ je tedy přímka AC. Vrchol C je její průsečík s přímkou p.',
        snapshot: snap(['sol-bp', 'sol-c'], ['sol-ab', 'sol-o', 'sol-abp']),
      },
      {
        text: 'Narýsujte trojúhelník ABC. Řešení je jediné.',
        snapshot: snap(['sol-bp', 'sol-c'], ['sol-ab', 'sol-o', 'sol-abp', 'sol-ac', 'sol-bc']),
      },
    ],
  );
}

const SOLUTIONS: Record<string, AssignmentModelSolution> = {
  '4a1829f5-69f3-4737-b8e6-8b898b176901': parallelogramLongerDiagonalSolution(),
  '09900fbe-d904-45f1-9450-5f20eaaba23b': squareInscribedInCircleSolution(),
  '03b73633-c003-46dd-a9a3-1cd8253a2fea': isoscelesWithHeightSolution(),
  '29b49708-92f0-4ef6-a947-8f0bdef02451': rectangleWithSideMidpointSolution(),
  '401b7ed6-fd9b-42ab-8ea0-c147657c5ab6': triangleMedianHeightSolution(),
  '519619a4-1076-4da8-b81a-bf1024d9b3a8': isoscelesLegMidpointSolution(),
  '3f73cd7a-f6d9-46ef-a2f2-9f34d1479bbe': squareSideOnLineSolution(),
  '834c4b76-6217-4564-83f5-503900b0c711': isoscelesTrapezoidSolution(),
  '605d7ecd-faf2-474d-a304-3ab328ae5d0e': rhombusDiagonalSolution(),
  'c0376830-b727-477e-9837-48f9f47552b4': rhombusSideSolution(),
  '46725d97-9b34-4003-ae15-c020b22a2704': circleBetweenParallelsSolution(),
  '61f0d7a6-9483-44de-83a8-a1b160fef1f2': centroidTriangleSolution(),
  '656c28a0-9549-4554-8615-d5d3ad388ce1': tangentsToCircleSolution(),
  '3e77b1d1-4a07-4b1a-b49f-a8cd108a8de5': chordOfGivenLengthSolution(),
  'fda41fe6-dfad-4881-be72-771d509ba49f': circleThroughTwoPointsSolution(),
  'c67ac52d-eaea-46b4-8fda-d4dff5d29488': medianAndParallelSolution(),
  'cb596b9e-c109-48f9-874a-90abe34ba852': hexagonFromDiagonalSolution(),
  'a6d9de88-c424-46fa-8af1-814c07a4466e': circleTangentToLineSolution(),
  '66fa2048-f25d-43ce-97ca-491807df805b': triangleFromOrthocenterSolution(),
  '0daeda38-6964-4e93-a3db-745003b63e53': triangleFromAngleBisectorSolution(),
};

export function getAssignmentModelSolution(
  assignmentId: string | undefined,
): AssignmentModelSolution | null {
  if (!assignmentId) return null;
  return SOLUTIONS[assignmentId] ?? null;
}
