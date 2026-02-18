import type { ParameterDef, FaceData, MathProperty } from '../components/geometry/shared';

import { CUBE_PARAMS, computeCubeFaces, computeCubeProperties } from '../components/geometry/cube';
import { CUBOID_PARAMS, computeCuboidFaces, computeCuboidProperties } from '../components/geometry/cuboid';
import { PRISM_PARAMS, computePrismFaces, computePrismProperties } from '../components/geometry/prism';
import { PYRAMID_PARAMS, computePyramidFaces, computePyramidProperties } from '../components/geometry/pyramid';
import { CYLINDER_PARAMS, computeCylinderFaces, computeCylinderProperties } from '../components/geometry/cylinder';
import { CONE_PARAMS, computeConeFaces, computeConeProperties } from '../components/geometry/cone';
import { SPHERE_PARAMS, computeSphereFaces, computeSphereProperties } from '../components/geometry/sphere';

import { SQUARE_PARAMS, computeSquareFaces, computeSquareProperties, computeSquareVertices } from '../components/geometry/square';
import { RECTANGLE_PARAMS, computeRectangleFaces, computeRectangleProperties, computeRectangleVertices } from '../components/geometry/rectangle';
import { TRIANGLE_PARAMS, computeTriangleFaces, computeTriangleProperties, computeTriangleVertices } from '../components/geometry/triangle';
import { CIRCLE2D_PARAMS, computeCircle2DFaces, computeCircle2DProperties, computeCircle2DVertices } from '../components/geometry/circle2d';
import { TRAPEZOID_PARAMS, computeTrapezoidFaces, computeTrapezoidProperties, computeTrapezoidVertices } from '../components/geometry/trapezoid';
import { RHOMBUS_PARAMS, computeRhombusFaces, computeRhombusProperties, computeRhombusVertices } from '../components/geometry/rhombus';

// ── Types ──────────────────────────────────────────────────

export type Category = 'hranate' | 'oble' | 'rovinne';

export interface ObjectDef {
  id: string;
  name: string;
  path: string;
  category: Category;
  grade: string;
  description: string;
  badge: string;
  color: string;       // pastel background for card
  iconName: string;    // lucide icon key
  parameterDefs: ParameterDef[];
  computeFaces: (params: Record<string, number>, unfoldProgress: number) => FaceData[];
  computeProperties: (params: Record<string, number>) => MathProperty[];
  hasUnfold: boolean;
  /** true pro rovinné útvary (čtverec, obdélník, trojúhelník, …) */
  is2D?: boolean;
  /** Výpočet 2D vrcholů pro rovinné útvary */
  computeVertices2D?: (params: Record<string, number>) => { x: number; y: number }[];
}

export interface CategoryDef {
  id: Category;
  title: string;
  description: string;
  bgColor: string;
  previewBg: string;
}

// ── Categories ─────────────────────────────────────────────

export const categories: CategoryDef[] = [
  {
    id: 'hranate',
    title: 'Hranatá tělesa',
    description: 'Krychle, kvádr, hranoly a jehlany — tělesa s rovinnými stěnami a hranami.',
    bgColor: '#dcf3ff',
    previewBg: '#e3f4ff',
  },
  {
    id: 'oble',
    title: 'Oblá tělesa',
    description: 'Válec, kužel a koule — tělesa s křivými plochami.',
    bgColor: '#fff8b3',
    previewBg: '#fefce8',
  },
];

// ── Filter presets ─────────────────────────────────────────

export const filters = [
  { id: 'all', label: 'Vše' },
  { id: 'hranate', label: 'Hranatá tělesa' },
  { id: 'oble', label: 'Oblá tělesa' },
];

// ── Objects ────────────────────────────────────────────────

export const objects: ObjectDef[] = [
  {
    id: 'krychle',
    name: 'Krychle',
    path: '/krychle',
    category: 'hranate',
    grade: '6. ročník',
    description: 'Pravidelné těleso se 6 čtvercovými stěnami a 12 stejně dlouhými hranami.',
    badge: 'Krychle',
    color: '#dcf3ff',
    iconName: 'Box',
    parameterDefs: CUBE_PARAMS,
    computeFaces: computeCubeFaces,
    computeProperties: computeCubeProperties,
    hasUnfold: true,
  },
  {
    id: 'kvadr',
    name: 'Kvádr',
    path: '/kvadr',
    category: 'hranate',
    grade: '6. ročník',
    description: 'Těleso s 6 obdélníkovými stěnami a třemi různými délkami hran.',
    badge: 'Kvádr',
    color: '#f5f8d0',
    iconName: 'BoxSelect',
    parameterDefs: CUBOID_PARAMS,
    computeFaces: computeCuboidFaces,
    computeProperties: computeCuboidProperties,
    hasUnfold: true,
  },
  {
    id: 'hranol',
    name: 'Hranol',
    path: '/hranol',
    category: 'hranate',
    grade: '7. ročník',
    description: 'Těleso se dvěma rovnoběžnými mnohoúhelníkovými podstavami a bočními stěnami.',
    badge: 'Hranol',
    color: '#e8f5e9',
    iconName: 'Hexagon',
    parameterDefs: PRISM_PARAMS,
    computeFaces: computePrismFaces,
    computeProperties: computePrismProperties,
    hasUnfold: true,
  },
  {
    id: 'jehlan',
    name: 'Jehlan',
    path: '/jehlan',
    category: 'hranate',
    grade: '8. ročník',
    description: 'Těleso s mnohoúhelníkovou podstavou a trojúhelníkovými stěnami sbíhajícími do vrcholu.',
    badge: 'Jehlan',
    color: '#fce8f4',
    iconName: 'Triangle',
    parameterDefs: PYRAMID_PARAMS,
    computeFaces: computePyramidFaces,
    computeProperties: computePyramidProperties,
    hasUnfold: true,
  },
  {
    id: 'valec',
    name: 'Válec',
    path: '/valec',
    category: 'oble',
    grade: '8. ročník',
    description: 'Rotační těleso se dvěma kruhovými podstavami a válcovým pláštěm.',
    badge: 'Válec',
    color: '#fff8b3',
    iconName: 'Cylinder',
    parameterDefs: CYLINDER_PARAMS,
    computeFaces: computeCylinderFaces,
    computeProperties: computeCylinderProperties,
    hasUnfold: true,
  },
  {
    id: 'kuzel',
    name: 'Kužel',
    path: '/kuzel',
    category: 'oble',
    grade: '8. ročník',
    description: 'Rotační těleso s kruhovou podstavou a kuželovým pláštěm sbíhajícím do vrcholu.',
    badge: 'Kužel',
    color: '#dcf3ff',
    iconName: 'Cone',
    parameterDefs: CONE_PARAMS,
    computeFaces: computeConeFaces,
    computeProperties: computeConeProperties,
    hasUnfold: true,
  },
  {
    id: 'koule',
    name: 'Koule',
    path: '/koule',
    category: 'oble',
    grade: '8. ročník',
    description: 'Rotační těleso, jehož povrch tvoří množina bodů stejně vzdálených od středu.',
    badge: 'Koule',
    color: '#fce8f4',
    iconName: 'Circle',
    parameterDefs: SPHERE_PARAMS,
    computeFaces: computeSphereFaces,
    computeProperties: computeSphereProperties,
    hasUnfold: false,
  },

  // ── Rovinné útvary ────────────────────────────────────────

  {
    id: 'ctverec',
    name: 'Čtverec',
    path: '/ctverec',
    category: 'rovinne',
    grade: '4.–5. ročník',
    description: 'Rovinný útvar se 4 stejně dlouhými stranami a 4 pravými úhly.',
    badge: 'Čtverec',
    color: '#e0f7fa',
    iconName: 'Square',
    parameterDefs: SQUARE_PARAMS,
    computeFaces: computeSquareFaces,
    computeProperties: computeSquareProperties,
    hasUnfold: false,
    is2D: true,
    computeVertices2D: computeSquareVertices,
  },
  {
    id: 'obdelnik',
    name: 'Obdélník',
    path: '/obdelnik',
    category: 'rovinne',
    grade: '4.–5. ročník',
    description: 'Rovinný útvar se 4 stranami, protější strany jsou stejně dlouhé, 4 pravé úhly.',
    badge: 'Obdélník',
    color: '#fff9c4',
    iconName: 'RectangleHorizontal',
    parameterDefs: RECTANGLE_PARAMS,
    computeFaces: computeRectangleFaces,
    computeProperties: computeRectangleProperties,
    hasUnfold: false,
    is2D: true,
    computeVertices2D: computeRectangleVertices,
  },
  {
    id: 'trojuhelnik',
    name: 'Trojúhelník',
    path: '/trojuhelnik',
    category: 'rovinne',
    grade: '6. ročník',
    description: 'Rovinný útvar se 3 stranami. Obsah = základna · výška : 2.',
    badge: 'Trojúhelník',
    color: '#f3e5f5',
    iconName: 'Triangle',
    parameterDefs: TRIANGLE_PARAMS,
    computeFaces: computeTriangleFaces,
    computeProperties: computeTriangleProperties,
    hasUnfold: false,
    is2D: true,
    computeVertices2D: computeTriangleVertices,
  },
  {
    id: 'kruh2d',
    name: 'Kruh',
    path: '/kruh2d',
    category: 'rovinne',
    grade: '7.–8. ročník',
    description: 'Rovinný útvar – množina bodů do vzdálenosti r od středu. Obvod = 2πr, obsah = πr².',
    badge: 'Kruh',
    color: '#e8eaf6',
    iconName: 'Circle',
    parameterDefs: CIRCLE2D_PARAMS,
    computeFaces: computeCircle2DFaces,
    computeProperties: computeCircle2DProperties,
    hasUnfold: false,
    is2D: true,
    computeVertices2D: computeCircle2DVertices,
  },
  {
    id: 'lichobeznik',
    name: 'Lichoběžník',
    path: '/lichobeznik',
    category: 'rovinne',
    grade: '7. ročník',
    description: 'Čtyřúhelník s jedním párem rovnoběžných stran. Obsah = (a + c) · v : 2.',
    badge: 'Lichoběžník',
    color: '#fce4ec',
    iconName: 'Hexagon',
    parameterDefs: TRAPEZOID_PARAMS,
    computeFaces: computeTrapezoidFaces,
    computeProperties: computeTrapezoidProperties,
    hasUnfold: false,
    is2D: true,
    computeVertices2D: computeTrapezoidVertices,
  },
  {
    id: 'kosoctverec',
    name: 'Kosočtverec',
    path: '/kosoctverec',
    category: 'rovinne',
    grade: '7. ročník',
    description: 'Rovnoběžník se 4 stejně dlouhými stranami. Obsah = strana · výška.',
    badge: 'Kosočtverec',
    color: '#e0f2f1',
    iconName: 'Diamond',
    parameterDefs: RHOMBUS_PARAMS,
    computeFaces: computeRhombusFaces,
    computeProperties: computeRhombusProperties,
    hasUnfold: false,
    is2D: true,
    computeVertices2D: computeRhombusVertices,
  },
];

// ── Helpers ────────────────────────────────────────────────

export function getObjectDef(id: string): ObjectDef | undefined {
  return objects.find((o) => o.id === id);
}

export function getObjectsByCategory(category: Category | 'all'): ObjectDef[] {
  if (category === 'all') return objects;
  return objects.filter((o) => o.category === category);
}
