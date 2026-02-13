import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, XCircle, Lightbulb, RotateCcw } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────

type SquareAnim =
  | 'none'
  | 'trace-perimeter'   // draw outline progressively
  | 'highlight-sides'   // flash each side 1-by-1 with labels
  | 'add-sides'         // show running sum a + a + a + a
  | 'fill-grid'         // fill grid cells one by one
  | 'fill-area';        // animate area fill opacity

type RectAnim =
  | 'none'
  | 'trace-perimeter'
  | 'highlight-sides'
  | 'add-sides'
  | 'fill-grid'
  | 'fill-area';

type CubeAnim =
  | 'none'
  | 'show-cube'
  | 'highlight-dims'
  | 'fill-layers'
  | 'fill-volume'
  | 'highlight-faces';

type CuboidAnim =
  | 'none'
  | 'show-cuboid'
  | 'highlight-dims'
  | 'fill-layers'
  | 'highlight-faces';

type TriangleAnim =
  | 'none'
  | 'trace-perimeter'
  | 'highlight-sides'
  | 'add-sides'
  | 'show-height'
  | 'fill-area'
  | 'fill-grid';

type CircleAnim =
  | 'none'
  | 'trace-circumference'  // draw outline with moving dot
  | 'show-radius'          // highlight radius line + label
  | 'show-diameter'        // highlight diameter line + label
  | 'fill-area'            // smooth opacity fill
  | 'fill-grid'            // grid squares inside circle
  | 'sector-rearrange';    // divide into sectors → rearrange into rectangle

type PyramidAnim =
  | 'none'
  | 'show-pyramid'         // static pyramid view
  | 'highlight-dims'       // animate showing a, v, v_s (base edge, height, slant height)
  | 'highlight-base'       // highlight base face
  | 'highlight-face'       // highlight one triangular face
  | 'highlight-faces'      // cycle through all faces
  | 'fill-volume';         // animate 1/3 of cuboid comparison

type CylinderAnim =
  | 'none'
  | 'show-cylinder'        // static cylinder view
  | 'highlight-dims'       // animate r, v, d
  | 'highlight-base'       // highlight base circle
  | 'highlight-mantle'     // highlight the lateral surface (plášť)
  | 'highlight-parts'      // cycle: base, base, mantle
  | 'unroll-mantle';       // unroll lateral surface into rectangle

type PrismAnim =
  | 'none'
  | 'show-prism'           // static prism view
  | 'highlight-dims'       // animate a, v dimensions
  | 'highlight-base'       // highlight base polygon
  | 'highlight-sides'      // cycle through side faces
  | 'highlight-parts';     // cycle: base, base, sides → all

type ConeAnim =
  | 'none'
  | 'show-cone'            // static cone view
  | 'highlight-dims'       // animate r, v, s
  | 'highlight-base'       // highlight base circle
  | 'highlight-mantle'     // highlight conical surface
  | 'highlight-parts'      // cycle: base, mantle, all
  | 'compare-cylinder';    // show ⅓ of cylinder comparison

type SphereAnim =
  | 'none'
  | 'show-sphere'          // static sphere view
  | 'highlight-radius'     // highlight radius with label
  | 'highlight-diameter'   // highlight diameter
  | 'show-cross-section'   // show great circle cross-section
  | 'show-surface';        // highlight surface area (4 circles)

interface TutorialStep {
  title: string;
  explanation: string;
  squareSide?: number;
  rectA?: number;
  rectB?: number;
  triA?: number;
  triB?: number;
  triApex?: number;   // 0–1: where peak projects onto base (0=left=right-angle, 0.5=isosceles, etc.)
  cubeEdge?: number;
  cuboidA?: number;
  cuboidB?: number;
  cuboidC?: number;
  circleR?: number;
  circleSectors?: number;  // number of sectors for sector-rearrange animation
  pyramidA?: number;       // base edge length
  pyramidH?: number;       // height
  pyramidAnim?: PyramidAnim;
  cylinderR?: number;      // cylinder radius
  cylinderH?: number;      // cylinder height
  cylinderAnim?: CylinderAnim;
  prismSides?: number;     // number of sides (3, 4, 5, 6...)
  prismA?: number;         // base edge length
  prismH?: number;         // height
  prismAnim?: PrismAnim;
  coneR?: number;          // cone radius
  coneH?: number;          // cone height
  coneAnim?: ConeAnim;
  sphereR?: number;        // sphere radius
  sphereAnim?: SphereAnim;
  formula?: string;
  anim?: SquareAnim;
  rectAnim?: RectAnim;
  triAnim?: TriangleAnim;
  cubeAnim?: CubeAnim;
  cuboidAnim?: CuboidAnim;
  circleAnim?: CircleAnim;
  question?: {
    prompt: string;
    correctAnswer: number;
    unit: string;
    hint: string;
  };
}

interface TutorialDef {
  id: string;
  objectName: string;
  taskLabel: string;
  steps: TutorialStep[];
}

// ── Tutorial definitions ───────────────────────────────────

const squareObvodTutorial: TutorialDef = {
  id: 'ctverec2d-obvod',
  objectName: 'Čtverec',
  taskLabel: 'Obvod',
  steps: [
    {
      title: 'Co je obvod?',
      explanation:
        'Obvod je <strong>celková délka hranice</strong> útvaru — jako kdybys obešel čtverec po jeho okraji a změřil, kolik jsi ušel.',
      squareSide: 5,
      anim: 'trace-perimeter',
    },
    {
      title: 'Čtverec má 4 stejné strany',
      explanation:
        'Čtverec je zvláštní tím, že <strong>všechny 4 strany jsou stejně dlouhé</strong>. Říkáme jim délka strany <strong>a</strong>.',
      squareSide: 5,
      anim: 'highlight-sides',
    },
    {
      title: 'Vzorec pro obvod čtverce',
      explanation:
        'Když má čtverec stranu <strong>a</strong>, stačí sečíst délky všech 4 stran:',
      formula: 'O = a + a + a + a = 4 × a',
      squareSide: 5,
      anim: 'add-sides',
    },
    {
      title: 'Příklad: a = 5 cm',
      explanation:
        'Máme čtverec se stranou <strong>a = 5 cm</strong>. Dosadíme do vzorce:',
      formula: 'O = 4 × 5 = 20 cm',
      squareSide: 5,
      anim: 'trace-perimeter',
    },
    {
      title: 'Zkus to sám!',
      explanation: 'Vypočítej obvod čtverce se stranou <strong>a = 7 cm</strong>.',
      squareSide: 7,
      formula: 'O = 4 × a',
      anim: 'none',
      question: {
        prompt: 'Jaký je obvod?',
        correctAnswer: 28,
        unit: 'cm',
        hint: 'Dosaď a = 7 do vzorce O = 4 × a',
      },
    },
    {
      title: 'Další příklad',
      explanation: 'Vypočítej obvod čtverce se stranou <strong>a = 12 cm</strong>.',
      squareSide: 12,
      formula: 'O = 4 × a',
      anim: 'none',
      question: {
        prompt: 'Jaký je obvod?',
        correctAnswer: 48,
        unit: 'cm',
        hint: 'O = 4 × 12 = ?',
      },
    },
  ],
};

const squareObsahTutorial: TutorialDef = {
  id: 'ctverec2d-obsah',
  objectName: 'Čtverec',
  taskLabel: 'Obsah',
  steps: [
    {
      title: 'Co je obsah?',
      explanation:
        'Obsah říká, <strong>jak velkou plochu</strong> útvar zabírá — kolik čtverečních centimetrů se vejde dovnitř.',
      squareSide: 5,
      anim: 'fill-area',
    },
    {
      title: 'Představ si mřížku',
      explanation:
        'Když do čtverce se stranou 5 cm nakreslíš mřížku 1×1 cm, spočítáš <strong>25 malých čtverečků</strong>. To je obsah!',
      squareSide: 5,
      anim: 'fill-grid',
    },
    {
      title: 'Vzorec pro obsah čtverce',
      explanation:
        'Nemusíš čtverečky počítat ručně. Stačí vynásobit stranu samu sebou:',
      formula: 'S = a × a = a²',
      squareSide: 5,
      anim: 'fill-area',
    },
    {
      title: 'Příklad: a = 5 cm',
      explanation:
        'Čtverec se stranou <strong>a = 5 cm</strong>:',
      formula: 'S = 5 × 5 = 25 cm²',
      squareSide: 5,
      anim: 'fill-grid',
    },
    {
      title: 'Zkus to sám!',
      explanation: 'Vypočítej obsah čtverce se stranou <strong>a = 6 cm</strong>.',
      squareSide: 6,
      formula: 'S = a × a',
      anim: 'none',
      question: {
        prompt: 'Jaký je obsah?',
        correctAnswer: 36,
        unit: 'cm²',
        hint: 'Dosaď a = 6 do vzorce S = a × a',
      },
    },
    {
      title: 'Další příklad',
      explanation: 'Vypočítej obsah čtverce se stranou <strong>a = 9 cm</strong>.',
      squareSide: 9,
      formula: 'S = a × a',
      anim: 'none',
      question: {
        prompt: 'Jaký je obsah?',
        correctAnswer: 81,
        unit: 'cm²',
        hint: 'S = 9 × 9 = ?',
      },
    },
  ],
};

const cubeObjemTutorial: TutorialDef = {
  id: 'krychle-objem',
  objectName: 'Krychle',
  taskLabel: 'Objem',
  steps: [
    {
      title: 'Co je objem?',
      explanation:
        'Objem říká, <strong>kolik prostoru</strong> těleso zabírá — kolik malých krychlí (1×1×1 cm) se dovnitř vejde.',
      cubeEdge: 3,
      cubeAnim: 'show-cube',
    },
    {
      title: 'Krychle má 3 stejné rozměry',
      explanation:
        'Krychle má <strong>délku, šířku i výšku stejnou</strong> — všechny hrany mají délku <strong>a</strong>.',
      cubeEdge: 3,
      cubeAnim: 'highlight-dims',
    },
    {
      title: 'Vyplň krychli malými kostkami',
      explanation:
        'Krychle se stranou 3 cm pojme <strong>3 × 3 × 3 = 27 malých kostek</strong>. Sleduj, jak se plní vrstva po vrstvě.',
      cubeEdge: 3,
      cubeAnim: 'fill-layers',
    },
    {
      title: 'Vzorec pro objem krychle',
      explanation:
        'Nemusíš kostky počítat ručně. Stačí vynásobit hranu třikrát:',
      formula: 'V = a × a × a = a³',
      cubeEdge: 3,
      cubeAnim: 'show-cube',
    },
    {
      title: 'Příklad: a = 3 cm',
      explanation:
        'Krychle s hranou <strong>a = 3 cm</strong>:',
      formula: 'V = 3 × 3 × 3 = 27 cm³',
      cubeEdge: 3,
      cubeAnim: 'fill-layers',
    },
    {
      title: 'Zkus to sám!',
      explanation: 'Vypočítej objem krychle s hranou <strong>a = 4 cm</strong>.',
      cubeEdge: 4,
      formula: 'V = a × a × a',
      cubeAnim: 'show-cube',
      question: {
        prompt: 'Jaký je objem?',
        correctAnswer: 64,
        unit: 'cm³',
        hint: 'Dosaď a = 4 → V = 4 × 4 × 4',
      },
    },
    {
      title: 'Další příklad',
      explanation: 'Vypočítej objem krychle s hranou <strong>a = 5 cm</strong>.',
      cubeEdge: 5,
      formula: 'V = a × a × a',
      cubeAnim: 'show-cube',
      question: {
        prompt: 'Jaký je objem?',
        correctAnswer: 125,
        unit: 'cm³',
        hint: 'V = 5 × 5 × 5 = ?',
      },
    },
  ],
};

const cubePovrchuTutorial: TutorialDef = {
  id: 'krychle-povrch',
  objectName: 'Krychle',
  taskLabel: 'Povrch',
  steps: [
    {
      title: 'Co je povrch?',
      explanation:
        'Povrch krychle je <strong>celková plocha všech stěn</strong> — jako bys krychli rozbalil do plochy a změřil, kolik zabírá.',
      cubeEdge: 3, cubeAnim: 'show-cube',
    },
    {
      title: '6 stejných stěn',
      explanation:
        'Krychle má <strong>6 stěn</strong> a všechny jsou stejné — každá je čtverec o straně <strong>a</strong>. Sleduj, jak se postupně zvýrazní.',
      cubeEdge: 3, cubeAnim: 'highlight-faces',
    },
    {
      title: 'Plocha jedné stěny',
      explanation:
        'Jedna stěna je čtverec se stranou <strong>a</strong>, takže její plocha je <strong>a × a = a²</strong>. Krychle má 6 takových stěn.',
      cubeEdge: 3, cubeAnim: 'highlight-faces',
    },
    {
      title: 'Vzorec pro povrch krychle',
      explanation:
        'Stačí spočítat plochu jedné stěny a vynásobit šesti:',
      formula: 'S = 6 · a²',
      cubeEdge: 3, cubeAnim: 'highlight-faces',
    },
    {
      title: 'Příklad: a = 3 cm',
      explanation:
        'Krychle s hranou <strong>a = 3 cm</strong>:',
      formula: 'S = 6 · 3² = 6 · 9 = 54 cm²',
      cubeEdge: 3, cubeAnim: 'highlight-faces',
    },
    {
      title: 'Zkus to sám!',
      explanation:
        'Vypočítej povrch krychle s hranou <strong>a = 4 cm</strong>.',
      cubeEdge: 4, formula: 'S = 6 · a²',
      cubeAnim: 'show-cube',
      question: { prompt: 'Jaký je povrch?', correctAnswer: 96, unit: 'cm²', hint: 'S = 6 · 4² = 6 · 16 = ?' },
    },
    {
      title: 'Další příklad',
      explanation:
        'Vypočítej povrch krychle s hranou <strong>a = 5 cm</strong>.',
      cubeEdge: 5, formula: 'S = 6 · a²',
      cubeAnim: 'show-cube',
      question: { prompt: 'Jaký je povrch?', correctAnswer: 150, unit: 'cm²', hint: 'S = 6 · 5² = 6 · 25 = ?' },
    },
  ],
};

// ── Obdélník ──

const rectObvodTutorial: TutorialDef = {
  id: 'obdelnik-obvod',
  objectName: 'Obdélník',
  taskLabel: 'Obvod',
  steps: [
    {
      title: 'Co je obvod?',
      explanation:
        'Obvod je <strong>celková délka hranice</strong> útvaru — jako kdybys obešel obdélník po okraji.',
      rectA: 6, rectB: 4, rectAnim: 'trace-perimeter',
    },
    {
      title: 'Obdélník má 2 páry stran',
      explanation:
        'Obdélník má <strong>dvě delší strany (a)</strong> a <strong>dvě kratší strany (b)</strong>.',
      rectA: 6, rectB: 4, rectAnim: 'highlight-sides',
    },
    {
      title: 'Vzorec pro obvod obdélníku',
      explanation:
        'Sečteme všechny 4 strany: a + b + a + b, neboli:',
      formula: 'O = 2 × (a + b)',
      rectA: 6, rectB: 4, rectAnim: 'add-sides',
    },
    {
      title: 'Příklad: a = 6 cm, b = 4 cm',
      explanation:
        'Obdélník se stranami <strong>a = 6 cm</strong> a <strong>b = 4 cm</strong>:',
      formula: 'O = 2 × (6 + 4) = 2 × 10 = 20 cm',
      rectA: 6, rectB: 4, rectAnim: 'trace-perimeter',
    },
    {
      title: 'Zkus to sám!',
      explanation: 'Vypočítej obvod obdélníku se stranami <strong>a = 8 cm</strong> a <strong>b = 3 cm</strong>.',
      rectA: 8, rectB: 3, formula: 'O = 2 × (a + b)',
      rectAnim: 'none',
      question: { prompt: 'Jaký je obvod?', correctAnswer: 22, unit: 'cm', hint: 'O = 2 × (8 + 3) = 2 × 11 = ?' },
    },
    {
      title: 'Další příklad',
      explanation: 'Vypočítej obvod obdélníku se stranami <strong>a = 10 cm</strong> a <strong>b = 5 cm</strong>.',
      rectA: 10, rectB: 5, formula: 'O = 2 × (a + b)',
      rectAnim: 'none',
      question: { prompt: 'Jaký je obvod?', correctAnswer: 30, unit: 'cm', hint: 'O = 2 × (10 + 5) = ?' },
    },
  ],
};

const rectObsahTutorial: TutorialDef = {
  id: 'obdelnik-obsah',
  objectName: 'Obdélník',
  taskLabel: 'Obsah',
  steps: [
    {
      title: 'Co je obsah?',
      explanation:
        'Obsah říká, <strong>jak velkou plochu</strong> obdélník zabírá.',
      rectA: 6, rectB: 4, rectAnim: 'fill-area',
    },
    {
      title: 'Představ si mřížku',
      explanation:
        'Do obdélníku 6 × 4 cm se vejde <strong>24 čtverečků</strong> o straně 1 cm. To je obsah!',
      rectA: 6, rectB: 4, rectAnim: 'fill-grid',
    },
    {
      title: 'Vzorec pro obsah obdélníku',
      explanation:
        'Stačí vynásobit stranu <strong>a</strong> stranou <strong>b</strong>:',
      formula: 'S = a × b',
      rectA: 6, rectB: 4, rectAnim: 'fill-area',
    },
    {
      title: 'Příklad: a = 6, b = 4',
      explanation:
        'Obdélník se stranami <strong>a = 6 cm</strong> a <strong>b = 4 cm</strong>:',
      formula: 'S = 6 × 4 = 24 cm²',
      rectA: 6, rectB: 4, rectAnim: 'fill-grid',
    },
    {
      title: 'Zkus to sám!',
      explanation: 'Vypočítej obsah obdélníku se stranami <strong>a = 7 cm</strong> a <strong>b = 5 cm</strong>.',
      rectA: 7, rectB: 5, formula: 'S = a × b',
      rectAnim: 'none',
      question: { prompt: 'Jaký je obsah?', correctAnswer: 35, unit: 'cm²', hint: 'S = 7 × 5 = ?' },
    },
    {
      title: 'Další příklad',
      explanation: 'Vypočítej obsah obdélníku se stranami <strong>a = 9 cm</strong> a <strong>b = 4 cm</strong>.',
      rectA: 9, rectB: 4, formula: 'S = a × b',
      rectAnim: 'none',
      question: { prompt: 'Jaký je obsah?', correctAnswer: 36, unit: 'cm²', hint: 'S = 9 × 4 = ?' },
    },
  ],
};

// ── Kvádr ──

const cuboidObjemTutorial: TutorialDef = {
  id: 'kvadr-objem',
  objectName: 'Kvádr',
  taskLabel: 'Objem',
  steps: [
    {
      title: 'Co je objem?',
      explanation:
        'Objem říká, <strong>kolik prostoru</strong> těleso zabírá — kolik malých kostek 1×1×1 cm se dovnitř vejde.',
      cuboidA: 4, cuboidB: 3, cuboidC: 2, cuboidAnim: 'show-cuboid',
    },
    {
      title: 'Kvádr má 3 různé rozměry',
      explanation:
        'Kvádr má <strong>délku a</strong>, <strong>šířku b</strong> a <strong>výšku c</strong> — mohou být různé.',
      cuboidA: 4, cuboidB: 3, cuboidC: 2, cuboidAnim: 'highlight-dims',
    },
    {
      title: 'Vyplň kvádr malými kostkami',
      explanation:
        'Kvádr 4 × 3 × 2 pojme <strong>4 × 3 × 2 = 24 kostek</strong>. Sleduj, jak se plní.',
      cuboidA: 4, cuboidB: 3, cuboidC: 2, cuboidAnim: 'fill-layers',
    },
    {
      title: 'Vzorec pro objem kvádru',
      explanation:
        'Stačí vynásobit všechny 3 rozměry:',
      formula: 'V = a × b × c',
      cuboidA: 4, cuboidB: 3, cuboidC: 2, cuboidAnim: 'show-cuboid',
    },
    {
      title: 'Příklad: a = 4, b = 3, c = 2',
      explanation:
        'Kvádr s rozměry <strong>4 × 3 × 2 cm</strong>:',
      formula: 'V = 4 × 3 × 2 = 24 cm³',
      cuboidA: 4, cuboidB: 3, cuboidC: 2, cuboidAnim: 'fill-layers',
    },
    {
      title: 'Zkus to sám!',
      explanation: 'Vypočítej objem kvádru s rozměry <strong>a = 5, b = 3, c = 2 cm</strong>.',
      cuboidA: 5, cuboidB: 3, cuboidC: 2, formula: 'V = a × b × c',
      cuboidAnim: 'show-cuboid',
      question: { prompt: 'Jaký je objem?', correctAnswer: 30, unit: 'cm³', hint: 'V = 5 × 3 × 2 = ?' },
    },
    {
      title: 'Další příklad',
      explanation: 'Vypočítej objem kvádru s rozměry <strong>a = 6, b = 4, c = 3 cm</strong>.',
      cuboidA: 6, cuboidB: 4, cuboidC: 3, formula: 'V = a × b × c',
      cuboidAnim: 'show-cuboid',
      question: { prompt: 'Jaký je objem?', correctAnswer: 72, unit: 'cm³', hint: 'V = 6 × 4 × 3 = ?' },
    },
  ],
};

const cuboidPovrchuTutorial: TutorialDef = {
  id: 'kvadr-povrch',
  objectName: 'Kvádr',
  taskLabel: 'Povrch',
  steps: [
    {
      title: 'Co je povrch?',
      explanation:
        'Povrch kvádru je <strong>celková plocha všech stěn</strong> — jako bys ho rozbalil do plochy a změřil, kolik zabírá.',
      cuboidA: 4, cuboidB: 3, cuboidC: 2, cuboidAnim: 'show-cuboid',
    },
    {
      title: '3 páry stěn',
      explanation:
        'Kvádr má <strong>6 stěn</strong> — <strong>3 páry</strong> protilehlých stěn stejné velikosti. Sleduj, jak se postupně zvýrazní.',
      cuboidA: 4, cuboidB: 3, cuboidC: 2, cuboidAnim: 'highlight-faces',
    },
    {
      title: 'Plocha každého páru',
      explanation:
        'Horní + spodní stěna: <strong>a · b</strong>. Přední + zadní: <strong>a · c</strong>. Levá + pravá: <strong>b · c</strong>. Každý pár je tam dvakrát.',
      cuboidA: 4, cuboidB: 3, cuboidC: 2, cuboidAnim: 'highlight-faces',
    },
    {
      title: 'Vzorec pro povrch kvádru',
      explanation:
        'Sečteme plochy všech tří párů a vynásobíme dvěma:',
      formula: 'S = 2 · (a·b + a·c + b·c)',
      cuboidA: 4, cuboidB: 3, cuboidC: 2, cuboidAnim: 'highlight-faces',
    },
    {
      title: 'Příklad: a=4, b=3, c=2',
      explanation:
        'Kvádr s rozměry <strong>a = 4 cm</strong>, <strong>b = 3 cm</strong>, <strong>c = 2 cm</strong>:',
      formula: 'S = 2·(4·3 + 4·2 + 3·2) = 2·(12+8+6) = 2·26 = 52 cm²',
      cuboidA: 4, cuboidB: 3, cuboidC: 2, cuboidAnim: 'highlight-faces',
    },
    {
      title: 'Zkus to sám!',
      explanation:
        'Vypočítej povrch kvádru s rozměry <strong>a = 5 cm</strong>, <strong>b = 3 cm</strong>, <strong>c = 2 cm</strong>.',
      cuboidA: 5, cuboidB: 3, cuboidC: 2, formula: 'S = 2·(a·b + a·c + b·c)',
      cuboidAnim: 'show-cuboid',
      question: { prompt: 'Jaký je povrch?', correctAnswer: 62, unit: 'cm²', hint: 'S = 2·(15 + 10 + 6) = 2·31 = ?' },
    },
    {
      title: 'Další příklad',
      explanation:
        'Vypočítej povrch kvádru s rozměry <strong>a = 6 cm</strong>, <strong>b = 4 cm</strong>, <strong>c = 3 cm</strong>.',
      cuboidA: 6, cuboidB: 4, cuboidC: 3, formula: 'S = 2·(a·b + a·c + b·c)',
      cuboidAnim: 'show-cuboid',
      question: { prompt: 'Jaký je povrch?', correctAnswer: 108, unit: 'cm²', hint: 'S = 2·(24 + 18 + 12) = 2·54 = ?' },
    },
  ],
};

// ── Trojúhelník ──

const triObvodTutorial: TutorialDef = {
  id: 'trojuhelnik-obvod',
  objectName: 'Trojúhelník',
  taskLabel: 'Obvod',
  steps: [
    {
      title: 'Co je obvod?',
      explanation:
        'Obvod je <strong>celková délka hranice</strong> útvaru — jako kdybys obešel trojúhelník po jeho okraji.',
      triA: 6, triB: 4, triAnim: 'trace-perimeter',
    },
    {
      title: 'Trojúhelník má 3 strany',
      explanation:
        'Pravoúhlý trojúhelník má <strong>základnu a</strong>, <strong>výšku b</strong> a <strong>přeponu c</strong> (nejdelší stranu naproti pravému úhlu).',
      triA: 6, triB: 4, triAnim: 'highlight-sides',
    },
    {
      title: 'Vzorec pro obvod trojúhelníku',
      explanation:
        'Sečteme délky všech 3 stran:',
      formula: 'O = a + b + c',
      triA: 6, triB: 4, triAnim: 'add-sides',
    },
    {
      title: 'Příklad: a = 6, b = 4',
      explanation:
        'Přepona c = √(6² + 4²) = √52 ≈ 7.21 cm. Obvod:',
      formula: 'O = 6 + 4 + 7.21 ≈ 17.21 cm',
      triA: 6, triB: 4, triAnim: 'trace-perimeter',
    },
    {
      title: 'Zkus to sám!',
      explanation: 'Pravoúhlý trojúhelník se stranami <strong>a = 3 cm</strong> a <strong>b = 4 cm</strong>. Přepona c = 5 cm.',
      triA: 3, triB: 4, formula: 'O = a + b + c',
      triAnim: 'none',
      question: { prompt: 'Jaký je obvod?', correctAnswer: 12, unit: 'cm', hint: 'O = 3 + 4 + 5 = ?' },
    },
    {
      title: 'Další příklad',
      explanation: 'Pravoúhlý trojúhelník se stranami <strong>a = 5 cm</strong> a <strong>b = 12 cm</strong>. Přepona c = 13 cm.',
      triA: 5, triB: 12, formula: 'O = a + b + c',
      triAnim: 'none',
      question: { prompt: 'Jaký je obvod?', correctAnswer: 30, unit: 'cm', hint: 'O = 5 + 12 + 13 = ?' },
    },
  ],
};

const triObsahTutorial: TutorialDef = {
  id: 'trojuhelnik-obsah',
  objectName: 'Trojúhelník',
  taskLabel: 'Obsah',
  steps: [
    // ── Pravoúhlý trojúhelník ──────────────────────────
    {
      title: 'Co je obsah?',
      explanation:
        'Obsah říká, <strong>jak velkou plochu</strong> trojúhelník zabírá.',
      triA: 6, triB: 4, triAnim: 'fill-area',
    },
    {
      title: 'Polovina obdélníku',
      explanation:
        'Pravoúhlý trojúhelník je <strong>přesně polovina obdélníku</strong> se stranami a × b. Podívej — diagonála obdélníku je přepona!',
      triA: 6, triB: 4, triAnim: 'fill-grid',
    },
    {
      title: 'Vzorec pro obsah trojúhelníku',
      explanation:
        'Obsah je polovina základny krát výška:',
      formula: 'S = a × v / 2',
      triA: 6, triB: 4, triAnim: 'fill-area',
    },
    {
      title: 'Příklad: a = 6, v = 4',
      explanation:
        'Trojúhelník se základnou <strong>a = 6 cm</strong> a výškou <strong>v = 4 cm</strong>:',
      formula: 'S = 6 × 4 / 2 = 12 cm²',
      triA: 6, triB: 4, triAnim: 'fill-grid',
    },

    // ── Rovnoramenný trojúhelník ───────────────────────
    {
      title: 'A co rovnoramenný trojúhelník?',
      explanation:
        'Vzorec funguje pro <strong>každý trojúhelník</strong>, nejen pravoúhlý! U rovnoramenného trojúhelníku potřebujeme znát <strong>výšku v</strong> — kolmici z vrcholu na základnu.',
      triA: 8, triB: 5, triApex: 0.5, triAnim: 'show-height',
    },
    {
      title: 'Stále polovina obdélníku!',
      explanation:
        'I rovnoramenný trojúhelník je přesně <strong>polovina obdélníku</strong> a × v. Podívej se — dvě menší doplňkové části po stranách dohromady tvoří druhou polovinu.',
      triA: 8, triB: 5, triApex: 0.5, triAnim: 'fill-grid',
    },

    // ── Obecný trojúhelník ─────────────────────────────
    {
      title: 'I obecný trojúhelník!',
      explanation:
        'Vzorec <strong>S = a × v / 2</strong> platí úplně vždy. I pro obecný trojúhelník, kde žádný úhel není pravý a strany mají různou délku. Výška v je vždy kolmice z vrcholu na základnu.',
      triA: 7, triB: 5, triApex: 0.35, triAnim: 'fill-grid',
    },

    // ── Procvičování ───────────────────────────────────
    {
      title: 'Zkus to: pravoúhlý',
      explanation: 'Vypočítej obsah <strong>pravoúhlého</strong> trojúhelníku se základnou <strong>a = 8 cm</strong> a výškou <strong>v = 5 cm</strong>.',
      triA: 8, triB: 5, formula: 'S = a × v / 2',
      triAnim: 'none',
      question: { prompt: 'Jaký je obsah?', correctAnswer: 20, unit: 'cm²', hint: 'S = 8 × 5 / 2 = ?' },
    },
    {
      title: 'Zkus to: rovnoramenný',
      explanation: 'Vypočítej obsah <strong>rovnoramenného</strong> trojúhelníku se základnou <strong>a = 10 cm</strong> a výškou <strong>v = 6 cm</strong>.',
      triA: 10, triB: 6, triApex: 0.5, formula: 'S = a × v / 2',
      triAnim: 'none',
      question: { prompt: 'Jaký je obsah?', correctAnswer: 30, unit: 'cm²', hint: 'S = 10 × 6 / 2 = ?' },
    },
    {
      title: 'Zkus to: obecný trojúhelník',
      explanation: 'Vypočítej obsah <strong>obecného</strong> trojúhelníku se základnou <strong>a = 9 cm</strong> a výškou <strong>v = 4 cm</strong>.',
      triA: 9, triB: 4, triApex: 0.35, formula: 'S = a × v / 2',
      triAnim: 'none',
      question: { prompt: 'Jaký je obsah?', correctAnswer: 18, unit: 'cm²', hint: 'S = 9 × 4 / 2 = ?' },
    },
  ],
};

// ── Kruh ──

const circleObvodTutorial: TutorialDef = {
  id: 'kruh2d-obvod',
  objectName: 'Kruh',
  taskLabel: 'Obvod',
  steps: [
    {
      title: 'Co je obvod kruhu?',
      explanation:
        'Obvod kruhu je <strong>délka jeho okraje</strong> — křivka (kružnice), která ho ohraničuje. Říká se mu také <em>obvod kružnice</em>.',
      circleR: 5, circleAnim: 'trace-circumference',
    },
    {
      title: 'Poloměr a průměr',
      explanation:
        'Každý kruh má <strong>poloměr r</strong> — vzdálenost od středu ke kraji. <strong>Průměr d = 2r</strong> prochází celým kruhem přes střed.',
      circleR: 5, circleAnim: 'show-diameter',
    },
    {
      title: 'Číslo π (pí)',
      explanation:
        'Obvod je vždy <strong>přesně π-krát průměr</strong>. Číslo <strong>π ≈ 3,14159…</strong> je matematická konstanta — poměr obvodu k průměru u každého kruhu.',
      circleR: 5, circleAnim: 'show-radius',
    },
    {
      title: 'Vzorec pro obvod kruhu',
      explanation:
        'Obvod vypočítáme jako π-násobek průměru, nebo 2π-násobek poloměru:',
      formula: 'O = π · d = 2 · π · r',
      circleR: 5, circleAnim: 'trace-circumference',
    },
    {
      title: 'Příklad: r = 5 cm',
      explanation:
        'Kruh s poloměrem <strong>r = 5 cm</strong>:',
      formula: 'O = 2 · π · 5 = 10π ≈ 31,42 cm',
      circleR: 5, circleAnim: 'trace-circumference',
    },
    {
      title: 'Zkus to sám!',
      explanation:
        'Vypočítej obvod kruhu s poloměrem <strong>r = 3 cm</strong>. Zaokrouhli na 2 desetinná místa.',
      circleR: 3, formula: 'O = 2 · π · r',
      circleAnim: 'show-radius',
      question: { prompt: 'Jaký je obvod?', correctAnswer: 18.85, unit: 'cm', hint: 'O = 2 · 3,14 · 3 ≈ ?' },
    },
    {
      title: 'Další příklad',
      explanation:
        'Vypočítej obvod kruhu s poloměrem <strong>r = 7 cm</strong>. Zaokrouhli na 2 desetinná místa.',
      circleR: 7, formula: 'O = 2 · π · r',
      circleAnim: 'show-radius',
      question: { prompt: 'Jaký je obvod?', correctAnswer: 43.98, unit: 'cm', hint: 'O = 2 · 3,14 · 7 ≈ ?' },
    },
  ],
};

const circleObsahTutorial: TutorialDef = {
  id: 'kruh2d-obsah',
  objectName: 'Kruh',
  taskLabel: 'Obsah',
  steps: [
    {
      title: 'Co je obsah kruhu?',
      explanation:
        'Obsah říká, <strong>jak velkou plochu</strong> kruh zabírá. Jak ho ale spočítáme?',
      circleR: 5, circleAnim: 'fill-area',
    },
    // ── Sektor rearrangement proof ──
    {
      title: 'Rozdělíme na 4 části…',
      explanation:
        'Kruh rozřízneme na <strong>4 stejné výseče</strong> a přeskládáme je — střídavě nahoru a dolů. Zatím to moc obdélník nepřipomíná…',
      circleR: 5, circleSectors: 4, circleAnim: 'sector-rearrange',
    },
    {
      title: '…na 10 částí…',
      explanation:
        'S <strong>10 výsečemi</strong> to už vypadá víc jako obdélník! <span style="color:#10b981"><strong>Zelená</strong></span> a <span style="color:#e11d48"><strong>červená</strong></span> čára = obvod kruhu (2πr). Každá = polovina = <strong>πr</strong>.',
      circleR: 5, circleSectors: 10, circleAnim: 'sector-rearrange',
    },
    {
      title: '…a na 40 částí → obdélník!',
      explanation:
        'Čím víc výsečí, tím víc to připomíná <strong>obdélník</strong>. Se základnou <span style="color:#10b981"><strong>πr</strong></span> a výškou <span style="color:#f59e0b"><strong>r</strong></span>.',
      circleR: 5, circleSectors: 40, circleAnim: 'sector-rearrange',
    },
    // ── Formula derivation ──
    {
      title: 'Vzorec pro obsah kruhu',
      explanation:
        'Obsah „obdélníku" = základna × výška = <strong>πr × r = πr²</strong>. To je obsah kruhu!',
      formula: 'S = πr × r = π · r²',
      circleR: 5, circleSectors: 40, circleAnim: 'sector-rearrange',
    },
    {
      title: 'Příklad: r = 5 cm',
      explanation:
        'Kruh s poloměrem <strong>r = 5 cm</strong>:',
      formula: 'S = π · 5² = 25π ≈ 78,54 cm²',
      circleR: 5, circleAnim: 'fill-area',
    },
    // ── Practice ──
    {
      title: 'Zkus to sám!',
      explanation:
        'Vypočítej obsah kruhu s poloměrem <strong>r = 3 cm</strong>. Zaokrouhli na 2 desetinná místa.',
      circleR: 3, formula: 'S = π · r²',
      circleAnim: 'show-radius',
      question: { prompt: 'Jaký je obsah?', correctAnswer: 28.27, unit: 'cm²', hint: 'S = π · 9 = 3,14 · 9 ≈ ?' },
    },
    {
      title: 'Další příklad',
      explanation:
        'Vypočítej obsah kruhu s poloměrem <strong>r = 4 cm</strong>. Zaokrouhli na 2 desetinná místa.',
      circleR: 4, formula: 'S = π · r²',
      circleAnim: 'show-radius',
      question: { prompt: 'Jaký je obsah?', correctAnswer: 50.27, unit: 'cm²', hint: 'S = π · 16 = 3,14 · 16 ≈ ?' },
    },
  ],
};

// ── Pyramid tutorials ─────────────────────────────────────

const pyramidObjemTutorial: TutorialDef = {
  id: 'jehlan-objem',
  objectName: 'Jehlan',
  taskLabel: 'Objem',
  steps: [
    {
      title: 'Co je jehlan?',
      explanation:
        'Jehlan je těleso s <strong>mnohoúhelníkovou podstavou</strong> a <strong>trojúhelníkovými bočními stěnami</strong>, které se sbíhají do jednoho vrcholu. My se zaměříme na <strong>čtyřboký jehlan</strong> (se čtvercovou podstavou).',
      pyramidA: 4, pyramidH: 6, pyramidAnim: 'show-pyramid',
    },
    {
      title: 'Rozměry jehlanu',
      explanation:
        'Jehlan popisujeme pomocí: <strong>a</strong> — hrana podstavy, <strong>v</strong> — výška (kolmá vzdálenost od podstavy k vrcholu).',
      pyramidA: 4, pyramidH: 6, pyramidAnim: 'highlight-dims',
    },
    {
      title: 'Jehlan vs. kvádr',
      explanation:
        'Objem jehlanu je přesně <strong>⅓ objemu kvádru</strong> se stejnou podstavou a výškou. Do kvádru o rozměrech a × a × v bychom vešli přesně 3 stejné jehlany.',
      pyramidA: 4, pyramidH: 6, pyramidAnim: 'fill-volume',
    },
    {
      title: 'Vzorec pro objem',
      explanation:
        'Objem jehlanu = třetina obsahu podstavy × výška:',
      formula: 'V = ⅓ · S_p · v = ⅓ · a² · v',
      pyramidA: 4, pyramidH: 6, pyramidAnim: 'show-pyramid',
    },
    {
      title: 'Příklad: a = 4, v = 6',
      explanation:
        'Jehlan se čtvercovou podstavou o hraně <strong>a = 4 cm</strong> a výšce <strong>v = 6 cm</strong>:',
      formula: 'V = ⅓ · 4² · 6 = ⅓ · 16 · 6 = ⅓ · 96 = 32 cm³',
      pyramidA: 4, pyramidH: 6, pyramidAnim: 'highlight-dims',
    },
    {
      title: 'Zkus to sám!',
      explanation:
        'Vypočítej objem jehlanu s podstavou <strong>a = 6 cm</strong> a výškou <strong>v = 9 cm</strong>.',
      pyramidA: 6, pyramidH: 9, formula: 'V = ⅓ · a² · v',
      pyramidAnim: 'show-pyramid',
      question: { prompt: 'Jaký je objem?', correctAnswer: 108, unit: 'cm³', hint: 'V = ⅓ · 36 · 9 = ⅓ · 324 = ?' },
    },
    {
      title: 'Další příklad',
      explanation:
        'Vypočítej objem jehlanu s podstavou <strong>a = 5 cm</strong> a výškou <strong>v = 12 cm</strong>.',
      pyramidA: 5, pyramidH: 12, formula: 'V = ⅓ · a² · v',
      pyramidAnim: 'show-pyramid',
      question: { prompt: 'Jaký je objem?', correctAnswer: 100, unit: 'cm³', hint: 'V = ⅓ · 25 · 12 = ⅓ · 300 = ?' },
    },
  ],
};

const pyramidPovrchuTutorial: TutorialDef = {
  id: 'jehlan-povrch',
  objectName: 'Jehlan',
  taskLabel: 'Povrch',
  steps: [
    {
      title: 'Povrch jehlanu',
      explanation:
        'Povrch jehlanu je <strong>součet plochy podstavy a všech bočních stěn</strong> — jako bys jehlan rozbalil na plochu.',
      pyramidA: 4, pyramidH: 6, pyramidAnim: 'show-pyramid',
    },
    {
      title: 'Podstava',
      explanation:
        'Podstava čtyřbokého jehlanu je <strong>čtverec</strong> o straně <strong>a</strong>. Její obsah je <strong>S_p = a²</strong>.',
      pyramidA: 4, pyramidH: 6, pyramidAnim: 'highlight-base',
    },
    {
      title: 'Boční stěny',
      explanation:
        'Jehlan má <strong>4 trojúhelníkové boční stěny</strong>. Každá má základnu <strong>a</strong> a výšku <strong>v_s</strong> (stěnová výška — šikmá vzdálenost od středu hrany podstavy k vrcholu).',
      pyramidA: 4, pyramidH: 6, pyramidAnim: 'highlight-faces',
    },
    {
      title: 'Stěnová výška v_s',
      explanation:
        'Stěnovou výšku vypočítáme pomocí Pythagorovy věty: <strong>v_s = √(v² + (a/2)²)</strong>, kde v je výška jehlanu a a/2 je polovina podstavné hrany.',
      formula: 'v_s = √(v² + (a/2)²)',
      pyramidA: 4, pyramidH: 6, pyramidAnim: 'highlight-dims',
    },
    {
      title: 'Vzorec pro povrch',
      explanation:
        'Povrch = podstava + 4 boční trojúhelníky:',
      formula: 'S = a² + 4 · ½ · a · v_s = a² + 2 · a · v_s',
      pyramidA: 4, pyramidH: 6, pyramidAnim: 'highlight-faces',
    },
    {
      title: 'Příklad: a = 4, v = 6',
      explanation:
        'Jehlan s <strong>a = 4 cm</strong>, <strong>v = 6 cm</strong>. Nejprve v_s = √(36 + 4) = √40 ≈ 6,32 cm.',
      formula: 'S = 4² + 2·4·6,32 = 16 + 50,6 ≈ 66,6 cm²',
      pyramidA: 4, pyramidH: 6, pyramidAnim: 'highlight-faces',
    },
    {
      title: 'Zkus to sám!',
      explanation:
        'Vypočítej povrch jehlanu s <strong>a = 6 cm</strong>, <strong>v = 4 cm</strong>. Nejprve spočítej v_s = √(16 + 9) = √25 = 5 cm. Zaokrouhli na celé číslo.',
      pyramidA: 6, pyramidH: 4, formula: 'S = a² + 2·a·v_s',
      pyramidAnim: 'show-pyramid',
      question: { prompt: 'Jaký je povrch?', correctAnswer: 96, unit: 'cm²', hint: 'S = 36 + 2·6·5 = 36 + 60 = ?' },
    },
    {
      title: 'Další příklad',
      explanation:
        'Vypočítej povrch jehlanu s <strong>a = 10 cm</strong>, <strong>v = 12 cm</strong>. v_s = √(144 + 25) = √169 = 13 cm.',
      pyramidA: 10, pyramidH: 12, formula: 'S = a² + 2·a·v_s',
      pyramidAnim: 'show-pyramid',
      question: { prompt: 'Jaký je povrch?', correctAnswer: 360, unit: 'cm²', hint: 'S = 100 + 2·10·13 = 100 + 260 = ?' },
    },
  ],
};

// ── Cylinder tutorials ────────────────────────────────────

const cylinderObjemTutorial: TutorialDef = {
  id: 'valec-objem',
  objectName: 'Válec',
  taskLabel: 'Objem',
  steps: [
    {
      title: 'Co je válec?',
      explanation:
        'Válec je těleso se dvěma <strong>kruhovými podstavami</strong> a <strong>zakřiveným pláštěm</strong>. Představ si plechovku nebo roli toaletního papíru.',
      cylinderR: 4, cylinderH: 7, cylinderAnim: 'show-cylinder',
    },
    {
      title: 'Rozměry válce',
      explanation:
        'Válec popisujeme dvěma rozměry: <strong>r</strong> — poloměr podstavy a <strong>v</strong> — výška (vzdálenost mezi podstavami).',
      cylinderR: 4, cylinderH: 7, cylinderAnim: 'highlight-dims',
    },
    {
      title: 'Podstava = kruh',
      explanation:
        'Podstava válce je <strong>kruh</strong> s obsahem <strong>S_p = π · r²</strong>. Válec má dvě stejné podstavy — horní a spodní.',
      cylinderR: 4, cylinderH: 7, cylinderAnim: 'highlight-base',
    },
    {
      title: 'Objem = podstava × výška',
      explanation:
        'Objem válce spočítáme stejně jako u kvádru — obsah podstavy krát výška. Jen místo obdélníku máme kruh:',
      formula: 'V = S_p · v = π · r² · v',
      cylinderR: 4, cylinderH: 7, cylinderAnim: 'show-cylinder',
    },
    {
      title: 'Příklad: r = 4, v = 7',
      explanation:
        'Válec s poloměrem <strong>r = 4 cm</strong> a výškou <strong>v = 7 cm</strong>:',
      formula: 'V = π · 4² · 7 = π · 16 · 7 = 112π ≈ 351,86 cm³',
      cylinderR: 4, cylinderH: 7, cylinderAnim: 'highlight-dims',
    },
    {
      title: 'Zkus to sám!',
      explanation:
        'Vypočítej objem válce s <strong>r = 3 cm</strong> a <strong>v = 10 cm</strong>. Zaokrouhli na 2 desetinná místa.',
      cylinderR: 3, cylinderH: 10, formula: 'V = π · r² · v',
      cylinderAnim: 'show-cylinder',
      question: { prompt: 'Jaký je objem?', correctAnswer: 282.74, unit: 'cm³', hint: 'V = π · 9 · 10 = 90π ≈ ?' },
    },
    {
      title: 'Další příklad',
      explanation:
        'Vypočítej objem válce s <strong>r = 5 cm</strong> a <strong>v = 8 cm</strong>. Zaokrouhli na 2 desetinná místa.',
      cylinderR: 5, cylinderH: 8, formula: 'V = π · r² · v',
      cylinderAnim: 'show-cylinder',
      question: { prompt: 'Jaký je objem?', correctAnswer: 628.32, unit: 'cm³', hint: 'V = π · 25 · 8 = 200π ≈ ?' },
    },
  ],
};

const cylinderPovrchuTutorial: TutorialDef = {
  id: 'valec-povrch',
  objectName: 'Válec',
  taskLabel: 'Povrch',
  steps: [
    {
      title: 'Povrch válce',
      explanation:
        'Povrch válce se skládá ze <strong>3 částí</strong>: dvou kruhových podstav a jednoho zakřiveného pláště.',
      cylinderR: 4, cylinderH: 7, cylinderAnim: 'show-cylinder',
    },
    {
      title: 'Dvě podstavy',
      explanation:
        'Každá podstava je <strong>kruh</strong> o obsahu <strong>π · r²</strong>. Dvě podstavy dohromady mají plochu <strong>2 · π · r²</strong>.',
      cylinderR: 4, cylinderH: 7, cylinderAnim: 'highlight-base',
    },
    {
      title: 'Plášť válce',
      explanation:
        'Plášť je zakřivená boční plocha. Když ho „rozbalíš", vznikne <strong>obdélník</strong> o šířce <strong>2πr</strong> (obvod podstavy) a výšce <strong>v</strong>.',
      cylinderR: 4, cylinderH: 7, cylinderAnim: 'unroll-mantle',
    },
    {
      title: 'Plocha pláště',
      explanation:
        'Plocha pláště = obvod podstavy × výška:',
      formula: 'S_pl = 2 · π · r · v',
      cylinderR: 4, cylinderH: 7, cylinderAnim: 'highlight-mantle',
    },
    {
      title: 'Celkový vzorec',
      explanation:
        'Povrch = 2 podstavy + plášť:',
      formula: 'S = 2·π·r² + 2·π·r·v = 2·π·r·(r + v)',
      cylinderR: 4, cylinderH: 7, cylinderAnim: 'highlight-parts',
    },
    {
      title: 'Příklad: r = 4, v = 7',
      explanation:
        'Válec s <strong>r = 4 cm</strong>, <strong>v = 7 cm</strong>:',
      formula: 'S = 2·π·4·(4+7) = 8π·11 = 88π ≈ 276,46 cm²',
      cylinderR: 4, cylinderH: 7, cylinderAnim: 'highlight-parts',
    },
    {
      title: 'Zkus to sám!',
      explanation:
        'Vypočítej povrch válce s <strong>r = 3 cm</strong>, <strong>v = 5 cm</strong>. Zaokrouhli na 2 desetinná místa.',
      cylinderR: 3, cylinderH: 5, formula: 'S = 2·π·r·(r + v)',
      cylinderAnim: 'show-cylinder',
      question: { prompt: 'Jaký je povrch?', correctAnswer: 150.80, unit: 'cm²', hint: 'S = 2·π·3·(3+5) = 6π·8 = 48π ≈ ?' },
    },
    {
      title: 'Další příklad',
      explanation:
        'Vypočítej povrch válce s <strong>r = 5 cm</strong>, <strong>v = 10 cm</strong>. Zaokrouhli na 2 desetinná místa.',
      cylinderR: 5, cylinderH: 10, formula: 'S = 2·π·r·(r + v)',
      cylinderAnim: 'show-cylinder',
      question: { prompt: 'Jaký je povrch?', correctAnswer: 471.24, unit: 'cm²', hint: 'S = 2·π·5·(5+10) = 10π·15 = 150π ≈ ?' },
    },
  ],
};

// ── Prism tutorials ───────────────────────────────────────

const prismObjemTutorial: TutorialDef = {
  id: 'hranol-objem',
  objectName: 'Hranol',
  taskLabel: 'Objem',
  steps: [
    {
      title: 'Co je hranol?',
      explanation:
        'Hranol je těleso se dvěma <strong>rovnoběžnými mnohoúhelníkovými podstavami</strong> a <strong>obdélníkovými bočními stěnami</strong>. Krychle a kvádr jsou speciální hranoly — my se podíváme na <strong>trojboký hranol</strong> (podstava = trojúhelník).',
      prismSides: 3, prismA: 5, prismH: 8, prismAnim: 'show-prism',
    },
    {
      title: 'Rozměry hranolu',
      explanation:
        'Hranol popisujeme: <strong>a</strong> — hrana podstavy a <strong>v</strong> — výška (vzdálenost mezi podstavami).',
      prismSides: 3, prismA: 5, prismH: 8, prismAnim: 'highlight-dims',
    },
    {
      title: 'Podstava',
      explanation:
        'Podstava trojbokého pravidelného hranolu je <strong>rovnostranný trojúhelník</strong>. Obsah rovnostranného trojúhelníku se stranou <strong>a</strong> je <strong>S_p = (√3/4) · a²</strong>.',
      prismSides: 3, prismA: 5, prismH: 8, prismAnim: 'highlight-base',
    },
    {
      title: 'Vzorec pro objem',
      explanation:
        'Objem hranolu = obsah podstavy × výška — stejný princip jako u kvádru:',
      formula: 'V = S_p · v',
      prismSides: 3, prismA: 5, prismH: 8, prismAnim: 'show-prism',
    },
    {
      title: 'Příklad: a = 5, v = 8',
      explanation:
        'Trojboký hranol s hranou podstavy <strong>a = 5 cm</strong> a výškou <strong>v = 8 cm</strong>. S_p = (√3/4)·25 ≈ 10,83 cm².',
      formula: 'V = 10,83 · 8 ≈ 86,6 cm³',
      prismSides: 3, prismA: 5, prismH: 8, prismAnim: 'highlight-dims',
    },
    {
      title: 'Šestiboký hranol',
      explanation:
        'Stejný vzorec platí pro <strong>jakýkoliv hranol</strong>. Pravidelný šestiúhelník o straně <strong>a</strong> má obsah <strong>S_p = (3√3/2) · a²</strong>.',
      prismSides: 6, prismA: 4, prismH: 7, prismAnim: 'highlight-base',
    },
    {
      title: 'Zkus to sám!',
      explanation:
        'Vypočítej objem trojbokého hranolu s <strong>a = 6 cm</strong> a <strong>v = 10 cm</strong>. S_p = (√3/4)·36 ≈ 15,59 cm². Zaokrouhli na 1 des. místo.',
      prismSides: 3, prismA: 6, prismH: 10, formula: 'V = S_p · v',
      prismAnim: 'show-prism',
      question: { prompt: 'Jaký je objem?', correctAnswer: 155.9, unit: 'cm³', hint: 'V = 15,59 · 10 ≈ ?' },
    },
    {
      title: 'Další příklad',
      explanation:
        'Vypočítej objem šestibokého hranolu s <strong>a = 4 cm</strong>, <strong>v = 7 cm</strong>. S_p = (3√3/2)·16 ≈ 41,57 cm². Zaokrouhli na 1 des. místo.',
      prismSides: 6, prismA: 4, prismH: 7, formula: 'V = S_p · v',
      prismAnim: 'show-prism',
      question: { prompt: 'Jaký je objem?', correctAnswer: 291.0, unit: 'cm³', hint: 'V = 41,57 · 7 ≈ ?' },
    },
  ],
};

const prismPovrchuTutorial: TutorialDef = {
  id: 'hranol-povrch',
  objectName: 'Hranol',
  taskLabel: 'Povrch',
  steps: [
    {
      title: 'Povrch hranolu',
      explanation:
        'Povrch hranolu = <strong>2 podstavy + boční stěny</strong>. U pravidelného hranolu mají všechny boční stěny stejný tvar (obdélník).',
      prismSides: 3, prismA: 5, prismH: 8, prismAnim: 'show-prism',
    },
    {
      title: 'Dvě podstavy',
      explanation:
        'Každá podstava je <strong>pravidelný mnohoúhelník</strong>. Dvě podstavy dohromady mají obsah <strong>2 · S_p</strong>.',
      prismSides: 3, prismA: 5, prismH: 8, prismAnim: 'highlight-base',
    },
    {
      title: 'Boční stěny',
      explanation:
        'Trojboký hranol má <strong>3 obdélníkové boční stěny</strong>, každá o rozměrech <strong>a × v</strong>. Dohromady <strong>S_pl = n · a · v</strong> (n = počet stran, plášť).',
      prismSides: 3, prismA: 5, prismH: 8, prismAnim: 'highlight-sides',
    },
    {
      title: 'Vzorec pro plášť',
      explanation:
        'Plášť = obvod podstavy × výška. Pro pravidelný n-úhelník: obvod = n · a.',
      formula: 'S_pl = o · v = n · a · v',
      prismSides: 3, prismA: 5, prismH: 8, prismAnim: 'highlight-sides',
    },
    {
      title: 'Celkový vzorec',
      explanation:
        'Povrch = 2 podstavy + plášť:',
      formula: 'S = 2 · S_p + n · a · v',
      prismSides: 3, prismA: 5, prismH: 8, prismAnim: 'highlight-parts',
    },
    {
      title: 'Příklad: trojboký, a=5, v=8',
      explanation:
        'S_p = (√3/4)·25 ≈ 10,83 cm². Plášť = 3·5·8 = 120 cm².',
      formula: 'S = 2·10,83 + 120 = 21,66 + 120 ≈ 141,7 cm²',
      prismSides: 3, prismA: 5, prismH: 8, prismAnim: 'highlight-parts',
    },
    {
      title: 'Zkus to sám!',
      explanation:
        'Vypočítej povrch trojbokého hranolu s <strong>a = 6 cm</strong>, <strong>v = 10 cm</strong>. S_p ≈ 15,59 cm². Zaokrouhli na 1 des. místo.',
      prismSides: 3, prismA: 6, prismH: 10, formula: 'S = 2·S_p + n·a·v',
      prismAnim: 'show-prism',
      question: { prompt: 'Jaký je povrch?', correctAnswer: 211.2, unit: 'cm²', hint: 'S = 2·15,59 + 3·6·10 = 31,18 + 180 ≈ ?' },
    },
    {
      title: 'Další příklad',
      explanation:
        'Vypočítej povrch šestibokého hranolu s <strong>a = 4 cm</strong>, <strong>v = 7 cm</strong>. S_p ≈ 41,57 cm². Zaokrouhli na 1 des. místo.',
      prismSides: 6, prismA: 4, prismH: 7, formula: 'S = 2·S_p + n·a·v',
      prismAnim: 'show-prism',
      question: { prompt: 'Jaký je povrch?', correctAnswer: 251.1, unit: 'cm²', hint: 'S = 2·41,57 + 6·4·7 = 83,14 + 168 ≈ ?' },
    },
  ],
};

// ── Cone tutorials ────────────────────────────────────────

const coneObjemTutorial: TutorialDef = {
  id: 'kuzel-objem',
  objectName: 'Kužel',
  taskLabel: 'Objem',
  steps: [
    {
      title: 'Co je kužel?',
      explanation:
        'Kužel je těleso s <strong>kruhovou podstavou</strong> a <strong>zakřiveným pláštěm</strong>, který se sbíhá do jednoho <strong>vrcholu</strong>. Představ si kornout na zmrzlinu.',
      coneR: 4, coneH: 8, coneAnim: 'show-cone',
    },
    {
      title: 'Rozměry kužele',
      explanation:
        'Kužel popisujeme: <strong>r</strong> — poloměr podstavy, <strong>v</strong> — výška (kolmá vzdálenost od podstavy k vrcholu) a <strong>s</strong> — strana (vzdálenost od okraje podstavy k vrcholu).',
      coneR: 4, coneH: 8, coneAnim: 'highlight-dims',
    },
    {
      title: 'Kužel vs. válec',
      explanation:
        'Objem kužele je přesně <strong>⅓ objemu válce</strong> se stejnou podstavou a výškou. Do válce bychom vešli přesně 3 stejné kužely.',
      coneR: 4, coneH: 8, coneAnim: 'compare-cylinder',
    },
    {
      title: 'Vzorec pro objem',
      explanation:
        'Objem kužele = třetina obsahu podstavy × výška:',
      formula: 'V = ⅓ · π · r² · v',
      coneR: 4, coneH: 8, coneAnim: 'show-cone',
    },
    {
      title: 'Příklad: r = 4, v = 8',
      explanation:
        'Kužel s <strong>r = 4 cm</strong> a <strong>v = 8 cm</strong>:',
      formula: 'V = ⅓·π·16·8 = ⅓·128π ≈ 134,04 cm³',
      coneR: 4, coneH: 8, coneAnim: 'highlight-dims',
    },
    {
      title: 'Zkus to sám!',
      explanation:
        'Vypočítej objem kužele s <strong>r = 3 cm</strong>, <strong>v = 10 cm</strong>. Zaokrouhli na 2 desetinná místa.',
      coneR: 3, coneH: 10, formula: 'V = ⅓ · π · r² · v',
      coneAnim: 'show-cone',
      question: { prompt: 'Jaký je objem?', correctAnswer: 94.25, unit: 'cm³', hint: 'V = ⅓·π·9·10 = 30π ≈ ?' },
    },
    {
      title: 'Další příklad',
      explanation:
        'Vypočítej objem kužele s <strong>r = 6 cm</strong>, <strong>v = 9 cm</strong>. Zaokrouhli na 2 desetinná místa.',
      coneR: 6, coneH: 9, formula: 'V = ⅓ · π · r² · v',
      coneAnim: 'show-cone',
      question: { prompt: 'Jaký je objem?', correctAnswer: 339.29, unit: 'cm³', hint: 'V = ⅓·π·36·9 = 108π ≈ ?' },
    },
  ],
};

const conePovrchuTutorial: TutorialDef = {
  id: 'kuzel-povrch',
  objectName: 'Kužel',
  taskLabel: 'Povrch',
  steps: [
    {
      title: 'Povrch kužele',
      explanation:
        'Povrch kužele se skládá ze <strong>2 částí</strong>: kruhové podstavy a kuželového pláště.',
      coneR: 4, coneH: 8, coneAnim: 'show-cone',
    },
    {
      title: 'Podstava',
      explanation:
        'Podstava kužele je <strong>kruh</strong> s obsahem <strong>π · r²</strong>.',
      coneR: 4, coneH: 8, coneAnim: 'highlight-base',
    },
    {
      title: 'Strana kužele (s)',
      explanation:
        'Stranu kužele vypočítáme Pythagorovou větou: <strong>s = √(r² + v²)</strong>.',
      formula: 's = √(r² + v²)',
      coneR: 4, coneH: 8, coneAnim: 'highlight-dims',
    },
    {
      title: 'Plášť kužele',
      explanation:
        'Rozbalený plášť tvoří <strong>výseč kruhu</strong>. Jeho obsah je:',
      formula: 'S_pl = π · r · s',
      coneR: 4, coneH: 8, coneAnim: 'highlight-mantle',
    },
    {
      title: 'Celkový vzorec',
      explanation:
        'Povrch = podstava + plášť:',
      formula: 'S = π·r² + π·r·s = π·r·(r + s)',
      coneR: 4, coneH: 8, coneAnim: 'highlight-parts',
    },
    {
      title: 'Příklad: r = 4, v = 8',
      explanation:
        'Kužel s <strong>r = 4 cm</strong>, <strong>v = 8 cm</strong>. s = √(16+64) = √80 ≈ 8,94 cm.',
      formula: 'S = π·4·(4 + 8,94) = 4π·12,94 ≈ 162,66 cm²',
      coneR: 4, coneH: 8, coneAnim: 'highlight-parts',
    },
    {
      title: 'Zkus to sám!',
      explanation:
        'Kužel s <strong>r = 3 cm</strong>, <strong>v = 4 cm</strong>. s = √(9+16) = √25 = 5 cm. Zaokrouhli na 2 des. místa.',
      coneR: 3, coneH: 4, formula: 'S = π·r·(r + s)',
      coneAnim: 'show-cone',
      question: { prompt: 'Jaký je povrch?', correctAnswer: 75.40, unit: 'cm²', hint: 'S = π·3·(3+5) = π·3·8 = 24π ≈ ?' },
    },
    {
      title: 'Další příklad',
      explanation:
        'Kužel s <strong>r = 5 cm</strong>, <strong>v = 12 cm</strong>. s = √(25+144) = √169 = 13 cm.',
      coneR: 5, coneH: 12, formula: 'S = π·r·(r + s)',
      coneAnim: 'show-cone',
      question: { prompt: 'Jaký je povrch?', correctAnswer: 282.74, unit: 'cm²', hint: 'S = π·5·(5+13) = π·5·18 = 90π ≈ ?' },
    },
  ],
};

// ── Sphere tutorials ──────────────────────────────────────

const sphereObjemTutorial: TutorialDef = {
  id: 'koule-objem',
  objectName: 'Koule',
  taskLabel: 'Objem',
  steps: [
    {
      title: 'Co je koule?',
      explanation:
        'Koule je těleso, kde <strong>každý bod povrchu</strong> má stejnou vzdálenost od středu. Tato vzdálenost je <strong>poloměr r</strong>.',
      sphereR: 5, sphereAnim: 'show-sphere',
    },
    {
      title: 'Poloměr a průměr',
      explanation:
        'Koule má jediný rozměr: <strong>r</strong> (poloměr). Průměr je <strong>d = 2r</strong>.',
      sphereR: 5, sphereAnim: 'highlight-radius',
    },
    {
      title: 'Řez koulí',
      explanation:
        'Pokud kouli rozřízneme středem, dostaneme <strong>hlavní kružnici</strong> (velký kruh) o obsahu <strong>π · r²</strong>. Tato plocha nám pomůže pochopit vzorec.',
      sphereR: 5, sphereAnim: 'show-cross-section',
    },
    {
      title: 'Vzorec pro objem',
      explanation:
        'Objem koule se vypočítá jako:',
      formula: 'V = ⁴⁄₃ · π · r³',
      sphereR: 5, sphereAnim: 'show-sphere',
    },
    {
      title: 'Příklad: r = 5',
      explanation:
        'Koule s poloměrem <strong>r = 5 cm</strong>:',
      formula: 'V = ⁴⁄₃ · π · 5³ = ⁴⁄₃ · π · 125 = ⁵⁰⁰⁄₃ · π ≈ 523,60 cm³',
      sphereR: 5, sphereAnim: 'highlight-radius',
    },
    {
      title: 'Zkus to sám!',
      explanation:
        'Vypočítej objem koule s <strong>r = 3 cm</strong>. Zaokrouhli na 2 desetinná místa.',
      sphereR: 3, formula: 'V = ⁴⁄₃ · π · r³',
      sphereAnim: 'show-sphere',
      question: { prompt: 'Jaký je objem?', correctAnswer: 113.10, unit: 'cm³', hint: 'V = ⁴⁄₃ · π · 27 = 36π ≈ ?' },
    },
    {
      title: 'Další příklad',
      explanation:
        'Vypočítej objem koule s <strong>r = 6 cm</strong>. Zaokrouhli na 2 desetinná místa.',
      sphereR: 6, formula: 'V = ⁴⁄₃ · π · r³',
      sphereAnim: 'show-sphere',
      question: { prompt: 'Jaký je objem?', correctAnswer: 904.78, unit: 'cm³', hint: 'V = ⁴⁄₃ · π · 216 = 288π ≈ ?' },
    },
  ],
};

const spherePovrchuTutorial: TutorialDef = {
  id: 'koule-povrch',
  objectName: 'Koule',
  taskLabel: 'Povrch',
  steps: [
    {
      title: 'Povrch koule',
      explanation:
        'Povrch koule je <strong>plocha celé „slupky"</strong> — jako byste kouli obalili papírem. Koule nemá hrany ani rohy, jen jeden zakřivený povrch.',
      sphereR: 5, sphereAnim: 'show-sphere',
    },
    {
      title: 'Poloměr',
      explanation:
        'Jediný rozměr, který potřebujeme, je <strong>poloměr r</strong>.',
      sphereR: 5, sphereAnim: 'highlight-radius',
    },
    {
      title: 'Povrch = 4 kruhy',
      explanation:
        'Zajímavost: povrch koule má <strong>přesně 4× obsah hlavního kruhu</strong> (řezu středem). Představte si 4 kruhy o ploše π·r², které dohromady pokryjí celou kouli.',
      sphereR: 5, sphereAnim: 'show-surface',
    },
    {
      title: 'Vzorec pro povrch',
      explanation:
        'Povrch koule:',
      formula: 'S = 4 · π · r²',
      sphereR: 5, sphereAnim: 'show-sphere',
    },
    {
      title: 'Příklad: r = 5',
      explanation:
        'Koule s poloměrem <strong>r = 5 cm</strong>:',
      formula: 'S = 4 · π · 25 = 100π ≈ 314,16 cm²',
      sphereR: 5, sphereAnim: 'highlight-radius',
    },
    {
      title: 'Zkus to sám!',
      explanation:
        'Vypočítej povrch koule s <strong>r = 4 cm</strong>. Zaokrouhli na 2 desetinná místa.',
      sphereR: 4, formula: 'S = 4 · π · r²',
      sphereAnim: 'show-sphere',
      question: { prompt: 'Jaký je povrch?', correctAnswer: 201.06, unit: 'cm²', hint: 'S = 4 · π · 16 = 64π ≈ ?' },
    },
    {
      title: 'Další příklad',
      explanation:
        'Vypočítej povrch koule s <strong>r = 7 cm</strong>. Zaokrouhli na 2 desetinná místa.',
      sphereR: 7, formula: 'S = 4 · π · r²',
      sphereAnim: 'show-sphere',
      question: { prompt: 'Jaký je povrch?', correctAnswer: 615.75, unit: 'cm²', hint: 'S = 4 · π · 49 = 196π ≈ ?' },
    },
  ],
};

const TUTORIALS: Record<string, TutorialDef> = {
  'ctverec2d-obvod': squareObvodTutorial,
  'ctverec2d-obsah': squareObsahTutorial,
  'krychle-objem': cubeObjemTutorial,
  'krychle-povrch': cubePovrchuTutorial,
  'obdelnik-obvod': rectObvodTutorial,
  'obdelnik-obsah': rectObsahTutorial,
  'kvadr-objem': cuboidObjemTutorial,
  'kvadr-povrch': cuboidPovrchuTutorial,
  'trojuhelnik-obvod': triObvodTutorial,
  'trojuhelnik-obsah': triObsahTutorial,
  'kruh2d-obvod': circleObvodTutorial,
  'kruh2d-obsah': circleObsahTutorial,
  'jehlan-objem': pyramidObjemTutorial,
  'jehlan-povrch': pyramidPovrchuTutorial,
  'valec-objem': cylinderObjemTutorial,
  'valec-povrch': cylinderPovrchuTutorial,
  'hranol-objem': prismObjemTutorial,
  'hranol-povrch': prismPovrchuTutorial,
  'kuzel-objem': coneObjemTutorial,
  'kuzel-povrch': conePovrchuTutorial,
  'koule-objem': sphereObjemTutorial,
  'koule-povrch': spherePovrchuTutorial,
};

// ── Animated square visualisation ──────────────────────────

const SIDE_COLORS = ['#4d49f3', '#e11d48', '#059669', '#d97706'];

function SquareVis({ side, anim = 'none', stepKey }: { side: number; anim?: SquareAnim; stepKey: number }) {
  const padding = 90;
  const maxDraw = 360;
  const scale = maxDraw / Math.max(side, 1);
  const drawSize = side * scale;
  const svgW = drawSize + padding * 2;
  const svgH = drawSize + padding * 2 + 8;
  const x0 = padding;
  const y0 = padding;

  // Perimeter path: bottom → right → top → left
  const perimeterPath = `M ${x0} ${y0 + drawSize} L ${x0 + drawSize} ${y0 + drawSize} L ${x0 + drawSize} ${y0} L ${x0} ${y0} Z`;
  const perimeterLen = drawSize * 4;

  // Sides as individual segments: bottom, right, top, left
  const sides = [
    { x1: x0, y1: y0 + drawSize, x2: x0 + drawSize, y2: y0 + drawSize, label: 'a', labelPos: 'bottom' as const },
    { x1: x0 + drawSize, y1: y0 + drawSize, x2: x0 + drawSize, y2: y0, label: 'a', labelPos: 'right' as const },
    { x1: x0 + drawSize, y1: y0, x2: x0, y2: y0, label: 'a', labelPos: 'top' as const },
    { x1: x0, y1: y0, x2: x0, y2: y0 + drawSize, label: 'a', labelPos: 'left' as const },
  ];

  // State for highlight-sides & add-sides: which side is active
  const [activeSide, setActiveSide] = useState(-1);
  const [runningSum, setRunningSum] = useState(0);

  // Grid fill state
  const totalCells = side * side;
  const [filledCells, setFilledCells] = useState(0);

  // Area fill state
  const [areaOpacity, setAreaOpacity] = useState(0);

  // Reset on step change
  useEffect(() => {
    setActiveSide(-1);
    setRunningSum(0);
    setFilledCells(0);
    setAreaOpacity(0);
  }, [stepKey]);

  // Animate highlight-sides
  useEffect(() => {
    if (anim !== 'highlight-sides') return;
    setActiveSide(-1);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < 4; i++) {
      timers.push(setTimeout(() => setActiveSide(i), 600 + i * 800));
    }
    timers.push(setTimeout(() => setActiveSide(4), 600 + 4 * 800)); // all done
    return () => timers.forEach(clearTimeout);
  }, [anim, stepKey]);

  // Animate add-sides (show running sum)
  useEffect(() => {
    if (anim !== 'add-sides') return;
    setActiveSide(-1);
    setRunningSum(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < 4; i++) {
      timers.push(
        setTimeout(() => {
          setActiveSide(i);
          setRunningSum((i + 1) * side);
        }, 600 + i * 900)
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [anim, stepKey, side]);

  // Animate fill-grid
  useEffect(() => {
    if (anim !== 'fill-grid') return;
    setFilledCells(0);
    const total = side * side;
    const delay = Math.max(30, 1500 / total); // adapt speed to grid size
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setFilledCells(i);
      if (i >= total) clearInterval(interval);
    }, delay);
    return () => clearInterval(interval);
  }, [anim, stepKey, side]);

  // Animate fill-area (smooth opacity)
  useEffect(() => {
    if (anim !== 'fill-area') return;
    setAreaOpacity(0);
    const start = performance.now();
    const duration = 1500;
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      setAreaOpacity(t);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [anim, stepKey]);

  // Corner dots
  const corners = [
    [x0, y0],
    [x0 + drawSize, y0],
    [x0 + drawSize, y0 + drawSize],
    [x0, y0 + drawSize],
  ];

  // Side label positions
  function sideLabel(idx: number) {
    const s = sides[idx];
    const mx = (s.x1 + s.x2) / 2;
    const my = (s.y1 + s.y2) / 2;
    const off = 32;
    switch (s.labelPos) {
      case 'bottom': return { x: mx, y: my + off + 6, anchor: 'middle' };
      case 'right': return { x: mx + off, y: my, anchor: 'start' };
      case 'top': return { x: mx, y: my - off + 2, anchor: 'middle' };
      case 'left': return { x: mx - off, y: my, anchor: 'end' };
    }
  }

  return (
    <svg key={stepKey} viewBox={`0 0 ${svgW} ${svgH}`} width="100%" style={{ maxWidth: 600, maxHeight: '80vh' }}>
      {/* Base fill */}
      <rect
        x={x0}
        y={y0}
        width={drawSize}
        height={drawSize}
        fill={anim === 'fill-area' ? `rgba(199,210,254,${areaOpacity})` : '#c7d2fe'}
        stroke={anim === 'trace-perimeter' ? 'none' : '#a5b4fc'}
        strokeWidth={1}
        rx={1}
      />

      {/* ─── fill-grid: individual cells ─── */}
      {anim === 'fill-grid' &&
        Array.from({ length: totalCells }).map((_, idx) => {
          const col = idx % side;
          const row = Math.floor(idx / side);
          const filled = idx < filledCells;
          return (
            <rect
              key={idx}
              x={x0 + col * scale + 1}
              y={y0 + row * scale + 1}
              width={scale - 2}
              height={scale - 2}
              rx={2}
              fill={filled ? '#818cf8' : 'transparent'}
              opacity={filled ? 0.7 : 0}
              style={{ transition: 'opacity 150ms ease, fill 150ms ease' }}
            />
          );
        })}

      {/* Grid lines for fill-grid */}
      {anim === 'fill-grid' &&
        Array.from({ length: side - 1 }).map((_, i) => (
          <React.Fragment key={`grid-${i}`}>
            <line x1={x0 + (i + 1) * scale} y1={y0} x2={x0 + (i + 1) * scale} y2={y0 + drawSize} stroke="#6366f1" strokeWidth={0.6} opacity={0.4} />
            <line x1={x0} y1={y0 + (i + 1) * scale} x2={x0 + drawSize} y2={y0 + (i + 1) * scale} stroke="#6366f1" strokeWidth={0.6} opacity={0.4} />
          </React.Fragment>
        ))}

      {/* fill-grid counter */}
      {anim === 'fill-grid' && filledCells > 0 && (
        <text x={x0 + drawSize / 2} y={y0 + drawSize / 2 + 10} textAnchor="middle" fontSize="48" fontWeight={700} fill="#312e81" opacity={0.8}>
          {filledCells}
        </text>
      )}

      {/* ─── trace-perimeter: animated stroke ─── */}
      {anim === 'trace-perimeter' && (
        <>
          <path
            d={perimeterPath}
            fill="none"
            stroke="#4d49f3"
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={perimeterLen}
            strokeDashoffset={perimeterLen}
            style={{ animation: 'tracePerimeter 2.5s ease forwards' }}
          />
          {/* Animated dot */}
          <circle r={5} fill="#e11d48">
            <animateMotion dur="2.5s" fill="freeze" path={perimeterPath} />
          </circle>
          <style>{`
            @keyframes tracePerimeter {
              to { stroke-dashoffset: 0; }
            }
          `}</style>
        </>
      )}

      {/* ─── highlight-sides & add-sides: colored sides ─── */}
      {(anim === 'highlight-sides' || anim === 'add-sides') &&
        sides.map((s, i) => {
          const active = i <= activeSide;
          const current = i === activeSide;
          const lp = sideLabel(i);
          return (
            <React.Fragment key={`side-${i}`}>
              <line
                x1={s.x1}
                y1={s.y1}
                x2={s.x2}
                y2={s.y2}
                stroke={active ? SIDE_COLORS[i] : '#cbd5e1'}
                strokeWidth={current ? 5 : active ? 3.5 : 1.5}
                strokeLinecap="round"
                style={{ transition: 'all 400ms ease' }}
              />
              {active && (
                <text
                  x={lp.x}
                  y={lp.y}
                  textAnchor={lp.anchor}
                  dominantBaseline="middle"
                  fontSize="22"
                  fontWeight={700}
                  fill={SIDE_COLORS[i]}
                  style={{
                    opacity: active ? 1 : 0,
                    transition: 'opacity 400ms ease',
                  }}
                >
                  {side} cm
                </text>
              )}
            </React.Fragment>
          );
        })}

      {/* add-sides: running sum badge */}
      {anim === 'add-sides' && activeSide >= 0 && (
        <g>
          <rect
            x={x0 + drawSize / 2 - 80}
            y={y0 + drawSize / 2 - 22}
            width={160}
            height={44}
            rx={10}
            fill="#312e81"
            opacity={0.9}
          />
          <text
            x={x0 + drawSize / 2}
            y={y0 + drawSize / 2 + 7}
            textAnchor="middle"
            fontSize="26"
            fontWeight={700}
            fill="#fff"
          >
            = {runningSum} cm
          </text>
        </g>
      )}

      {/* Default outline when not tracing or highlighting */}
      {anim !== 'trace-perimeter' && anim !== 'highlight-sides' && anim !== 'add-sides' && (
        <rect x={x0} y={y0} width={drawSize} height={drawSize} fill="none" stroke="#4d49f3" strokeWidth={2.5} rx={1} />
      )}

      {/* Default labels (when not animating sides) */}
      {anim !== 'highlight-sides' && anim !== 'add-sides' && (
        <>
          <text x={x0 + drawSize / 2} y={y0 + drawSize + 42} textAnchor="middle" fontSize="24" fontWeight={600} fill="#4d49f3">
            a = {side} cm
          </text>
          <text x={x0 + drawSize + 28} y={y0 + drawSize / 2} textAnchor="start" fontSize="24" fontWeight={600} fill="#4d49f3" dominantBaseline="middle">
            {side} cm
          </text>
        </>
      )}

      {/* Corner dots */}
      {corners.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={5} fill="#4d49f3" />
      ))}
    </svg>
  );
}

// ── Animated rectangle visualisation ─────────────────────────

const RECT_SIDE_COLORS = ['#4d49f3', '#e11d48', '#4d49f3', '#e11d48']; // a, b, a, b

function RectVis({ sideA, sideB, anim = 'none', stepKey }: { sideA: number; sideB: number; anim?: RectAnim; stepKey: number }) {
  const padding = 90;
  const maxDraw = 340;
  const scaleF = maxDraw / Math.max(sideA, sideB, 1);
  const drawW = sideA * scaleF;
  const drawH = sideB * scaleF;
  const svgW = drawW + padding * 2;
  const svgH = drawH + padding * 2 + 8;
  const x0 = padding;
  const y0 = padding;

  const perimeterPath = `M ${x0} ${y0 + drawH} L ${x0 + drawW} ${y0 + drawH} L ${x0 + drawW} ${y0} L ${x0} ${y0} Z`;
  const perimeterLen = (drawW + drawH) * 2;

  // Sides: bottom(a), right(b), top(a), left(b)
  const sides = [
    { x1: x0, y1: y0 + drawH, x2: x0 + drawW, y2: y0 + drawH, label: 'a', val: sideA, labelPos: 'bottom' as const },
    { x1: x0 + drawW, y1: y0 + drawH, x2: x0 + drawW, y2: y0, label: 'b', val: sideB, labelPos: 'right' as const },
    { x1: x0 + drawW, y1: y0, x2: x0, y2: y0, label: 'a', val: sideA, labelPos: 'top' as const },
    { x1: x0, y1: y0, x2: x0, y2: y0 + drawH, label: 'b', val: sideB, labelPos: 'left' as const },
  ];

  const [activeSide, setActiveSide] = useState(-1);
  const [runningSum, setRunningSum] = useState(0);
  const totalCells = sideA * sideB;
  const [filledCells, setFilledCells] = useState(0);
  const [areaOpacity, setAreaOpacity] = useState(0);

  useEffect(() => { setActiveSide(-1); setRunningSum(0); setFilledCells(0); setAreaOpacity(0); }, [stepKey]);

  useEffect(() => {
    if (anim !== 'highlight-sides') return;
    setActiveSide(-1);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < 4; i++) timers.push(setTimeout(() => setActiveSide(i), 600 + i * 800));
    timers.push(setTimeout(() => setActiveSide(4), 600 + 4 * 800));
    return () => timers.forEach(clearTimeout);
  }, [anim, stepKey]);

  useEffect(() => {
    if (anim !== 'add-sides') return;
    setActiveSide(-1); setRunningSum(0);
    const vals = [sideA, sideB, sideA, sideB];
    let sum = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < 4; i++) {
      sum += vals[i];
      const s = sum;
      timers.push(setTimeout(() => { setActiveSide(i); setRunningSum(s); }, 600 + i * 900));
    }
    return () => timers.forEach(clearTimeout);
  }, [anim, stepKey, sideA, sideB]);

  useEffect(() => {
    if (anim !== 'fill-grid') return;
    setFilledCells(0);
    const total = sideA * sideB;
    const delay = Math.max(30, 1500 / total);
    let i = 0;
    const iv = setInterval(() => { i++; setFilledCells(i); if (i >= total) clearInterval(iv); }, delay);
    return () => clearInterval(iv);
  }, [anim, stepKey, sideA, sideB]);

  useEffect(() => {
    if (anim !== 'fill-area') return;
    setAreaOpacity(0);
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => { const t = Math.min((now - start) / 1500, 1); setAreaOpacity(t); if (t < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [anim, stepKey]);

  const corners = [[x0, y0], [x0 + drawW, y0], [x0 + drawW, y0 + drawH], [x0, y0 + drawH]];

  function sideLabel(idx: number) {
    const s = sides[idx];
    const mx = (s.x1 + s.x2) / 2;
    const my = (s.y1 + s.y2) / 2;
    const off = 32;
    switch (s.labelPos) {
      case 'bottom': return { x: mx, y: my + off + 6, anchor: 'middle' };
      case 'right': return { x: mx + off, y: my, anchor: 'start' };
      case 'top': return { x: mx, y: my - off + 2, anchor: 'middle' };
      case 'left': return { x: mx - off, y: my, anchor: 'end' };
    }
  }

  return (
    <svg key={stepKey} viewBox={`0 0 ${svgW} ${svgH}`} width="100%" style={{ maxWidth: 600, maxHeight: '80vh' }}>
      <rect x={x0} y={y0} width={drawW} height={drawH}
        fill={anim === 'fill-area' ? `rgba(199,210,254,${areaOpacity})` : '#c7d2fe'}
        stroke={anim === 'trace-perimeter' ? 'none' : '#a5b4fc'} strokeWidth={1} rx={1} />

      {anim === 'fill-grid' && Array.from({ length: totalCells }).map((_, idx) => {
        const col = idx % sideA;
        const row = Math.floor(idx / sideA);
        const filled = idx < filledCells;
        return (
          <rect key={idx} x={x0 + col * scaleF + 1} y={y0 + row * scaleF + 1}
            width={scaleF - 2} height={scaleF - 2} rx={2}
            fill={filled ? '#818cf8' : 'transparent'} opacity={filled ? 0.7 : 0}
            style={{ transition: 'opacity 150ms ease, fill 150ms ease' }} />
        );
      })}

      {anim === 'fill-grid' && Array.from({ length: Math.max(sideA, sideB) - 1 }).map((_, i) => (
        <React.Fragment key={`grid-${i}`}>
          {i < sideA - 1 && <line x1={x0 + (i + 1) * scaleF} y1={y0} x2={x0 + (i + 1) * scaleF} y2={y0 + drawH} stroke="#6366f1" strokeWidth={0.6} opacity={0.4} />}
          {i < sideB - 1 && <line x1={x0} y1={y0 + (i + 1) * scaleF} x2={x0 + drawW} y2={y0 + (i + 1) * scaleF} stroke="#6366f1" strokeWidth={0.6} opacity={0.4} />}
        </React.Fragment>
      ))}

      {anim === 'fill-grid' && filledCells > 0 && (
        <text x={x0 + drawW / 2} y={y0 + drawH / 2 + 10} textAnchor="middle" fontSize="48" fontWeight={700} fill="#312e81" opacity={0.8}>
          {filledCells}
        </text>
      )}

      {anim === 'trace-perimeter' && (
        <>
          <path d={perimeterPath} fill="none" stroke="#4d49f3" strokeWidth={4} strokeLinecap="round"
            strokeDasharray={perimeterLen} strokeDashoffset={perimeterLen}
            style={{ animation: 'tracePerimeter 2.5s ease forwards' }} />
          <circle r={5} fill="#e11d48"><animateMotion dur="2.5s" fill="freeze" path={perimeterPath} /></circle>
          <style>{`@keyframes tracePerimeter { to { stroke-dashoffset: 0; } }`}</style>
        </>
      )}

      {(anim === 'highlight-sides' || anim === 'add-sides') && sides.map((s, i) => {
        const active = i <= activeSide;
        const current = i === activeSide;
        const lp = sideLabel(i);
        return (
          <React.Fragment key={`side-${i}`}>
            <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
              stroke={active ? RECT_SIDE_COLORS[i] : '#cbd5e1'}
              strokeWidth={current ? 5 : active ? 3.5 : 1.5}
              strokeLinecap="round" style={{ transition: 'all 400ms ease' }} />
            {active && (
              <text x={lp.x} y={lp.y} textAnchor={lp.anchor} dominantBaseline="middle"
                fontSize="22" fontWeight={700} fill={RECT_SIDE_COLORS[i]}
                style={{ opacity: active ? 1 : 0, transition: 'opacity 400ms ease' }}>
                {s.label} = {s.val} cm
              </text>
            )}
          </React.Fragment>
        );
      })}

      {anim === 'add-sides' && activeSide >= 0 && (
        <g>
          <rect x={x0 + drawW / 2 - 80} y={y0 + drawH / 2 - 22} width={160} height={44} rx={10} fill="#312e81" opacity={0.9} />
          <text x={x0 + drawW / 2} y={y0 + drawH / 2 + 7} textAnchor="middle" fontSize="26" fontWeight={700} fill="#fff">
            = {runningSum} cm
          </text>
        </g>
      )}

      {anim !== 'trace-perimeter' && anim !== 'highlight-sides' && anim !== 'add-sides' && (
        <rect x={x0} y={y0} width={drawW} height={drawH} fill="none" stroke="#4d49f3" strokeWidth={2.5} rx={1} />
      )}

      {anim !== 'highlight-sides' && anim !== 'add-sides' && (
        <>
          <text x={x0 + drawW / 2} y={y0 + drawH + 42} textAnchor="middle" fontSize="24" fontWeight={600} fill="#4d49f3">
            a = {sideA} cm
          </text>
          <text x={x0 + drawW + 28} y={y0 + drawH / 2} textAnchor="start" fontSize="24" fontWeight={600} fill="#e11d48" dominantBaseline="middle">
            b = {sideB} cm
          </text>
        </>
      )}

      {corners.map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r={5} fill="#4d49f3" />)}
    </svg>
  );
}

// ── Animated right-triangle visualisation ────────────────────

const TRI_SIDE_COLORS = ['#4d49f3', '#059669', '#e11d48']; // a (base), b (height), c (hypotenuse)

function TriangleVis({ sideA, sideB, apex = 0, anim = 'none', stepKey }: { sideA: number; sideB: number; apex?: number; anim?: TriangleAnim; stepKey: number }) {
  const padding = 90;
  const maxDraw = 340;
  const scaleF = maxDraw / Math.max(sideA, sideB, 1);
  const drawW = sideA * scaleF;     // base width in px
  const drawH = sideB * scaleF;     // height in px
  const svgW = drawW + padding * 2;
  const svgH = drawH + padding * 2 + 8;
  const x0 = padding;
  const y0 = padding;

  const isRight = apex === 0;

  // Triangle vertices
  const pBL: [number, number] = [x0, y0 + drawH];                        // bottom-left
  const pBR: [number, number] = [x0 + drawW, y0 + drawH];                // bottom-right
  const pApex: [number, number] = [x0 + apex * drawW, y0];               // apex (top vertex)
  const pFoot: [number, number] = [x0 + apex * drawW, y0 + drawH];       // foot of height on base

  // Side lengths in cm
  const apexCm = apex * sideA;
  const leftVal = Math.round(Math.sqrt(apexCm ** 2 + sideB ** 2) * 100) / 100;
  const rightVal = Math.round(Math.sqrt((sideA - apexCm) ** 2 + sideB ** 2) * 100) / 100;

  // Pixel side lengths for perimeter animation
  const leftSidePx = Math.sqrt((pApex[0] - pBL[0]) ** 2 + (pApex[1] - pBL[1]) ** 2);
  const rightSidePx = Math.sqrt((pBR[0] - pApex[0]) ** 2 + (pBR[1] - pApex[1]) ** 2);
  const perimeterLen = drawW + rightSidePx + leftSidePx;

  // Perimeter path: BL → BR → Apex → close
  const perimeterPath = `M ${pBL[0]} ${pBL[1]} L ${pBR[0]} ${pBR[1]} L ${pApex[0]} ${pApex[1]} Z`;

  // Sides for highlight / add-sides animations
  const sides = isRight
    ? [
        { x1: pBL[0], y1: pBL[1], x2: pBR[0], y2: pBR[1], label: 'a', val: sideA, color: TRI_SIDE_COLORS[0], labelPos: 'bottom' as const },
        { x1: pBR[0], y1: pBR[1], x2: pApex[0], y2: pApex[1], label: 'c', val: leftVal, color: TRI_SIDE_COLORS[2], labelPos: 'right' as const },
        { x1: pApex[0], y1: pApex[1], x2: pBL[0], y2: pBL[1], label: 'b', val: sideB, color: TRI_SIDE_COLORS[1], labelPos: 'left' as const },
      ]
    : [
        { x1: pBL[0], y1: pBL[1], x2: pBR[0], y2: pBR[1], label: 'a', val: sideA, color: TRI_SIDE_COLORS[0], labelPos: 'bottom' as const },
        { x1: pBR[0], y1: pBR[1], x2: pApex[0], y2: pApex[1], label: 'b', val: rightVal, color: TRI_SIDE_COLORS[2], labelPos: 'right' as const },
        { x1: pApex[0], y1: pApex[1], x2: pBL[0], y2: pBL[1], label: 'c', val: leftVal, color: TRI_SIDE_COLORS[1], labelPos: 'left' as const },
      ];

  const [activeSide, setActiveSide] = useState(-1);
  const [runningSum, setRunningSum] = useState('');
  const [areaOpacity, setAreaOpacity] = useState(0);
  const [gridProgress, setGridProgress] = useState(0);

  useEffect(() => { setActiveSide(-1); setRunningSum(''); setAreaOpacity(0); setGridProgress(0); }, [stepKey]);

  // highlight-sides
  useEffect(() => {
    if (anim !== 'highlight-sides') return;
    setActiveSide(-1);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < 3; i++) timers.push(setTimeout(() => setActiveSide(i), 600 + i * 900));
    timers.push(setTimeout(() => setActiveSide(3), 600 + 3 * 900));
    return () => timers.forEach(clearTimeout);
  }, [anim, stepKey]);

  // add-sides
  useEffect(() => {
    if (anim !== 'add-sides') return;
    setActiveSide(-1); setRunningSum('');
    const vals = sides.map(s => s.val);
    let sum = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < 3; i++) {
      sum += vals[i];
      const s = Math.round(sum * 100) / 100;
      timers.push(setTimeout(() => { setActiveSide(i); setRunningSum(String(s)); }, 600 + i * 900));
    }
    return () => timers.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anim, stepKey, sideA, sideB]);

  // fill-area
  useEffect(() => {
    if (anim !== 'fill-area') return;
    setAreaOpacity(0);
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => { const t = Math.min((now - start) / 1500, 1); setAreaOpacity(t); if (t < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [anim, stepKey]);

  // fill-grid (animate progress 0→1)
  useEffect(() => {
    if (anim !== 'fill-grid') return;
    setGridProgress(0);
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => { const t = Math.min((now - start) / 2000, 1); setGridProgress(t); if (t < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [anim, stepKey]);

  // show-height (fade-in for height indicator)
  useEffect(() => {
    if (anim !== 'show-height') return;
    setAreaOpacity(0);
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => { const t = Math.min((now - start) / 1200, 1); setAreaOpacity(t); if (t < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [anim, stepKey]);

  function sideLabel(idx: number) {
    const s = sides[idx];
    const mx = (s.x1 + s.x2) / 2;
    const my = (s.y1 + s.y2) / 2;
    const off = 32;
    switch (s.labelPos) {
      case 'bottom': return { x: mx, y: my + off + 6, anchor: 'middle' };
      case 'right': return { x: mx + off + 10, y: my, anchor: 'start' };
      case 'left': return { x: mx - off, y: my, anchor: 'end' };
    }
  }

  // Right-angle marker size
  const raSize = Math.min(16, drawW * 0.12, drawH * 0.12);

  // Direction for height-foot marker (extend toward center of base)
  const markerDir = apex <= 0.5 ? 1 : -1;

  // Centroid of triangle (for label placement)
  const centroidX = (pBL[0] + pBR[0] + pApex[0]) / 3;
  const centroidY = (pBL[1] + pBR[1] + pApex[1]) / 3;

  // Should we show the height line? (non-right only, in relevant anims)
  const showHeightLine = !isRight && (anim === 'fill-grid' || anim === 'fill-area' || anim === 'show-height' || anim === 'none');

  return (
    <svg key={stepKey} viewBox={`0 0 ${svgW} ${svgH}`} width="100%" style={{ maxWidth: 600, maxHeight: '80vh' }}>
      {/* ── fill-grid: show rectangle + triangle as half ── */}
      {anim === 'fill-grid' && (
        <g>
          {/* Full rectangle outline (dashed) */}
          <rect x={x0} y={y0} width={drawW} height={drawH}
            fill="#c7d2fe" fillOpacity={gridProgress * 0.3}
            stroke="#a5b4fc" strokeWidth={1} strokeDasharray="6 4" rx={1} />
          {/* Grid lines */}
          {Array.from({ length: Math.max(sideA, sideB) - 1 }).map((_, i) => (
            <React.Fragment key={`grid-${i}`}>
              {i < sideA - 1 && <line x1={x0 + (i + 1) * scaleF} y1={y0} x2={x0 + (i + 1) * scaleF} y2={y0 + drawH}
                stroke="#6366f1" strokeWidth={0.5} opacity={0.3 * gridProgress} />}
              {i < sideB - 1 && <line x1={x0} y1={y0 + (i + 1) * scaleF} x2={x0 + drawW} y2={y0 + (i + 1) * scaleF}
                stroke="#6366f1" strokeWidth={0.5} opacity={0.3 * gridProgress} />}
            </React.Fragment>
          ))}
          {/* Triangle fill (the actual half) */}
          <polygon points={`${pBL[0]},${pBL[1]} ${pBR[0]},${pBR[1]} ${pApex[0]},${pApex[1]}`}
            fill="#818cf8" fillOpacity={gridProgress * 0.5} />
          {/* Height line for non-right triangles */}
          {!isRight && (
            <>
              <line x1={pApex[0]} y1={pApex[1]} x2={pFoot[0]} y2={pFoot[1]}
                stroke="#e11d48" strokeWidth={2} strokeDasharray="6 4" opacity={gridProgress} />
              {/* Right-angle marker at foot of height */}
              {gridProgress > 0.3 && (
                <polyline
                  points={`${pFoot[0] + markerDir * raSize},${pFoot[1]} ${pFoot[0] + markerDir * raSize},${pFoot[1] - raSize} ${pFoot[0]},${pFoot[1] - raSize}`}
                  fill="none" stroke="#e11d48" strokeWidth={1.5} opacity={0.6} />
              )}
              {/* Height label */}
              {gridProgress > 0.4 && (
                <text x={pApex[0] + (apex <= 0.5 ? 20 : -20)} y={y0 + drawH / 2}
                  textAnchor={apex <= 0.5 ? 'start' : 'end'} dominantBaseline="middle"
                  fontSize="20" fontWeight={700} fill="#e11d48" opacity={gridProgress}>
                  v = {sideB} cm
                </text>
              )}
            </>
          )}
          {/* Label showing "half" */}
          {gridProgress > 0.5 && (
            <text x={centroidX} y={centroidY}
              textAnchor="middle" fontSize="38" fontWeight={700} fill="#312e81" opacity={0.7}>
              ½
            </text>
          )}
        </g>
      )}

      {/* ── Base triangle fill ── */}
      {anim !== 'fill-grid' && (
        <polygon points={`${pBL[0]},${pBL[1]} ${pBR[0]},${pBR[1]} ${pApex[0]},${pApex[1]}`}
          fill={anim === 'fill-area' || anim === 'show-height' ? `rgba(199,210,254,${areaOpacity})` : '#c7d2fe'}
          stroke={anim === 'trace-perimeter' ? 'none' : '#a5b4fc'} strokeWidth={1} />
      )}

      {/* ── Height line for non-right triangles (non-grid anims) ── */}
      {showHeightLine && anim !== 'fill-grid' && (
        <g opacity={anim === 'show-height' ? areaOpacity : 0.8}>
          <line x1={pApex[0]} y1={pApex[1]} x2={pFoot[0]} y2={pFoot[1]}
            stroke="#e11d48" strokeWidth={2} strokeDasharray="6 4" />
          {/* Right-angle marker at foot */}
          <polyline
            points={`${pFoot[0] + markerDir * raSize},${pFoot[1]} ${pFoot[0] + markerDir * raSize},${pFoot[1] - raSize} ${pFoot[0]},${pFoot[1] - raSize}`}
            fill="none" stroke="#e11d48" strokeWidth={1.5} opacity={0.6} />
          {/* Height label */}
          <text x={pApex[0] + (apex <= 0.5 ? 20 : -20)} y={y0 + drawH / 2}
            textAnchor={apex <= 0.5 ? 'start' : 'end'} dominantBaseline="middle"
            fontSize="22" fontWeight={700} fill="#e11d48">
            v = {sideB} cm
          </text>
        </g>
      )}

      {/* ── trace-perimeter ── */}
      {anim === 'trace-perimeter' && (
        <>
          <path d={perimeterPath} fill="none" stroke="#4d49f3" strokeWidth={4} strokeLinecap="round"
            strokeDasharray={perimeterLen} strokeDashoffset={perimeterLen}
            style={{ animation: 'tracePerimeter 2.5s ease forwards' }} />
          <circle r={5} fill="#e11d48">
            <animateMotion dur="2.5s" fill="freeze" path={perimeterPath} />
          </circle>
          <style>{`@keyframes tracePerimeter { to { stroke-dashoffset: 0; } }`}</style>
        </>
      )}

      {/* ── highlight-sides & add-sides ── */}
      {(anim === 'highlight-sides' || anim === 'add-sides') && sides.map((s, i) => {
        const active = i <= activeSide;
        const current = i === activeSide;
        const lp = sideLabel(i);
        return (
          <React.Fragment key={`side-${i}`}>
            <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
              stroke={active ? s.color : '#cbd5e1'}
              strokeWidth={current ? 5 : active ? 3.5 : 1.5}
              strokeLinecap="round" style={{ transition: 'all 400ms ease' }} />
            {active && (
              <text x={lp.x} y={lp.y} textAnchor={lp.anchor} dominantBaseline="middle"
                fontSize="22" fontWeight={700} fill={s.color}
                style={{ opacity: active ? 1 : 0, transition: 'opacity 400ms ease' }}>
                {s.label} = {s.val} cm
              </text>
            )}
          </React.Fragment>
        );
      })}

      {/* add-sides: running sum badge */}
      {anim === 'add-sides' && activeSide >= 0 && (
        <g>
          <rect x={centroidX - 80} y={centroidY - 22} width={160} height={44} rx={10} fill="#312e81" opacity={0.9} />
          <text x={centroidX} y={centroidY + 7} textAnchor="middle" fontSize="26" fontWeight={700} fill="#fff">
            = {runningSum} cm
          </text>
        </g>
      )}

      {/* Default outline */}
      {anim !== 'trace-perimeter' && anim !== 'highlight-sides' && anim !== 'add-sides' && anim !== 'fill-grid' && (
        <polygon points={`${pBL[0]},${pBL[1]} ${pBR[0]},${pBR[1]} ${pApex[0]},${pApex[1]}`}
          fill="none" stroke="#4d49f3" strokeWidth={2.5} strokeLinejoin="round" />
      )}

      {/* Right-angle marker (only for right triangles at bottom-left) */}
      {isRight && (
        <polyline
          points={`${pBL[0] + raSize},${pBL[1]} ${pBL[0] + raSize},${pBL[1] - raSize} ${pBL[0]},${pBL[1] - raSize}`}
          fill="none" stroke="#4d49f3" strokeWidth={1.5} opacity={0.6} />
      )}

      {/* Default labels */}
      {anim !== 'highlight-sides' && anim !== 'add-sides' && (
        <>
          <text x={x0 + drawW / 2} y={y0 + drawH + 42} textAnchor="middle" fontSize="24" fontWeight={600} fill="#4d49f3">
            a = {sideA} cm
          </text>
          {/* For right triangle show "b = …" on the left; for others, height shown via height-line label above */}
          {isRight && (
            <text x={x0 - 28} y={y0 + drawH / 2} textAnchor="end" fontSize="24" fontWeight={600} fill="#059669" dominantBaseline="middle">
              b = {sideB} cm
            </text>
          )}
        </>
      )}

      {/* Corner dots */}
      {[pBL, pBR, pApex].map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r={5} fill="#4d49f3" />)}
    </svg>
  );
}

// ── Circle visualisation ────────────────────────────────────

const CIRCLE_COLORS = { stroke: '#4d49f3', fill: '#c7d2fe', radius: '#e11d48', diameter: '#059669' };

function CircleVis({ radius, sectors = 0, anim = 'none', stepKey }: { radius: number; sectors?: number; anim?: CircleAnim; stepKey: number }) {
  // ── ALL hooks must be declared before any conditional return ──
  const [sectorProgress, setSectorProgress] = useState(0);
  const [areaOpacity, setAreaOpacity] = useState(0);
  const [gridProgress, setGridProgress] = useState(0);
  const [dimOpacity, setDimOpacity] = useState(0);

  useEffect(() => { setAreaOpacity(0); setGridProgress(0); setDimOpacity(0); setSectorProgress(0); }, [stepKey]);

  // sector-rearrange progress
  useEffect(() => {
    if (anim !== 'sector-rearrange') { setSectorProgress(0); return; }
    setSectorProgress(0);
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => { const t = Math.min((now - start) / 1500, 1); setSectorProgress(t); if (t < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [anim, stepKey]);

  // fill-area
  useEffect(() => {
    if (anim !== 'fill-area') return;
    setAreaOpacity(0);
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => { const t = Math.min((now - start) / 1500, 1); setAreaOpacity(t); if (t < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [anim, stepKey]);

  // fill-grid
  useEffect(() => {
    if (anim !== 'fill-grid') return;
    setGridProgress(0);
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => { const t = Math.min((now - start) / 2500, 1); setGridProgress(t); if (t < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [anim, stepKey]);

  // show-radius / show-diameter fade-in
  useEffect(() => {
    if (anim !== 'show-radius' && anim !== 'show-diameter') return;
    setDimOpacity(0);
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => { const t = Math.min((now - start) / 800, 1); setDimOpacity(t); if (t < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [anim, stepKey]);

  // ── sector-rearrange: dedicated dual-view rendering ──────────
  if (anim === 'sector-rearrange' && sectors >= 4) {
    const N = sectors;
    const ha = Math.PI / N;            // half-angle per sector
    const sinHa = Math.sin(ha);
    const cosHa = Math.cos(ha);
    const cR = 110;                      // circle radius in px
    const dx = cR * sinHa;              // horizontal step between adjacent apex/vertex points

    // Rearranged geometry: sectors share straight edges in a zigzag.
    // Sector i has its apex at x = (i+1)*dx.
    // UP (even i): apex at y=yTop, base chord at y=yTop+bandH
    // DOWN (odd i): apex at y=yTop+bandH, top chord at y=yTop
    // Arc extends cR*(1-cosHa) beyond the chord on each side.
    const bandH = cR * cosHa;           // vertical distance between chord lines
    const arcSag = cR * (1 - cosHa);    // how far arc overshoots past the chord
    const totalW = (N + 1) * dx;        // full horizontal extent
    const totalH = bandH + 2 * arcSag;  // full vertical extent (with arc overshoot)

    const pad = 50;
    const gap = 44;
    const svgW = Math.max(2 * cR + 40, totalW + 80) + 2 * pad;
    const svgH = 2 * cR + gap + totalH + 2 * pad + 36;
    const ccx = svgW / 2;
    const ccy = pad + cR;
    const rxOff = (svgW - totalW) / 2;
    const ryOff = ccy + cR + gap + arcSag; // y of the "top chord line" (UP apexes sit here)

    const showLabels = N >= 10;
    const showNumbers = N <= 12;

    return (
      <svg key={stepKey} viewBox={`0 0 ${svgW} ${svgH}`} width="100%" style={{ maxWidth: 560, maxHeight: '82vh' }}>
        {/* ── Circle with sector lines ── */}
        <circle cx={ccx} cy={ccy} r={cR} fill="#c7d2fe" fillOpacity={0.35}
          stroke="#4d49f3" strokeWidth={2} />
        {Array.from({ length: N }).map((_, i) => {
          const angle = (i * 2 * Math.PI) / N - Math.PI / 2;
          return (
            <line key={`sl-${i}`}
              x1={ccx} y1={ccy}
              x2={ccx + cR * Math.cos(angle)} y2={ccy + cR * Math.sin(angle)}
              stroke="#4d49f3" strokeWidth={N > 20 ? 0.5 : 1} strokeOpacity={0.55} />
          );
        })}
        {showNumbers && Array.from({ length: N }).map((_, i) => {
          const midAngle = ((i + 0.5) * 2 * Math.PI) / N - Math.PI / 2;
          const lr = cR * (N <= 6 ? 0.55 : 0.65);
          return (
            <text key={`sn-${i}`}
              x={ccx + lr * Math.cos(midAngle)} y={ccy + lr * Math.sin(midAngle)}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={N <= 6 ? 16 : 11} fontWeight={600} fill="#312e81">
              {i + 1}
            </text>
          );
        })}
        <line x1={ccx} y1={ccy} x2={ccx + cR} y2={ccy}
          stroke="#e11d48" strokeWidth={2} strokeDasharray="4 3" opacity={0.5} />
        <text x={ccx + cR / 2} y={ccy - 10}
          textAnchor="middle" fontSize="13" fontWeight={600} fill="#e11d48" opacity={0.7}>
          r = {radius}
        </text>

        {/* Arrow */}
        <text x={svgW / 2} y={ccy + cR + gap / 2 + 4}
          textAnchor="middle" dominantBaseline="middle" fontSize="22" fill="#94a3b8">↓</text>

        {/* ── Rearranged sectors (edge-sharing zigzag) ── */}
        <g opacity={Math.min(sectorProgress * 2, 1)}>
          {Array.from({ length: N }).map((_, i) => {
            const isUp = i % 2 === 0;
            const fillColor = isUp ? '#818cf8' : '#a5b4fc';
            const sw = N > 30 ? 0.2 : N > 12 ? 0.4 : 0.8;

            // Apex at (i+1)*dx along the arrangement.
            // Adjacent sectors share straight edges forming a zigzag.
            if (isUp) {
              const ax = rxOff + (i + 1) * dx, ay = ryOff;                    // apex (top)
              const lx = rxOff + i * dx,       ly = ryOff + bandH;            // left base
              const rx_ = rxOff + (i + 2) * dx, ry_ = ryOff + bandH;         // right base
              return <path key={`rs-${i}`}
                d={`M${ax.toFixed(1)},${ay.toFixed(1)} L${lx.toFixed(1)},${ly.toFixed(1)} A${cR},${cR} 0 0,0 ${rx_.toFixed(1)},${ry_.toFixed(1)} Z`}
                fill={fillColor} fillOpacity={0.65} stroke="#4d49f3" strokeWidth={sw} strokeLinejoin="round" />;
            } else {
              const ax = rxOff + (i + 1) * dx, ay = ryOff + bandH;           // apex (bottom)
              const lx = rxOff + i * dx,       ly = ryOff;                    // left top
              const rx_ = rxOff + (i + 2) * dx, ry_ = ryOff;                 // right top
              return <path key={`rs-${i}`}
                d={`M${ax.toFixed(1)},${ay.toFixed(1)} L${lx.toFixed(1)},${ly.toFixed(1)} A${cR},${cR} 0 0,1 ${rx_.toFixed(1)},${ry_.toFixed(1)} Z`}
                fill={fillColor} fillOpacity={0.65} stroke="#4d49f3" strokeWidth={sw} strokeLinejoin="round" />;
            }
          })}

          {/* Sector numbers */}
          {showNumbers && Array.from({ length: N }).map((_, i) => {
            const isUp = i % 2 === 0;
            const nx = rxOff + (i + 1) * dx;
            const ny = isUp ? ryOff + bandH * 0.6 : ryOff + bandH * 0.4;
            return (
              <text key={`rn-${i}`} x={nx} y={ny}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={N <= 6 ? 14 : 10} fontWeight={600} fill="#312e81">
                {i + 1}
              </text>
            );
          })}

          {/* Colored edges for larger N */}
          {showLabels && sectorProgress > 0.6 && (
            <g opacity={Math.min((sectorProgress - 0.6) / 0.3, 1)}>
              {/* Bottom edge (green) ≈ πr */}
              <line x1={rxOff + dx} y1={ryOff + bandH + arcSag} x2={rxOff + totalW - dx} y2={ryOff + bandH + arcSag}
                stroke="#10b981" strokeWidth={3.5} strokeLinecap="round" />
              {/* Top edge (rose) ≈ πr */}
              <line x1={rxOff + dx} y1={ryOff - arcSag} x2={rxOff + totalW - dx} y2={ryOff - arcSag}
                stroke="#e11d48" strokeWidth={3.5} strokeLinecap="round" />
              {/* Right edge (orange) = r */}
              <line x1={rxOff + totalW - dx} y1={ryOff - arcSag} x2={rxOff + totalW - dx} y2={ryOff + bandH + arcSag}
                stroke="#f59e0b" strokeWidth={3.5} strokeLinecap="round" />
            </g>
          )}

          {/* Dimension labels */}
          {showLabels && sectorProgress > 0.7 && (() => {
            const bx1 = rxOff + dx, bx2 = rxOff + totalW - dx;
            const midX = (bx1 + bx2) / 2;
            const bottomY = ryOff + bandH + arcSag;
            const rightX = bx2;
            const midY = ryOff + bandH / 2;
            return (
              <g opacity={Math.min((sectorProgress - 0.7) / 0.3, 1)}>
                <rect x={midX - 42} y={bottomY + 10} width={84} height={22} rx={11} fill="#10b981" opacity={0.92} />
                <text x={midX} y={bottomY + 22} textAnchor="middle" dominantBaseline="middle"
                  fontSize="13" fontWeight={700} fill="#fff">
                  πr ≈ {Math.round(Math.PI * radius * 100) / 100}
                </text>
                <rect x={rightX + 8} y={midY - 11} width={60} height={22} rx={11} fill="#f59e0b" opacity={0.92} />
                <text x={rightX + 38} y={midY + 1} textAnchor="middle" dominantBaseline="middle"
                  fontSize="13" fontWeight={700} fill="#fff">
                  r = {radius}
                </text>
              </g>
            );
          })()}
        </g>
      </svg>
    );
  }

  // ── Standard circle animations ────────────────────────────
  const padding = 100;
  const maxDraw = 300;
  const scaleF = maxDraw / (2 * Math.max(radius, 1));
  const drawR = radius * scaleF;
  const svgSize = drawR * 2 + padding * 2;
  const cx = svgSize / 2;
  const cy = svgSize / 2;

  const circumference = 2 * Math.PI * drawR;
  const circumferenceCm = Math.round(2 * Math.PI * radius * 100) / 100;
  const areaCm = Math.round(Math.PI * radius * radius * 100) / 100;

  // (all hooks declared at top of function — no duplicates here)

  // Grid cells for fill-grid
  function renderGrid() {
    const cellSize = scaleF; // 1 cm in pixels
    const cells: React.ReactNode[] = [];
    const gridRadius = Math.ceil(radius);
    let insideCount = 0;
    const totalCells = (2 * gridRadius) * (2 * gridRadius);
    const cellsToShow = Math.floor(gridProgress * totalCells);

    let idx = 0;
    for (let gy = -gridRadius; gy < gridRadius; gy++) {
      for (let gx = -gridRadius; gx < gridRadius; gx++) {
        idx++;
        // Center of this cell
        const cellCx = (gx + 0.5);
        const cellCy = (gy + 0.5);
        const dist = Math.sqrt(cellCx * cellCx + cellCy * cellCy);
        const inside = dist <= radius;
        if (inside) insideCount++;

        const px = cx + gx * cellSize;
        const py = cy + gy * cellSize;

        if (idx > cellsToShow) continue;

        cells.push(
          <rect key={`${gx}-${gy}`}
            x={px} y={py} width={cellSize} height={cellSize}
            fill={inside ? '#818cf8' : '#e2e8f0'}
            fillOpacity={inside ? 0.45 : 0.2}
            stroke="#a5b4fc" strokeWidth={0.5} strokeOpacity={0.4} />
        );
      }
    }

    return (
      <g>
        {cells}
        {/* Circle outline on top */}
        <circle cx={cx} cy={cy} r={drawR}
          fill="none" stroke={CIRCLE_COLORS.stroke} strokeWidth={2.5} />
        {/* Counter badge */}
        {gridProgress > 0.5 && (
          <g>
            <rect x={cx - 55} y={cy - 14} width={110} height={28} rx={14} fill="#312e81" opacity={0.9} />
            <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
              fontSize="14" fontWeight={700} fill="#fff">
              ≈ {insideCount} čtverců
            </text>
          </g>
        )}
      </g>
    );
  }

  return (
    <svg key={stepKey} viewBox={`0 0 ${svgSize} ${svgSize}`} width="100%" style={{ maxWidth: 520, maxHeight: '80vh' }}>
      {/* ── fill-grid mode ── */}
      {anim === 'fill-grid' && renderGrid()}

      {/* ── Base circle fill ── */}
      {anim !== 'fill-grid' && (
        <circle cx={cx} cy={cy} r={drawR}
          fill={anim === 'fill-area' ? `rgba(199,210,254,${areaOpacity})` : CIRCLE_COLORS.fill}
          stroke={anim === 'trace-circumference' ? 'none' : '#a5b4fc'} strokeWidth={1} />
      )}

      {/* ── trace-circumference ── */}
      {anim === 'trace-circumference' && (
        <>
          <circle cx={cx} cy={cy} r={drawR}
            fill="none" stroke={CIRCLE_COLORS.stroke} strokeWidth={4} strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={circumference}
            style={{ animation: 'traceCircle 2.5s ease forwards' }}
            transform={`rotate(-90 ${cx} ${cy})`} />
          {/* Moving dot */}
          <circle r={5} fill="#e11d48">
            <animateMotion dur="2.5s" fill="freeze"
              path={`M ${cx} ${cy - drawR} A ${drawR} ${drawR} 0 1 1 ${cx - 0.001} ${cy - drawR}`} />
          </circle>
          <style>{`@keyframes traceCircle { to { stroke-dashoffset: 0; } }`}</style>
        </>
      )}

      {/* ── Default circle outline ── */}
      {anim !== 'trace-circumference' && anim !== 'fill-grid' && (
        <circle cx={cx} cy={cy} r={drawR}
          fill="none" stroke={CIRCLE_COLORS.stroke} strokeWidth={2.5} />
      )}

      {/* ── show-radius ── */}
      {(anim === 'show-radius' || anim === 'none' || anim === 'fill-area') && (
        <g opacity={anim === 'show-radius' ? dimOpacity : 0.7}>
          <line x1={cx} y1={cy} x2={cx + drawR} y2={cy}
            stroke={CIRCLE_COLORS.radius} strokeWidth={3} strokeLinecap="round" />
          {/* Radius label */}
          <g>
            <rect x={cx + drawR / 2 - 38} y={cy - 30} width={76} height={24} rx={12} fill={CIRCLE_COLORS.radius} opacity={0.92} />
            <text x={cx + drawR / 2} y={cy - 17} textAnchor="middle" dominantBaseline="middle"
              fontSize="14" fontWeight={700} fill="#fff">
              r = {radius} cm
            </text>
          </g>
          {/* Center dot */}
          <circle cx={cx} cy={cy} r={4} fill={CIRCLE_COLORS.radius} />
        </g>
      )}

      {/* ── show-diameter ── */}
      {anim === 'show-diameter' && (
        <g opacity={dimOpacity}>
          <line x1={cx - drawR} y1={cy} x2={cx + drawR} y2={cy}
            stroke={CIRCLE_COLORS.diameter} strokeWidth={3} strokeLinecap="round" />
          {/* Diameter label */}
          <g>
            <rect x={cx - 48} y={cy - 32} width={96} height={24} rx={12} fill={CIRCLE_COLORS.diameter} opacity={0.92} />
            <text x={cx} y={cy - 19} textAnchor="middle" dominantBaseline="middle"
              fontSize="14" fontWeight={700} fill="#fff">
              d = {radius * 2} cm
            </text>
          </g>
          {/* Also show radius as secondary */}
          <line x1={cx} y1={cy} x2={cx + drawR} y2={cy}
            stroke={CIRCLE_COLORS.radius} strokeWidth={2} strokeDasharray="4 3" strokeLinecap="round" opacity={0.6} />
          <g opacity={0.7}>
            <rect x={cx + drawR / 2 - 32} y={cy + 12} width={64} height={20} rx={10} fill={CIRCLE_COLORS.radius} opacity={0.85} />
            <text x={cx + drawR / 2} y={cy + 23} textAnchor="middle" dominantBaseline="middle"
              fontSize="12" fontWeight={600} fill="#fff">
              r = {radius} cm
            </text>
          </g>
          {/* Center dot */}
          <circle cx={cx} cy={cy} r={4} fill={CIRCLE_COLORS.diameter} />
          {/* Edge dots */}
          <circle cx={cx - drawR} cy={cy} r={4} fill={CIRCLE_COLORS.diameter} />
          <circle cx={cx + drawR} cy={cy} r={4} fill={CIRCLE_COLORS.diameter} />
        </g>
      )}

      {/* ── Default labels (when no special dim anim) ── */}
      {anim !== 'show-radius' && anim !== 'show-diameter' && anim !== 'fill-grid' && (
        <>
          {/* Circumference / Area badge at bottom */}
          {anim === 'fill-area' && areaOpacity > 0.6 && (
            <g>
              <rect x={cx - 55} y={cy + drawR + 28} width={110} height={26} rx={13} fill="#312e81" opacity={0.9} />
              <text x={cx} y={cy + drawR + 42} textAnchor="middle" dominantBaseline="middle"
                fontSize="13" fontWeight={600} fill="#fff">
                S ≈ {areaCm} cm²
              </text>
            </g>
          )}
          {anim === 'trace-circumference' && (
            <g>
              <rect x={cx - 55} y={cy + drawR + 28} width={110} height={26} rx={13} fill="#312e81" opacity={0.9} />
              <text x={cx} y={cy + drawR + 42} textAnchor="middle" dominantBaseline="middle"
                fontSize="13" fontWeight={600} fill="#fff">
                O ≈ {circumferenceCm} cm
              </text>
            </g>
          )}
        </>
      )}

      {/* Center dot (always, subtle) */}
      {anim !== 'show-radius' && anim !== 'show-diameter' && (
        <circle cx={cx} cy={cy} r={3} fill={CIRCLE_COLORS.stroke} opacity={0.5} />
      )}
    </svg>
  );
}

// ── Isometric cube visualisation ────────────────────────────

// Isometric projection helpers
function isoProject(x: number, y: number, z: number, scale: number, cx: number, cy: number) {
  const px = cx + (x - z) * scale * 0.866;
  const py = cy - y * scale + (x + z) * scale * 0.5;
  return { px, py };
}

function isoPath(points: { px: number; py: number }[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.px} ${p.py}`).join(' ') + ' Z';
}

const DIM_COLORS_3D = ['#4d49f3', '#e11d48', '#059669'];

function CubeVis({ edge, anim = 'none', stepKey }: { edge: number; anim?: CubeAnim; stepKey: number }) {
  /*
   * Isometric cube derived from user's SVG layer template.
   *
   * SVG analysis (755×589, 3×3 single layer):
   *   Per-unit offsets:  +x = (+125, +73)   +z = (−125, +73)   +y = (0, −145)
   *   Face vertices (from SVG path order):
   *     Left:  A → H → D → C   (fill: darkest)
   *     Right: A → F → B → C   (fill: lightest)
   *     Top:   E → H → G → F   (fill: medium)
   *   where A=pt(gx,gy,gz), B=pt(gx+1,gy,gz), C=pt(gx+1,gy,gz+1),
   *         D=pt(gx,gy,gz+1), E=pt(gx,gy+1,gz), F=pt(gx+1,gy+1,gz),
   *         G=pt(gx+1,gy+1,gz+1), H=pt(gx,gy+1,gz+1)
   *
   *   Painter order from SVG: z ascending, x ascending (back → front)
   */

  // Per-unit pixel offsets — exact proportions from user's SVG (125:73:145)
  const S = 46;
  const ux  = S;                       // horizontal offset per +x unit
  const uxz = S * 73 / 125;           // vertical offset per +x or +z unit (~26.9)
  const uy  = S * 145 / 125;          // vertical offset per +y unit (~53.4)

  // Dynamic viewBox sized to fit the edge×edge×edge cube + label space
  const PAD = 55;
  const cubeW = 2 * edge * ux;
  const cubeH = edge * uy + 2 * edge * uxz;
  const VW = Math.ceil(cubeW + 2 * PAD);
  const VH = Math.ceil(cubeH + 2 * PAD + 24);   // +24 for counter badge

  // Front vertex: the Y-junction of grid position (0,0,0)
  const FX = PAD + edge * ux;
  const FY = PAD + 24 + edge * uy;

  /** Project grid coords → SVG pixel coords */
  function pt(x: number, y: number, z: number): [number, number] {
    return [
      FX + x * ux - z * ux,
      FY - y * uy + (x + z) * uxz,
    ];
  }

  /** Build SVG path data from polygon vertices */
  function d(pts: [number, number][]): string {
    return pts.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ') + 'Z';
  }

  /** All 8 vertices of unit cube at grid (gx, gy, gz) */
  function cube8(gx: number, gy: number, gz: number) {
    return {
      A: pt(gx,   gy,   gz),       // front-center (Y-junction)
      B: pt(gx+1, gy,   gz),       // right
      C: pt(gx+1, gy,   gz+1),     // bottom (lowest)
      D: pt(gx,   gy,   gz+1),     // left
      E: pt(gx,   gy+1, gz),       // top (highest)
      F: pt(gx+1, gy+1, gz),       // top-right
      G: pt(gx+1, gy+1, gz+1),     // back-diagonal (≈ A, slightly offset)
      H: pt(gx,   gy+1, gz+1),     // top-left
    };
  }

  // Indigo colour palette
  const CL  = '#6366f1';   // left  face (darkest)
  const CR  = '#a5b4fc';   // right face (lightest)
  const CT  = '#818cf8';   // top   face (medium)
  const STK = '#4338ca';   // subtle outline stroke
  const SW  = 0.5;         // stroke width

  // ── state ──
  const [activeDim, setActiveDim] = useState(-1);
  const [activeFace, setActiveFace] = useState(-1);
  const total = edge * edge * edge;
  const [filled, setFilled] = useState(0);

  useEffect(() => { setActiveDim(-1); setActiveFace(-1); setFilled(0); }, [stepKey]);

  useEffect(() => {
    if (anim !== 'highlight-dims') return;
    setActiveDim(-1);
    const t = [
      setTimeout(() => setActiveDim(0), 500),
      setTimeout(() => setActiveDim(1), 1400),
      setTimeout(() => setActiveDim(2), 2300),
      setTimeout(() => setActiveDim(3), 3200),
    ];
    return () => t.forEach(clearTimeout);
  }, [anim, stepKey]);

  useEffect(() => {
    if (anim !== 'fill-layers') return;
    setFilled(0);
    let n = 0;
    const iv = setInterval(() => {
      n++;
      setFilled(n);
      if (n >= total) clearInterval(iv);
    }, Math.max(60, 2500 / total));
    return () => clearInterval(iv);
  }, [anim, stepKey, edge, total]);

  // highlight-faces: cycle through the 3 visible faces (all identical for a cube)
  useEffect(() => {
    if (anim !== 'highlight-faces') return;
    setActiveFace(-1);
    const t = [
      setTimeout(() => setActiveFace(0), 500),    // top face   a²
      setTimeout(() => setActiveFace(1), 1600),    // right face a²
      setTimeout(() => setActiveFace(2), 2700),    // left face  a²
      setTimeout(() => setActiveFace(3), 3800),    // all faces
    ];
    return () => t.forEach(clearTimeout);
  }, [anim, stepKey]);

  // ── big cube outline (translucent background) ──
  const B = {
    A: pt(0, 0, 0),          B: pt(edge, 0, 0),
    C: pt(edge, 0, edge),    D: pt(0, 0, edge),
    E: pt(0, edge, 0),       F: pt(edge, edge, 0),
    G: pt(edge, edge, edge),  H: pt(0, edge, edge),
  };
  const bgCube = (
    <g>
      {/* Left face */}
      <path d={d([B.A, B.H, B.D, B.C])} fill="#6366f1" fillOpacity={0.15}
        stroke="#4d49f3" strokeOpacity={0.4} strokeWidth={1.5} strokeLinejoin="round" />
      {/* Right face */}
      <path d={d([B.A, B.F, B.B, B.C])} fill="#a5b4fc" fillOpacity={0.15}
        stroke="#4d49f3" strokeOpacity={0.4} strokeWidth={1.5} strokeLinejoin="round" />
      {/* Top face */}
      <path d={d([B.E, B.H, B.G, B.F])} fill="#818cf8" fillOpacity={0.15}
        stroke="#4d49f3" strokeOpacity={0.4} strokeWidth={1.5} strokeLinejoin="round" />
    </g>
  );

  // ── fill: unit cubes in painter order (y↑ z↑ x↑) ──
  function renderFill() {
    // Build set of filled positions  (fill order: y↑ z↑ x↑)
    const filledSet = new Set<string>();
    let count = 0;
    for (let y = 0; y < edge && count < filled; y++)
      for (let z = 0; z < edge && count < filled; z++)
        for (let x = 0; x < edge && count < filled; x++, count++)
          filledSet.add(`${x},${y},${z}`);

    // Render in painter order: y↑ z↑ x↑  (back cubes drawn first → front cubes on top)
    const out: React.ReactNode[] = [];
    for (let y = 0; y < edge; y++) {
      for (let z = 0; z < edge; z++) {             // z ASCENDING  ← fixed!
        for (let x = 0; x < edge; x++) {
          if (!filledSet.has(`${x},${y},${z}`)) continue;
          const v = cube8(x, y, z);
          const k = `${x}-${y}-${z}`;
          out.push(
            <g key={k}>
              {/* Left:  A → H → D → C */}
              <path d={d([v.A, v.H, v.D, v.C])} fill={CL} stroke={STK} strokeWidth={SW} strokeLinejoin="round" />
              {/* Right: A → F → B → C */}
              <path d={d([v.A, v.F, v.B, v.C])} fill={CR} stroke={STK} strokeWidth={SW} strokeLinejoin="round" />
              {/* Top:   E → H → G → F   ← fixed! was E→H→A→F */}
              <path d={d([v.E, v.H, v.G, v.F])} fill={CT} stroke={STK} strokeWidth={SW} strokeLinejoin="round" />
            </g>
          );
        }
      }
    }
    return out;
  }

  // Face-pair colors: top = green, right = indigo, left = rose
  const CUBE_FACE_COLORS = ['#10b981', '#6366f1', '#e11d48'];

  function renderFaces() {
    const areaVal = edge * edge;
    const faceDefs = [
      // Left face (z-axis × y-axis)
      { pts: [B.A, B.H, B.D, B.C], idx: 2, label: `a² = ${areaVal}` },
      // Right face (x-axis × y-axis)
      { pts: [B.A, B.F, B.B, B.C], idx: 1, label: `a² = ${areaVal}` },
      // Top face (x-axis × z-axis)
      { pts: [B.E, B.H, B.G, B.F], idx: 0, label: `a² = ${areaVal}` },
    ];

    return (
      <g>
        {faceDefs.map((f, i) => {
          const active = f.idx === activeFace || activeFace >= 3;
          const cx = f.pts.reduce((s, p) => s + p[0], 0) / f.pts.length;
          const cy = f.pts.reduce((s, p) => s + p[1], 0) / f.pts.length;
          const defaultFill = i === 0 ? '#6366f1' : i === 1 ? '#a5b4fc' : '#818cf8';
          return (
            <g key={i}>
              <path d={d(f.pts)}
                fill={active ? CUBE_FACE_COLORS[f.idx] : defaultFill}
                fillOpacity={active ? 0.55 : 0.15}
                stroke="#4d49f3" strokeOpacity={0.4} strokeWidth={1.5} strokeLinejoin="round"
                style={{ transition: 'all 500ms ease' }} />
              {active && (
                <g>
                  <rect x={cx - 38} y={cy - 12} width={76} height={24} rx={12} fill="#fff" opacity={0.88} />
                  <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
                    fontSize="13" fontWeight={700} fill={CUBE_FACE_COLORS[f.idx]}>
                    {f.label}
                  </text>
                </g>
              )}
            </g>
          );
        })}
        {activeFace >= 3 && (
          <g>
            <rect x={VW / 2 - 55} y={VH - 30} width={110} height={26} rx={13} fill="#312e81" opacity={0.9} />
            <text x={VW / 2} y={VH - 15} textAnchor="middle" dominantBaseline="middle"
              fontSize="13" fontWeight={600} fill="#fff">
              × 2 = 6 stěn
            </text>
          </g>
        )}
      </g>
    );
  }

  // ── dimension labels with pill badges ──
  function dimLabels() {
    const pA = pt(0, 0, 0), pB = pt(edge, 0, 0);
    const pD = pt(0, 0, edge), pH = pt(0, edge, edge);
    const dims = [
      { x1: pA[0], y1: pA[1], x2: pB[0], y2: pB[1], c: DIM_COLORS_3D[0], dx: 0, dy: 24 },
      { x1: pA[0], y1: pA[1], x2: pD[0], y2: pD[1], c: DIM_COLORS_3D[1], dx: 0, dy: 24 },
      { x1: pD[0], y1: pD[1], x2: pH[0], y2: pH[1], c: DIM_COLORS_3D[2], dx: 5, dy: 0 },
    ];
    const pillW = 86, pillH = 28, pillR = 14;
    return dims.map((dd, i) => {
      const on = i <= activeDim || activeDim >= 3;
      const cur = i === activeDim;
      const mx = (dd.x1 + dd.x2) / 2 + dd.dx;
      const my = (dd.y1 + dd.y2) / 2 + dd.dy;
      return (
        <g key={`dim${i}`} style={{ transition: 'opacity 400ms' }} opacity={on ? 1 : 0.4}>
          <line x1={dd.x1} y1={dd.y1} x2={dd.x2} y2={dd.y2}
            stroke={on ? dd.c : '#cbd5e1'}
            strokeWidth={cur ? 5 : on ? 3.5 : 1.5}
            strokeLinecap="round" style={{ transition: 'all 400ms' }} />
          {on && (
            <g>
              <rect x={mx - pillW / 2} y={my - pillH / 2} width={pillW} height={pillH}
                rx={pillR} fill={dd.c} opacity={0.92} />
              <text x={mx} y={my + 1}
                textAnchor="middle" dominantBaseline="middle"
                fontSize="18" fontWeight={700} fill="#fff">{edge} cm</text>
            </g>
          )}
        </g>
      );
    });
  }

  const lbl1 = pt(0, 0, 0), lbl2 = pt(edge, 0, 0);
  const defLblX = (lbl1[0] + lbl2[0]) / 2;
  const defLblY = (lbl1[1] + lbl2[1]) / 2 + 24;

  return (
    <svg key={stepKey} viewBox={`0 0 ${VW} ${VH}`} width="100%" style={{ maxWidth: 380, maxHeight: '70vh' }}>
      {anim === 'highlight-faces' ? renderFaces() : bgCube}
      {anim === 'fill-layers' && renderFill()}
      {anim === 'highlight-dims' && dimLabels()}
      {anim !== 'highlight-dims' && anim !== 'fill-layers' && anim !== 'highlight-faces' && (
        <g>
          <rect x={defLblX - 43} y={defLblY - 14} width={86} height={28}
            rx={14} fill="#4d49f3" opacity={0.92} />
          <text x={defLblX} y={defLblY + 1}
            textAnchor="middle" dominantBaseline="middle"
            fontSize="18" fontWeight={700} fill="#fff">
            a = {edge} cm
          </text>
        </g>
      )}
      {anim === 'fill-layers' && filled > 0 && (
        <g>
          <rect x={VW / 2 - 40} y={3} width={80} height={26} rx={13} fill="#312e81" opacity={0.95} />
          <text x={VW / 2} y={18} textAnchor="middle" dominantBaseline="middle"
            fontSize="16" fontWeight={700} fill="#fff">
            {filled} / {total}
          </text>
        </g>
      )}
    </svg>
  );
}

// ── Isometric cuboid visualisation ──────────────────────────

const DIM_COLORS_CUBOID = ['#e11d48', '#4d49f3', '#059669']; // a, b, c

function CuboidVis({ edgeA, edgeB, edgeC, anim = 'none', stepKey }: {
  edgeA: number; edgeB: number; edgeC: number; anim?: CuboidAnim; stepKey: number;
}) {
  // Per-unit pixel offsets (same proportions as CubeVis: 125:73:145)
  const S = 40;
  const ux  = S;
  const uxz = S * 73 / 125;
  const uy  = S * 145 / 125;

  const PAD = 55;
  const cubeW = (edgeA + edgeB) * ux;
  const cubeH = edgeC * uy + (edgeA + edgeB) * uxz;
  const VW = Math.ceil(cubeW + 2 * PAD);
  const VH = Math.ceil(cubeH + 2 * PAD + 24);

  const FX = PAD + edgeB * ux;
  const FY = PAD + 24 + edgeC * uy;

  function pt(x: number, y: number, z: number): [number, number] {
    return [FX + x * ux - z * ux, FY - y * uy + (x + z) * uxz];
  }

  function d(pts: [number, number][]): string {
    return pts.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ') + 'Z';
  }

  function cube8(gx: number, gy: number, gz: number) {
    return {
      A: pt(gx, gy, gz), B: pt(gx+1, gy, gz), C: pt(gx+1, gy, gz+1), D: pt(gx, gy, gz+1),
      E: pt(gx, gy+1, gz), F: pt(gx+1, gy+1, gz), G: pt(gx+1, gy+1, gz+1), H: pt(gx, gy+1, gz+1),
    };
  }

  const CL = '#6366f1', CR = '#a5b4fc', CT = '#818cf8';
  const STK = '#4338ca', SW = 0.5;

  const [activeDim, setActiveDim] = useState(-1);
  const [activeFace, setActiveFace] = useState(-1);
  const total = edgeA * edgeB * edgeC;
  const [filled, setFilled] = useState(0);

  useEffect(() => { setActiveDim(-1); setActiveFace(-1); setFilled(0); }, [stepKey]);

  useEffect(() => {
    if (anim !== 'highlight-dims') return;
    setActiveDim(-1);
    const t = [
      setTimeout(() => setActiveDim(0), 500),
      setTimeout(() => setActiveDim(1), 1400),
      setTimeout(() => setActiveDim(2), 2300),
      setTimeout(() => setActiveDim(3), 3200),
    ];
    return () => t.forEach(clearTimeout);
  }, [anim, stepKey]);

  useEffect(() => {
    if (anim !== 'fill-layers') return;
    setFilled(0);
    let n = 0;
    const iv = setInterval(() => { n++; setFilled(n); if (n >= total) clearInterval(iv); }, Math.max(60, 2500 / total));
    return () => clearInterval(iv);
  }, [anim, stepKey, edgeA, edgeB, edgeC, total]);

  // highlight-faces: cycle through the 3 visible face pairs
  useEffect(() => {
    if (anim !== 'highlight-faces') return;
    setActiveFace(-1);
    const t = [
      setTimeout(() => setActiveFace(0), 500),    // top face  a×b
      setTimeout(() => setActiveFace(1), 1600),    // right face a×c
      setTimeout(() => setActiveFace(2), 2700),    // left face  b×c
      setTimeout(() => setActiveFace(3), 3800),    // all faces
    ];
    return () => t.forEach(clearTimeout);
  }, [anim, stepKey]);

  // Big cuboid outline
  const B = {
    A: pt(0, 0, 0), B: pt(edgeA, 0, 0), C: pt(edgeA, 0, edgeB), D: pt(0, 0, edgeB),
    E: pt(0, edgeC, 0), F: pt(edgeA, edgeC, 0), G: pt(edgeA, edgeC, edgeB), H: pt(0, edgeC, edgeB),
  };
  // Standard 4-face decomposition for cuboid (hex decomp only works when edgeA === edgeB)
  const bgCuboid = (
    <g>
      {/* Bottom face (y=0 plane) — drawn first, behind everything */}
      <path d={d([B.A, B.B, B.C, B.D])} fill="#818cf8" fillOpacity={0.1}
        stroke="#4d49f3" strokeOpacity={0.3} strokeWidth={1.5} strokeLinejoin="round" />
      {/* Left face (x=0 plane) */}
      <path d={d([B.A, B.D, B.H, B.E])} fill="#6366f1" fillOpacity={0.15}
        stroke="#4d49f3" strokeOpacity={0.4} strokeWidth={1.5} strokeLinejoin="round" />
      {/* Right face (z=0 plane) */}
      <path d={d([B.A, B.E, B.F, B.B])} fill="#a5b4fc" fillOpacity={0.15}
        stroke="#4d49f3" strokeOpacity={0.4} strokeWidth={1.5} strokeLinejoin="round" />
      {/* Top face (y=edgeC plane) */}
      <path d={d([B.E, B.H, B.G, B.F])} fill="#818cf8" fillOpacity={0.15}
        stroke="#4d49f3" strokeOpacity={0.4} strokeWidth={1.5} strokeLinejoin="round" />
    </g>
  );

  function renderFill() {
    const filledSet = new Set<string>();
    let count = 0;
    for (let y = 0; y < edgeC && count < filled; y++)
      for (let z = 0; z < edgeB && count < filled; z++)
        for (let x = 0; x < edgeA && count < filled; x++, count++)
          filledSet.add(`${x},${y},${z}`);

    const out: React.ReactNode[] = [];
    for (let y = 0; y < edgeC; y++) {
      for (let z = 0; z < edgeB; z++) {
        for (let x = 0; x < edgeA; x++) {
          if (!filledSet.has(`${x},${y},${z}`)) continue;
          const v = cube8(x, y, z);
          out.push(
            <g key={`${x}-${y}-${z}`}>
              <path d={d([v.A, v.H, v.D, v.C])} fill={CL} stroke={STK} strokeWidth={SW} strokeLinejoin="round" />
              <path d={d([v.A, v.F, v.B, v.C])} fill={CR} stroke={STK} strokeWidth={SW} strokeLinejoin="round" />
              <path d={d([v.E, v.H, v.G, v.F])} fill={CT} stroke={STK} strokeWidth={SW} strokeLinejoin="round" />
            </g>
          );
        }
      }
    }
    return out;
  }

  // Face-pair colors: top (a·b) = green, right (a·c) = indigo, left (b·c) = rose
  const FACE_COLORS = ['#10b981', '#6366f1', '#e11d48'];

  function renderFaces() {
    const faceDefs = [
      // bottom face (not actively highlighted, just context)
      { pts: [B.A, B.B, B.C, B.D], idx: -1, label: '' },
      // left face (b·c) — drawn before right in painter order
      { pts: [B.A, B.D, B.H, B.E], idx: 2, label: `b·c = ${edgeB * edgeC}` },
      // right face (a·c)
      { pts: [B.A, B.E, B.F, B.B], idx: 1, label: `a·c = ${edgeA * edgeC}` },
      // top face (a·b)
      { pts: [B.E, B.H, B.G, B.F], idx: 0, label: `a·b = ${edgeA * edgeB}` },
    ];

    return (
      <g>
        {faceDefs.map((f, i) => {
          const active = f.idx >= 0 && (f.idx === activeFace || activeFace >= 3);
          const cx = f.pts.reduce((s, p) => s + p[0], 0) / f.pts.length;
          const cy = f.pts.reduce((s, p) => s + p[1], 0) / f.pts.length;
          const defaultFill = i === 0 ? '#818cf8' : i === 1 ? '#6366f1' : i === 2 ? '#a5b4fc' : '#818cf8';
          return (
            <g key={i}>
              <path d={d(f.pts)}
                fill={active ? FACE_COLORS[f.idx] : defaultFill}
                fillOpacity={active ? 0.55 : (i === 0 ? 0.1 : 0.15)}
                stroke="#4d49f3" strokeOpacity={0.4} strokeWidth={1.5} strokeLinejoin="round"
                style={{ transition: 'all 500ms ease' }} />
              {active && f.label && (
                <g>
                  <rect x={cx - 44} y={cy - 13} width={88} height={26} rx={13} fill="#fff" opacity={0.88} />
                  <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
                    fontSize="14" fontWeight={700} fill={FACE_COLORS[f.idx]}>
                    {f.label}
                  </text>
                </g>
              )}
            </g>
          );
        })}
        {activeFace >= 3 && (
          <g>
            <rect x={VW / 2 - 75} y={VH - 30} width={150} height={26} rx={13} fill="#312e81" opacity={0.9} />
            <text x={VW / 2} y={VH - 15} textAnchor="middle" dominantBaseline="middle"
              fontSize="13" fontWeight={600} fill="#fff">
              Každý pár × 2
            </text>
          </g>
        )}
      </g>
    );
  }

  function dimLabels() {
    const pA = pt(0, 0, 0), pB = pt(edgeA, 0, 0);
    const pD = pt(0, 0, edgeB), pH = pt(0, edgeC, edgeB);
    const dims = [
      { x1: pA[0], y1: pA[1], x2: pB[0], y2: pB[1], c: DIM_COLORS_CUBOID[0], dx: 0, dy: 24, lbl: `a = ${edgeA} cm` },
      { x1: pA[0], y1: pA[1], x2: pD[0], y2: pD[1], c: DIM_COLORS_CUBOID[1], dx: 0, dy: 24, lbl: `b = ${edgeB} cm` },
      { x1: pD[0], y1: pD[1], x2: pH[0], y2: pH[1], c: DIM_COLORS_CUBOID[2], dx: 5, dy: 0, lbl: `c = ${edgeC} cm` },
    ];
    const pillW = 86, pillH = 28, pillR = 14;
    return dims.map((dd, i) => {
      const on = i <= activeDim || activeDim >= 3;
      const cur = i === activeDim;
      const mx = (dd.x1 + dd.x2) / 2 + dd.dx;
      const my = (dd.y1 + dd.y2) / 2 + dd.dy;
      return (
        <g key={`dim${i}`} style={{ transition: 'opacity 400ms' }} opacity={on ? 1 : 0.4}>
          <line x1={dd.x1} y1={dd.y1} x2={dd.x2} y2={dd.y2}
            stroke={on ? dd.c : '#cbd5e1'} strokeWidth={cur ? 5 : on ? 3.5 : 1.5}
            strokeLinecap="round" style={{ transition: 'all 400ms' }} />
          {on && (
            <g>
              <rect x={mx - pillW / 2} y={my - pillH / 2} width={pillW} height={pillH} rx={pillR} fill={dd.c} opacity={0.92} />
              <text x={mx} y={my + 1} textAnchor="middle" dominantBaseline="middle" fontSize="16" fontWeight={700} fill="#fff">{dd.lbl}</text>
            </g>
          )}
        </g>
      );
    });
  }

  const lbl1 = pt(0, 0, 0), lbl2 = pt(edgeA, 0, 0);
  const defLblX = (lbl1[0] + lbl2[0]) / 2;
  const defLblY = (lbl1[1] + lbl2[1]) / 2 + 24;

  return (
    <svg key={stepKey} viewBox={`0 0 ${VW} ${VH}`} width="100%" style={{ maxWidth: 420, maxHeight: '70vh' }}>
      {anim === 'highlight-faces' ? renderFaces() : bgCuboid}
      {anim === 'fill-layers' && renderFill()}
      {anim === 'highlight-dims' && dimLabels()}
      {anim !== 'highlight-dims' && anim !== 'fill-layers' && anim !== 'highlight-faces' && (
        <g>
          <rect x={defLblX - 50} y={defLblY - 14} width={100} height={28} rx={14} fill="#4d49f3" opacity={0.92} />
          <text x={defLblX} y={defLblY + 1} textAnchor="middle" dominantBaseline="middle" fontSize="15" fontWeight={700} fill="#fff">
            {edgeA}×{edgeB}×{edgeC} cm
          </text>
        </g>
      )}
      {anim === 'fill-layers' && filled > 0 && (
        <g>
          <rect x={VW / 2 - 40} y={3} width={80} height={26} rx={13} fill="#312e81" opacity={0.95} />
          <text x={VW / 2} y={18} textAnchor="middle" dominantBaseline="middle" fontSize="16" fontWeight={700} fill="#fff">
            {filled} / {total}
          </text>
        </g>
      )}
    </svg>
  );
}

// ── Sphere (koule) visualisation ─────────────────────────────

function SphereVis({ radius, anim = 'none', stepKey }: {
  radius: number; anim?: SphereAnim; stepKey: number;
}) {
  const r = radius;
  const PAD = 60;
  const scale = 26;
  const rPx = r * scale;

  const VW = Math.ceil(2 * rPx + 2 * PAD + 80);
  const VH = Math.ceil(2 * rPx + 2 * PAD + 50);
  const cx = VW / 2;
  const cy = VH / 2;

  const [phase, setPhase] = useState(0);

  useEffect(() => { setPhase(0); }, [stepKey]);

  useEffect(() => {
    if (anim !== 'highlight-radius' && anim !== 'highlight-diameter'
        && anim !== 'show-cross-section' && anim !== 'show-surface') return;
    setPhase(0);
    const t1 = setTimeout(() => setPhase(1), 400);
    const t2 = setTimeout(() => setPhase(2), 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [anim, stepKey]);

  // 3D-ish sphere: main circle + perspective ellipse meridians
  function renderSphereBody(fillOpacity = 0.12) {
    return (
      <g>
        {/* Gradient-like sphere: radial gradient via circles */}
        <defs>
          <radialGradient id={`sg-${stepKey}`} cx="40%" cy="35%" r="60%">
            <stop offset="0%" stopColor="#c7d2fe" stopOpacity={0.6} />
            <stop offset="70%" stopColor="#818cf8" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#4338ca" stopOpacity={0.15} />
          </radialGradient>
        </defs>
        {/* Main sphere circle */}
        <circle cx={cx} cy={cy} r={rPx} fill={`url(#sg-${stepKey})`}
          stroke="#4d49f3" strokeWidth={2} />

        {/* Horizontal "equator" ellipse */}
        <ellipse cx={cx} cy={cy} rx={rPx} ry={rPx * 0.3}
          fill="none" stroke="#4d49f3" strokeWidth={1} strokeOpacity={0.3} strokeDasharray="4 3" />

        {/* Vertical meridian ellipse */}
        <ellipse cx={cx} cy={cy} rx={rPx * 0.3} ry={rPx}
          fill="none" stroke="#4d49f3" strokeWidth={1} strokeOpacity={0.2} strokeDasharray="4 3" />

        {/* Specular highlight */}
        <circle cx={cx - rPx * 0.25} cy={cy - rPx * 0.3} r={rPx * 0.15}
          fill="#fff" opacity={0.25} />
      </g>
    );
  }

  function renderRadius() {
    const on = phase >= 1;
    return (
      <g>
        {renderSphereBody()}
        {/* Center dot */}
        <circle cx={cx} cy={cy} r={3} fill="#4d49f3" />
        {/* Radius line */}
        <line x1={cx} y1={cy} x2={cx + rPx} y2={cy}
          stroke={on ? '#e11d48' : '#94a3b8'} strokeWidth={on ? 3.5 : 1.5}
          strokeLinecap="round" style={{ transition: 'all 400ms' }} />
        {on && (
          <g>
            <rect x={cx + rPx / 2 - 38} y={cy - 28} width={76} height={22} rx={11} fill="#e11d48" opacity={0.92} />
            <text x={cx + rPx / 2} y={cy - 16} textAnchor="middle" dominantBaseline="middle"
              fontSize="13" fontWeight={700} fill="#fff">r = {r} cm</text>
          </g>
        )}
      </g>
    );
  }

  function renderDiameter() {
    const on = phase >= 1;
    return (
      <g>
        {renderSphereBody()}
        <circle cx={cx} cy={cy} r={3} fill="#4d49f3" />
        <line x1={cx - rPx} y1={cy} x2={cx + rPx} y2={cy}
          stroke={on ? '#4d49f3' : '#94a3b8'} strokeWidth={on ? 3.5 : 1.5}
          strokeLinecap="round" style={{ transition: 'all 400ms' }} />
        {on && (
          <g>
            <rect x={cx - 42} y={cy - 28} width={84} height={22} rx={11} fill="#4d49f3" opacity={0.92} />
            <text x={cx} y={cy - 16} textAnchor="middle" dominantBaseline="middle"
              fontSize="13" fontWeight={700} fill="#fff">d = {2 * r} cm</text>
          </g>
        )}
      </g>
    );
  }

  function renderCrossSection() {
    return (
      <g>
        {renderSphereBody(0.08)}
        {/* Main cross-section circle (filled) */}
        <circle cx={cx} cy={cy} r={rPx}
          fill="#10b981" fillOpacity={phase >= 1 ? 0.2 : 0}
          stroke="#10b981" strokeWidth={phase >= 1 ? 2.5 : 0}
          style={{ transition: 'all 600ms' }} />
        {/* Center dot + radius */}
        <circle cx={cx} cy={cy} r={3} fill="#4d49f3" />
        <line x1={cx} y1={cy} x2={cx + rPx} y2={cy}
          stroke="#e11d48" strokeWidth={2} strokeLinecap="round" />
        {phase >= 1 && (
          <g>
            <rect x={cx - 48} y={cy + rPx + 10} width={96} height={22} rx={11} fill="#10b981" opacity={0.92} />
            <text x={cx} y={cy + rPx + 22} textAnchor="middle" dominantBaseline="middle"
              fontSize="12" fontWeight={700} fill="#fff">S = π·r² = {(Math.PI * r * r).toFixed(1)}</text>
          </g>
        )}
      </g>
    );
  }

  function renderSurface() {
    // Show "4 circles" concept: 4 small circles arranged around the sphere
    const circleR = rPx * 0.42;
    const circleColors = ['#10b981', '#059669', '#34d399', '#6ee7b7'];
    const positions = [
      { x: cx - circleR * 0.6, y: cy - circleR * 0.6 },
      { x: cx + circleR * 0.6, y: cy - circleR * 0.6 },
      { x: cx - circleR * 0.6, y: cy + circleR * 0.6 },
      { x: cx + circleR * 0.6, y: cy + circleR * 0.6 },
    ];

    return (
      <g>
        {renderSphereBody()}
        {/* 4 πr² circles overlaid */}
        {phase >= 1 && positions.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={circleR}
            fill={circleColors[i]} fillOpacity={0.2}
            stroke={circleColors[i]} strokeWidth={2} strokeOpacity={0.6}
            style={{ transition: 'all 600ms' }} />
        ))}
        {phase >= 1 && (
          <g>
            <rect x={cx - 60} y={cy + rPx + 10} width={120} height={24} rx={12} fill="#10b981" opacity={0.92} />
            <text x={cx} y={cy + rPx + 23} textAnchor="middle" dominantBaseline="middle"
              fontSize="13" fontWeight={700} fill="#fff">4 × π·r² = {(4 * Math.PI * r * r).toFixed(1)}</text>
          </g>
        )}
        {phase >= 2 && (
          <g>
            <text x={cx} y={cy + 2} textAnchor="middle" dominantBaseline="middle"
              fontSize="24" fontWeight={800} fill="#fff" opacity={0.7}>4×</text>
          </g>
        )}
      </g>
    );
  }

  const defLblY = cy + rPx + 26;

  return (
    <svg key={stepKey} viewBox={`0 0 ${VW} ${VH}`} width="100%" style={{ maxWidth: 400, maxHeight: '70vh' }}>
      {anim === 'highlight-radius' ? renderRadius()
        : anim === 'highlight-diameter' ? renderDiameter()
        : anim === 'show-cross-section' ? renderCrossSection()
        : anim === 'show-surface' ? renderSurface()
        : (
          <g>
            {renderSphereBody()}
            {/* Center dot */}
            <circle cx={cx} cy={cy} r={3} fill="#4d49f3" />
            {/* Default label */}
            <g>
              <rect x={cx - 42} y={defLblY - 12} width={84} height={24}
                rx={12} fill="#4d49f3" opacity={0.92} />
              <text x={cx} y={defLblY + 1}
                textAnchor="middle" dominantBaseline="middle"
                fontSize="14" fontWeight={700} fill="#fff">
                r = {r} cm
              </text>
            </g>
          </g>
        )}
    </svg>
  );
}

// ── Cone (kužel) visualisation ───────────────────────────────

function ConeVis({ radius, coneHeight, anim = 'none', stepKey }: {
  radius: number; coneHeight: number; anim?: ConeAnim; stepKey: number;
}) {
  const r = radius;
  const h = coneHeight;
  const slant = Math.sqrt(r * r + h * h);

  // SVG layout — ellipse-based projection (same style as CylinderVis)
  const PAD = 60;
  const scale = 22;
  const rPx = r * scale;
  const ePx = rPx * 0.35;           // perspective squash
  const hPx = h * scale;

  const VW = Math.ceil(2 * rPx + 2 * PAD + 100);
  const VH = Math.ceil(hPx + 2 * ePx + 2 * PAD + 40);

  const cx = VW / 2;
  const botY = PAD + ePx + hPx + 20;
  const apexY = botY - hPx;

  // ── state ──
  const [activeDim, setActiveDim] = useState(-1);
  const [activePart, setActivePart] = useState(-1);
  const [comparePhase, setComparePhase] = useState(0);

  useEffect(() => { setActiveDim(-1); setActivePart(-1); setComparePhase(0); }, [stepKey]);

  useEffect(() => {
    if (anim !== 'highlight-dims') return;
    setActiveDim(-1);
    const t = [
      setTimeout(() => setActiveDim(0), 500),   // r
      setTimeout(() => setActiveDim(1), 1500),   // v
      setTimeout(() => setActiveDim(2), 2500),   // s
      setTimeout(() => setActiveDim(3), 3500),   // all
    ];
    return () => t.forEach(clearTimeout);
  }, [anim, stepKey]);

  useEffect(() => {
    if (anim !== 'highlight-parts') return;
    setActivePart(-1);
    const t = [
      setTimeout(() => setActivePart(0), 500),   // base
      setTimeout(() => setActivePart(1), 1500),   // mantle
      setTimeout(() => setActivePart(2), 2500),   // all
    ];
    return () => t.forEach(clearTimeout);
  }, [anim, stepKey]);

  useEffect(() => {
    if (anim !== 'compare-cylinder') return;
    setComparePhase(0);
    const t = [
      setTimeout(() => setComparePhase(1), 600),
      setTimeout(() => setComparePhase(2), 1800),
      setTimeout(() => setComparePhase(3), 3000),
    ];
    return () => t.forEach(clearTimeout);
  }, [anim, stepKey]);

  function ellipseArc(centerX: number, centerY: number, rx: number, ry: number, startDeg: number, endDeg: number): string {
    const sr = (startDeg * Math.PI) / 180, er = (endDeg * Math.PI) / 180;
    const x1 = centerX + rx * Math.cos(sr), y1 = centerY + ry * Math.sin(sr);
    const x2 = centerX + rx * Math.cos(er), y2 = centerY + ry * Math.sin(er);
    const la = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
    return `M${x1.toFixed(1)},${y1.toFixed(1)} A${rx},${ry} 0 ${la},1 ${x2.toFixed(1)},${y2.toFixed(1)}`;
  }

  function fullEllipse(centerX: number, centerY: number, rx: number, ry: number): string {
    return `M${centerX - rx},${centerY} A${rx},${ry} 0 1,1 ${centerX + rx},${centerY} A${rx},${ry} 0 1,1 ${centerX - rx},${centerY}`;
  }

  const baseColor = '#10b981';
  const mantleColor = '#6366f1';

  function renderCone(highlightBase: boolean, highlightMantle: boolean) {
    const bActive = highlightBase || activePart === 0 || activePart >= 2;
    const mActive = highlightMantle || activePart === 1 || activePart >= 2;

    return (
      <g>
        {/* Back half of base ellipse (dashed, behind cone) */}
        <path d={ellipseArc(cx, botY, rPx, ePx, 0, 180)}
          fill="none" stroke="#4d49f3" strokeWidth={1.5} strokeOpacity={0.3} strokeDasharray="4 3" />

        {/* Mantle (two slant lines + filled triangle area) */}
        <path d={`M${cx - rPx},${botY} L${cx},${apexY} L${cx + rPx},${botY}`}
          fill={mActive ? mantleColor : '#a5b4fc'} fillOpacity={mActive ? 0.3 : 0.12}
          stroke="#4d49f3" strokeWidth={1.5} strokeOpacity={0.6} strokeLinejoin="round"
          style={{ transition: 'all 500ms' }} />

        {/* Front half of base ellipse */}
        <path d={ellipseArc(cx, botY, rPx, ePx, 180, 360)}
          fill="none" stroke="#4d49f3" strokeWidth={1.5} />

        {/* Base fill */}
        <path d={fullEllipse(cx, botY, rPx, ePx)}
          fill={bActive ? baseColor : '#818cf8'}
          fillOpacity={bActive ? 0.35 : 0.08}
          stroke="none" style={{ transition: 'all 500ms' }} />

        {/* Apex dot */}
        <circle cx={cx} cy={apexY} r={3} fill="#4d49f3" />

        {/* Part labels */}
        {activePart === 0 && (
          <g>
            <rect x={cx - 42} y={botY + ePx + 8} width={84} height={22} rx={11} fill={baseColor} opacity={0.92} />
            <text x={cx} y={botY + ePx + 20} textAnchor="middle" dominantBaseline="middle"
              fontSize="12" fontWeight={700} fill="#fff">π·r² = {(Math.PI * r * r).toFixed(1)}</text>
          </g>
        )}
        {activePart === 1 && (
          <g>
            <rect x={cx + rPx / 2 + 8} y={(apexY + botY) / 2 - 11} width={84} height={22} rx={11} fill={mantleColor} opacity={0.92} />
            <text x={cx + rPx / 2 + 50} y={(apexY + botY) / 2 + 1} textAnchor="middle" dominantBaseline="middle"
              fontSize="12" fontWeight={700} fill="#fff">π·r·s = {(Math.PI * r * slant).toFixed(1)}</text>
          </g>
        )}
        {activePart >= 2 && (
          <g>
            <rect x={cx - 70} y={VH - 32} width={140} height={26} rx={13} fill="#312e81" opacity={0.9} />
            <text x={cx} y={VH - 17} textAnchor="middle" dominantBaseline="middle"
              fontSize="13" fontWeight={600} fill="#fff">
              Podstava + plášť
            </text>
          </g>
        )}
      </g>
    );
  }

  function renderDimLabels() {
    const dims = [
      { idx: 0, x1: cx, y1: botY, x2: cx + rPx, y2: botY, c: '#4d49f3', lbl: `r = ${r} cm`, mx: cx + rPx / 2, my: botY + 18, dash: false },
      { idx: 1, x1: cx, y1: botY, x2: cx, y2: apexY, c: '#e11d48', lbl: `v = ${h} cm`, mx: cx - 38, my: (botY + apexY) / 2, dash: true },
      { idx: 2, x1: cx + rPx, y1: botY, x2: cx, y2: apexY, c: '#f59e0b', lbl: `s ≈ ${slant.toFixed(2)}`, mx: cx + rPx / 2 + 22, my: (botY + apexY) / 2, dash: false },
    ];
    return (
      <g>
        {renderCone(false, false)}
        {dims.map((dd, i) => {
          const on = i <= activeDim || activeDim >= 3;
          const cur = i === activeDim;
          return (
            <g key={`dim${i}`} style={{ transition: 'opacity 400ms' }} opacity={on ? 1 : 0.25}>
              <line x1={dd.x1} y1={dd.y1} x2={dd.x2} y2={dd.y2}
                stroke={on ? dd.c : '#cbd5e1'}
                strokeWidth={cur ? 4.5 : on ? 3 : 1.5}
                strokeLinecap="round"
                strokeDasharray={dd.dash ? '6 4' : 'none'}
                style={{ transition: 'all 400ms' }} />
              {on && (
                <g>
                  <rect x={dd.mx - 42} y={dd.my - 12} width={84} height={24} rx={12} fill={dd.c} opacity={0.92} />
                  <text x={dd.mx} y={dd.my + 1} textAnchor="middle" dominantBaseline="middle"
                    fontSize="13" fontWeight={700} fill="#fff">{dd.lbl}</text>
                </g>
              )}
            </g>
          );
        })}
      </g>
    );
  }

  function renderCompareCylinder() {
    return (
      <g>
        {/* Cylinder wireframe (dashed) */}
        {comparePhase >= 1 && (
          <g opacity={1} style={{ transition: 'opacity 600ms' }}>
            <path d={ellipseArc(cx, botY, rPx, ePx, 0, 180)}
              fill="none" stroke="#94a3b8" strokeWidth={1.2} strokeDasharray="5 3" />
            <path d={ellipseArc(cx, botY, rPx, ePx, 180, 360)}
              fill="none" stroke="#94a3b8" strokeWidth={1.2} strokeDasharray="5 3" />
            <rect x={cx - rPx} y={apexY} width={2 * rPx} height={hPx}
              fill="none" stroke="#94a3b8" strokeWidth={1.2} strokeDasharray="5 3" />
            <path d={fullEllipse(cx, apexY, rPx, ePx)}
              fill="none" stroke="#94a3b8" strokeWidth={1.2} strokeDasharray="5 3" />
          </g>
        )}
        {/* Solid cone inside */}
        {comparePhase >= 2 && (
          <g>
            <path d={ellipseArc(cx, botY, rPx, ePx, 0, 180)}
              fill="none" stroke="#4d49f3" strokeWidth={1.5} strokeOpacity={0.3} strokeDasharray="4 3" />
            <path d={`M${cx - rPx},${botY} L${cx},${apexY} L${cx + rPx},${botY}`}
              fill="#6366f1" fillOpacity={0.35} stroke="#4d49f3" strokeWidth={1.5} strokeLinejoin="round" />
            <path d={ellipseArc(cx, botY, rPx, ePx, 180, 360)}
              fill="none" stroke="#4d49f3" strokeWidth={1.5} />
            <path d={fullEllipse(cx, botY, rPx, ePx)}
              fill="#818cf8" fillOpacity={0.15} stroke="none" />
            <circle cx={cx} cy={apexY} r={3} fill="#4d49f3" />
          </g>
        )}
        {/* ⅓ label */}
        {comparePhase >= 3 && (
          <g>
            <rect x={cx - 90} y={VH - 38} width={180} height={30} rx={15} fill="#312e81" opacity={0.92} />
            <text x={cx} y={VH - 21} textAnchor="middle" dominantBaseline="middle"
              fontSize="15" fontWeight={700} fill="#fff">
              V_kužel = ⅓ · V_válec
            </text>
          </g>
        )}
      </g>
    );
  }

  const defLblY = botY + ePx + 20;

  return (
    <svg key={stepKey} viewBox={`0 0 ${VW} ${VH}`} width="100%" style={{ maxWidth: 420, maxHeight: '70vh' }}>
      {anim === 'highlight-dims' ? renderDimLabels()
        : anim === 'compare-cylinder' ? renderCompareCylinder()
        : anim === 'highlight-base' ? renderCone(true, false)
        : anim === 'highlight-mantle' ? renderCone(false, true)
        : anim === 'highlight-parts' ? renderCone(false, false)
        : (
          <g>
            {renderCone(false, false)}
            <g>
              <rect x={cx - 55} y={defLblY - 12} width={110} height={24}
                rx={12} fill="#4d49f3" opacity={0.92} />
              <text x={cx} y={defLblY + 1}
                textAnchor="middle" dominantBaseline="middle"
                fontSize="13" fontWeight={700} fill="#fff">
                r={r}, v={h} cm
              </text>
            </g>
          </g>
        )}
    </svg>
  );
}

// ── Prism (hranol) visualisation ─────────────────────────────

function PrismVis({ sides, edgeA, prismHeight, anim = 'none', stepKey }: {
  sides: number; edgeA: number; prismHeight: number; anim?: PrismAnim; stepKey: number;
}) {
  const n = sides;
  const a = edgeA;
  const h = prismHeight;

  // Isometric projection — same conventions as CubeVis
  const S = 38;
  const ux  = S;
  const uxz = S * 73 / 125;
  const uy  = S * 145 / 125;

  const PAD = 65;

  // Regular polygon base: compute "radius" from edge length
  const baseR = a / (2 * Math.sin(Math.PI / n));

  // Viewbox sizing — use the bounding box of the projected shape
  const projW = 2 * baseR * ux + 10;
  const projH = h * uy + 2 * baseR * uxz + 10;
  const VW = Math.ceil(projW + 2 * PAD);
  const VH = Math.ceil(projH + 2 * PAD + 30);

  // Reference point (center of bottom face projects here)
  const FX = VW / 2;
  const FY = PAD + 20 + h * uy + baseR * uxz;

  function pt(x: number, y: number, z: number): [number, number] {
    return [FX + x * ux - z * ux, FY - y * uy + (x + z) * uxz];
  }

  function d(pts: [number, number][]): string {
    return pts.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ') + 'Z';
  }

  // Compute base polygon vertices (y=0 plane)
  const bottomVerts: [number, number][] = [];
  const topVerts: [number, number][] = [];
  const bottom3D: { x: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (i * 2 * Math.PI) / n - Math.PI / 2; // start from top
    const bx = baseR * Math.cos(angle);
    const bz = baseR * Math.sin(angle);
    bottom3D.push({ x: bx, z: bz });
    bottomVerts.push(pt(bx, 0, bz));
    topVerts.push(pt(bx, h, bz));
  }

  // Determine visibility: side face i (from vertex i to i+1) is visible
  // if its outward normal points toward the camera (negative z in iso)
  function isFaceVisible(i: number): boolean {
    const j = (i + 1) % n;
    const midX = (bottom3D[i].x + bottom3D[j].x) / 2;
    const midZ = (bottom3D[i].z + bottom3D[j].z) / 2;
    // Outward normal direction (2D, in xz-plane, perpendicular to edge)
    const edgeX = bottom3D[j].x - bottom3D[i].x;
    const edgeZ = bottom3D[j].z - bottom3D[i].z;
    // Normal: (edgeZ, -edgeX) or (-edgeZ, edgeX) — pick outward
    const nx = edgeZ, nz = -edgeX;
    // Dot with outward direction from center
    const dot = nx * midX + nz * midZ;
    const outNx = dot > 0 ? nx : -nx;
    const outNz = dot > 0 ? nz : -nz;
    // Camera direction in iso: roughly (1, 0, 1) (looking from front-right)
    // A face is visible if its normal has a positive component toward camera
    return (outNx * 1 + outNz * 1) > 0;
  }

  // Base area for regular polygon
  const baseArea = (n * a * a) / (4 * Math.tan(Math.PI / n));

  // ── state ──
  const [activeDim, setActiveDim] = useState(-1);
  const [activePart, setActivePart] = useState(-1);
  const [activeSide, setActiveSide] = useState(-1);

  useEffect(() => { setActiveDim(-1); setActivePart(-1); setActiveSide(-1); }, [stepKey]);

  useEffect(() => {
    if (anim !== 'highlight-dims') return;
    setActiveDim(-1);
    const t = [
      setTimeout(() => setActiveDim(0), 500),   // a
      setTimeout(() => setActiveDim(1), 1500),   // v
      setTimeout(() => setActiveDim(2), 2500),   // all
    ];
    return () => t.forEach(clearTimeout);
  }, [anim, stepKey]);

  useEffect(() => {
    if (anim !== 'highlight-sides') return;
    setActiveSide(-1);
    const visibleFaces: number[] = [];
    for (let i = 0; i < n; i++) if (isFaceVisible(i)) visibleFaces.push(i);
    const timers = visibleFaces.map((fi, idx) =>
      setTimeout(() => setActiveSide(fi), 500 + idx * 800)
    );
    timers.push(setTimeout(() => setActiveSide(99), 500 + visibleFaces.length * 800)); // all
    return () => timers.forEach(clearTimeout);
  }, [anim, stepKey, n]);

  useEffect(() => {
    if (anim !== 'highlight-parts') return;
    setActivePart(-1);
    const t = [
      setTimeout(() => setActivePart(0), 500),   // bottom base
      setTimeout(() => setActivePart(1), 1500),   // top base
      setTimeout(() => setActivePart(2), 2500),   // sides
      setTimeout(() => setActivePart(3), 3500),   // all
    ];
    return () => t.forEach(clearTimeout);
  }, [anim, stepKey]);

  const sideColors = ['#6366f1', '#818cf8', '#a5b4fc', '#7c3aed', '#8b5cf6', '#a78bfa',
    '#6366f1', '#818cf8', '#a5b4fc', '#7c3aed', '#8b5cf6', '#a78bfa'];
  const baseColor = '#10b981';
  const sideHighlight = '#f59e0b';

  function renderPrism() {
    const highlightBase = anim === 'highlight-base' || activePart === 0 || activePart === 1 || activePart >= 3;
    const highlightSides = activePart === 2 || activePart >= 3;

    // Collect faces for painter order
    const sideFaces: { i: number; pts: [number, number][]; visible: boolean; depth: number }[] = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const vis = isFaceVisible(i);
      const depth = bottom3D[i].x + bottom3D[i].z + bottom3D[j].x + bottom3D[j].z;
      sideFaces.push({
        i,
        pts: [bottomVerts[i], bottomVerts[j], topVerts[j], topVerts[i]],
        visible: vis,
        depth,
      });
    }
    // Sort by depth — lower depth (further from camera) drawn first
    sideFaces.sort((a, b) => a.depth - b.depth);

    return (
      <g>
        {/* Bottom base */}
        <path d={d(bottomVerts)}
          fill={(activePart === 0 || activePart >= 3) ? baseColor : '#818cf8'}
          fillOpacity={(activePart === 0 || activePart >= 3) ? 0.35 : 0.1}
          stroke="#4d49f3" strokeOpacity={0.35} strokeWidth={1.5} strokeLinejoin="round"
          style={{ transition: 'all 500ms' }} />

        {/* Side faces in painter order */}
        {sideFaces.map(({ i, pts, visible }) => {
          const isSideActive = activeSide === i || activeSide >= 99;
          const isPartActive = highlightSides;
          const fill = isSideActive ? sideHighlight
            : isPartActive ? '#6366f1'
            : sideColors[i % sideColors.length];
          const opacity = isSideActive ? 0.5
            : isPartActive ? 0.35
            : visible ? 0.2 : 0.08;
          return (
            <path key={`sf-${i}`} d={d(pts)}
              fill={fill} fillOpacity={opacity}
              stroke="#4d49f3" strokeOpacity={visible ? 0.5 : 0.2} strokeWidth={1.5} strokeLinejoin="round"
              style={{ transition: 'all 500ms' }} />
          );
        })}

        {/* Top base */}
        <path d={d(topVerts)}
          fill={(highlightBase || activePart === 1 || activePart >= 3) ? baseColor : '#818cf8'}
          fillOpacity={(highlightBase || activePart === 1 || activePart >= 3) ? 0.4 : 0.18}
          stroke="#4d49f3" strokeWidth={1.5} strokeLinejoin="round"
          style={{ transition: 'all 500ms' }} />

        {/* Base label */}
        {(activePart === 0 || activePart === 1) && (
          <g>
            {(() => {
              const target = activePart === 0 ? bottomVerts : topVerts;
              const lx = target.reduce((s, p) => s + p[0], 0) / n;
              const ly = target.reduce((s, p) => s + p[1], 0) / n;
              return (
                <g>
                  <rect x={lx - 46} y={ly - 12} width={92} height={24} rx={12} fill={baseColor} opacity={0.92} />
                  <text x={lx} y={ly + 1} textAnchor="middle" dominantBaseline="middle"
                    fontSize="12" fontWeight={700} fill="#fff">S_p ≈ {baseArea.toFixed(1)}</text>
                </g>
              );
            })()}
          </g>
        )}

        {/* Side label */}
        {(activeSide >= 99 || activePart === 2) && (
          <g>
            <rect x={VW / 2 - 55} y={VH - 34} width={110} height={24} rx={12} fill={sideHighlight} opacity={0.92} />
            <text x={VW / 2} y={VH - 20} textAnchor="middle" dominantBaseline="middle"
              fontSize="12" fontWeight={700} fill="#fff">{n}× (a·v) = {n * a * h}</text>
          </g>
        )}

        {/* All parts label */}
        {activePart >= 3 && (
          <g>
            <rect x={VW / 2 - 80} y={VH - 34} width={160} height={26} rx={13} fill="#312e81" opacity={0.9} />
            <text x={VW / 2} y={VH - 19} textAnchor="middle" dominantBaseline="middle"
              fontSize="13" fontWeight={600} fill="#fff">
              2 podstavy + {n} stěn
            </text>
          </g>
        )}
      </g>
    );
  }

  function renderDimLabels() {
    // a — first visible base edge
    const e0 = bottomVerts[0], e1 = bottomVerts[1];
    const aM: [number, number] = [(e0[0] + e1[0]) / 2, (e0[1] + e1[1]) / 2 + 20];
    // v — height (left side edge)
    const vM: [number, number] = [bottomVerts[0][0] - 18, (bottomVerts[0][1] + topVerts[0][1]) / 2];

    const dims = [
      { x1: e0[0], y1: e0[1], x2: e1[0], y2: e1[1], mx: aM[0], my: aM[1], c: '#4d49f3', lbl: `a = ${a} cm`, idx: 0 },
      { x1: bottomVerts[0][0], y1: bottomVerts[0][1], x2: topVerts[0][0], y2: topVerts[0][1], mx: vM[0], my: vM[1], c: '#e11d48', lbl: `v = ${h} cm`, idx: 1 },
    ];

    return (
      <g>
        {renderPrism()}
        {dims.map((dd, i) => {
          const on = i <= activeDim || activeDim >= 2;
          const cur = i === activeDim;
          return (
            <g key={`dim${i}`} style={{ transition: 'opacity 400ms' }} opacity={on ? 1 : 0.25}>
              <line x1={dd.x1} y1={dd.y1} x2={dd.x2} y2={dd.y2}
                stroke={on ? dd.c : '#cbd5e1'}
                strokeWidth={cur ? 4.5 : on ? 3 : 1.5}
                strokeLinecap="round"
                style={{ transition: 'all 400ms' }} />
              {on && (
                <g>
                  <rect x={dd.mx - 42} y={dd.my - 12} width={84} height={24} rx={12} fill={dd.c} opacity={0.92} />
                  <text x={dd.mx} y={dd.my + 1} textAnchor="middle" dominantBaseline="middle"
                    fontSize="14" fontWeight={700} fill="#fff">{dd.lbl}</text>
                </g>
              )}
            </g>
          );
        })}
      </g>
    );
  }

  // Default label
  const defLblX = VW / 2;
  const defLblY = FY + baseR * uxz + 22;

  return (
    <svg key={stepKey} viewBox={`0 0 ${VW} ${VH}`} width="100%" style={{ maxWidth: 420, maxHeight: '70vh' }}>
      {anim === 'highlight-dims' ? renderDimLabels()
        : (
          <g>
            {renderPrism()}
            {anim === 'show-prism' && (
              <g>
                <rect x={defLblX - 65} y={defLblY - 12} width={130} height={24}
                  rx={12} fill="#4d49f3" opacity={0.92} />
                <text x={defLblX} y={defLblY + 1}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize="13" fontWeight={700} fill="#fff">
                  {n}-boký, a={a}, v={h}
                </text>
              </g>
            )}
          </g>
        )}
    </svg>
  );
}

// ── Cylinder (válec) visualisation ──────────────────────────

function CylinderVis({ radius, cylHeight, anim = 'none', stepKey }: {
  radius: number; cylHeight: number; anim?: CylinderAnim; stepKey: number;
}) {
  const r = radius;
  const h = cylHeight;

  // SVG layout — the cylinder is drawn as an ellipse-based projection
  const PAD = 60;
  const scale = 22;
  const rPx = r * scale;             // horizontal radius of the ellipse
  const ePx = rPx * 0.35;           // vertical radius of the ellipse (perspective squash)
  const hPx = h * scale;            // height in pixels

  const VW = Math.ceil(2 * rPx + 2 * PAD + 100);
  const VH = Math.ceil(hPx + 2 * ePx + 2 * PAD + 40);

  const cx = VW / 2;                // center x
  const topY = PAD + ePx + 20;      // top ellipse center y
  const botY = topY + hPx;          // bottom ellipse center y

  // ── state ──
  const [activeDim, setActiveDim] = useState(-1);
  const [activePart, setActivePart] = useState(-1);
  const [unrollProgress, setUnrollProgress] = useState(0);

  useEffect(() => { setActiveDim(-1); setActivePart(-1); setUnrollProgress(0); }, [stepKey]);

  useEffect(() => {
    if (anim !== 'highlight-dims') return;
    setActiveDim(-1);
    const t = [
      setTimeout(() => setActiveDim(0), 500),   // r
      setTimeout(() => setActiveDim(1), 1500),   // v
      setTimeout(() => setActiveDim(2), 2500),   // all
    ];
    return () => t.forEach(clearTimeout);
  }, [anim, stepKey]);

  useEffect(() => {
    if (anim !== 'highlight-parts') return;
    setActivePart(-1);
    const t = [
      setTimeout(() => setActivePart(0), 500),   // bottom base
      setTimeout(() => setActivePart(1), 1500),   // top base
      setTimeout(() => setActivePart(2), 2500),   // mantle
      setTimeout(() => setActivePart(3), 3500),   // all
    ];
    return () => t.forEach(clearTimeout);
  }, [anim, stepKey]);

  useEffect(() => {
    if (anim !== 'unroll-mantle') return;
    setUnrollProgress(0);
    let frame: number;
    const start = performance.now();
    const duration = 2000;
    function tick(now: number) {
      const t = Math.min((now - start) / duration, 1);
      setUnrollProgress(t);
      if (t < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [anim, stepKey]);

  // Helper to draw an ellipse arc path
  function ellipseArc(centerX: number, centerY: number, rx: number, ry: number, startDeg: number, endDeg: number): string {
    const startRad = (startDeg * Math.PI) / 180;
    const endRad = (endDeg * Math.PI) / 180;
    const x1 = centerX + rx * Math.cos(startRad);
    const y1 = centerY + ry * Math.sin(startRad);
    const x2 = centerX + rx * Math.cos(endRad);
    const y2 = centerY + ry * Math.sin(endRad);
    const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
    return `M${x1.toFixed(1)},${y1.toFixed(1)} A${rx},${ry} 0 ${largeArc},1 ${x2.toFixed(1)},${y2.toFixed(1)}`;
  }

  // Full ellipse path
  function fullEllipse(centerX: number, centerY: number, rx: number, ry: number): string {
    return `M${centerX - rx},${centerY} A${rx},${ry} 0 1,1 ${centerX + rx},${centerY} A${rx},${ry} 0 1,1 ${centerX - rx},${centerY}`;
  }

  const baseColor = '#10b981';
  const mantleColor = '#6366f1';

  function renderCylinder(highlightBase: boolean, highlightMantle: boolean) {
    const baseActive = highlightBase || activePart === 0 || activePart === 1 || activePart >= 3;
    const mantleActive = highlightMantle || activePart === 2 || activePart >= 3;

    return (
      <g>
        {/* Bottom ellipse (back half) */}
        <path d={ellipseArc(cx, botY, rPx, ePx, 0, 180)}
          fill="none" stroke="#4d49f3" strokeWidth={1.5} strokeOpacity={0.3} strokeDasharray="4 3" />
        {/* Mantle (side rectangle) */}
        <rect x={cx - rPx} y={topY} width={2 * rPx} height={hPx}
          fill={mantleActive ? mantleColor : '#a5b4fc'} fillOpacity={mantleActive ? 0.3 : 0.12}
          stroke="none" style={{ transition: 'all 500ms' }} />
        {/* Side lines */}
        <line x1={cx - rPx} y1={topY} x2={cx - rPx} y2={botY}
          stroke="#4d49f3" strokeWidth={1.5} strokeOpacity={0.5} />
        <line x1={cx + rPx} y1={topY} x2={cx + rPx} y2={botY}
          stroke="#4d49f3" strokeWidth={1.5} strokeOpacity={0.5} />
        {/* Bottom ellipse (front half) */}
        <path d={ellipseArc(cx, botY, rPx, ePx, 180, 360)}
          fill="none" stroke="#4d49f3" strokeWidth={1.5} />
        {/* Bottom base fill */}
        <path d={fullEllipse(cx, botY, rPx, ePx)}
          fill={(activePart === 0 || activePart >= 3) ? baseColor : '#818cf8'}
          fillOpacity={(activePart === 0 || activePart >= 3) ? 0.35 : 0.08}
          stroke="none" style={{ transition: 'all 500ms' }} />
        {/* Top ellipse (full) */}
        <path d={fullEllipse(cx, topY, rPx, ePx)}
          fill={(activePart === 1 || activePart >= 3 || highlightBase) ? baseColor : '#818cf8'}
          fillOpacity={(activePart === 1 || activePart >= 3 || highlightBase) ? 0.35 : 0.15}
          stroke="#4d49f3" strokeWidth={1.5} style={{ transition: 'all 500ms' }} />
        {/* Labels for highlight-parts */}
        {activePart === 0 && (
          <g>
            <rect x={cx - 36} y={botY + ePx + 8} width={72} height={22} rx={11} fill={baseColor} opacity={0.92} />
            <text x={cx} y={botY + ePx + 20} textAnchor="middle" dominantBaseline="middle"
              fontSize="12" fontWeight={700} fill="#fff">π·r² = {(Math.PI * r * r).toFixed(1)}</text>
          </g>
        )}
        {activePart === 1 && (
          <g>
            <rect x={cx - 36} y={topY - ePx - 28} width={72} height={22} rx={11} fill={baseColor} opacity={0.92} />
            <text x={cx} y={topY - ePx - 16} textAnchor="middle" dominantBaseline="middle"
              fontSize="12" fontWeight={700} fill="#fff">π·r² = {(Math.PI * r * r).toFixed(1)}</text>
          </g>
        )}
        {activePart === 2 && (
          <g>
            <rect x={cx + rPx + 8} y={(topY + botY) / 2 - 11} width={90} height={22} rx={11} fill={mantleColor} opacity={0.92} />
            <text x={cx + rPx + 53} y={(topY + botY) / 2 + 1} textAnchor="middle" dominantBaseline="middle"
              fontSize="12" fontWeight={700} fill="#fff">2πrv = {(2 * Math.PI * r * h).toFixed(1)}</text>
          </g>
        )}
        {activePart >= 3 && (
          <g>
            <rect x={cx - 80} y={VH - 32} width={160} height={26} rx={13} fill="#312e81" opacity={0.9} />
            <text x={cx} y={VH - 17} textAnchor="middle" dominantBaseline="middle"
              fontSize="13" fontWeight={600} fill="#fff">
              2 podstavy + plášť
            </text>
          </g>
        )}
      </g>
    );
  }

  function renderDimLabels() {
    const dims = [
      { idx: 0, x1: cx, y1: topY, x2: cx + rPx, y2: topY, c: '#4d49f3', lbl: `r = ${r} cm`, mx: cx + rPx / 2, my: topY - 16 },
      { idx: 1, x1: cx + rPx + 12, y1: topY, x2: cx + rPx + 12, y2: botY, c: '#e11d48', lbl: `v = ${h} cm`, mx: cx + rPx + 52, my: (topY + botY) / 2 },
    ];
    return (
      <g>
        {renderCylinder(false, false)}
        {dims.map((dd, i) => {
          const on = i <= activeDim || activeDim >= 2;
          const cur = i === activeDim;
          return (
            <g key={`dim${i}`} style={{ transition: 'opacity 400ms' }} opacity={on ? 1 : 0.3}>
              <line x1={dd.x1} y1={dd.y1} x2={dd.x2} y2={dd.y2}
                stroke={on ? dd.c : '#cbd5e1'}
                strokeWidth={cur ? 4.5 : on ? 3 : 1.5}
                strokeLinecap="round"
                style={{ transition: 'all 400ms' }} />
              {on && (
                <g>
                  <rect x={dd.mx - 42} y={dd.my - 12} width={84} height={24} rx={12} fill={dd.c} opacity={0.92} />
                  <text x={dd.mx} y={dd.my + 1} textAnchor="middle" dominantBaseline="middle"
                    fontSize="14" fontWeight={700} fill="#fff">{dd.lbl}</text>
                </g>
              )}
            </g>
          );
        })}
      </g>
    );
  }

  function renderUnroll() {
    // Show cylinder on left, unrolled rectangle on right
    const t = unrollProgress;
    const rectW = 2 * Math.PI * rPx * 0.55;    // scaled-down for fit
    const rectH = hPx * 0.7;
    const rectX = cx + rPx + 50;
    const rectY = topY + (hPx - rectH) / 2;
    const circumference = 2 * Math.PI * r;

    return (
      <g>
        {/* Cylinder (static) */}
        {renderCylinder(false, true)}
        {/* Arrow */}
        <text x={cx + rPx + 25} y={(topY + botY) / 2}
          textAnchor="middle" dominantBaseline="middle" fontSize="20" fill="#94a3b8"
          opacity={t > 0.2 ? 1 : 0}>→</text>
        {/* Unrolled rectangle */}
        <g opacity={Math.min(t * 3, 1)} style={{ transition: 'opacity 300ms' }}>
          <rect x={rectX} y={rectY} width={rectW * Math.min(t * 1.5, 1)} height={rectH}
            fill="#a5b4fc" fillOpacity={0.25} stroke="#4d49f3" strokeWidth={1.5}
            rx={2} strokeLinejoin="round" />
          {t > 0.5 && (
            <g>
              {/* Width label: 2πr */}
              <line x1={rectX} y1={rectY + rectH + 12} x2={rectX + rectW} y2={rectY + rectH + 12}
                stroke="#10b981" strokeWidth={2.5} />
              <rect x={rectX + rectW / 2 - 44} y={rectY + rectH + 20} width={88} height={20} rx={10} fill="#10b981" opacity={0.92} />
              <text x={rectX + rectW / 2} y={rectY + rectH + 31} textAnchor="middle" dominantBaseline="middle"
                fontSize="11" fontWeight={700} fill="#fff">2πr ≈ {circumference.toFixed(1)} cm</text>
              {/* Height label: v */}
              <line x1={rectX + rectW + 10} y1={rectY} x2={rectX + rectW + 10} y2={rectY + rectH}
                stroke="#e11d48" strokeWidth={2.5} />
              <rect x={rectX + rectW + 16} y={rectY + rectH / 2 - 10} width={56} height={20} rx={10} fill="#e11d48" opacity={0.92} />
              <text x={rectX + rectW + 44} y={rectY + rectH / 2 + 2} textAnchor="middle" dominantBaseline="middle"
                fontSize="11" fontWeight={700} fill="#fff">v = {h} cm</text>
            </g>
          )}
        </g>
      </g>
    );
  }

  // Default label position
  const defLblY = botY + ePx + 20;

  return (
    <svg key={stepKey} viewBox={`0 0 ${VW} ${VH}`} width="100%"
      style={{ maxWidth: anim === 'unroll-mantle' ? 560 : 420, maxHeight: '70vh' }}>
      {anim === 'highlight-dims' ? renderDimLabels()
        : anim === 'unroll-mantle' ? renderUnroll()
        : anim === 'highlight-base' ? (() => { return renderCylinder(true, false); })()
        : anim === 'highlight-mantle' ? (() => { return renderCylinder(false, true); })()
        : anim === 'highlight-parts' ? (() => { return renderCylinder(false, false); })()
        : (
          <g>
            {renderCylinder(false, false)}
            <g>
              <rect x={cx - 55} y={defLblY - 12} width={110} height={24}
                rx={12} fill="#4d49f3" opacity={0.92} />
              <text x={cx} y={defLblY + 1}
                textAnchor="middle" dominantBaseline="middle"
                fontSize="13" fontWeight={700} fill="#fff">
                r={r}, v={h} cm
              </text>
            </g>
          </g>
        )}
    </svg>
  );
}

// ── Pyramid (jehlan) visualisation ──────────────────────────

const DIM_COLORS_PYRAMID = ['#4d49f3', '#e11d48', '#f59e0b', '#10b981'];

function PyramidVis({ edgeA, height, anim = 'none', stepKey }: {
  edgeA: number; height: number; anim?: PyramidAnim; stepKey: number;
}) {
  // Isometric projection — same conventions as CubeVis/CuboidVis
  const S = 38;
  const ux  = S;                       // horizontal offset per +x unit
  const uxz = S * 73 / 125;           // vertical offset per +x or +z unit
  const uy  = S * 145 / 125;          // vertical offset per +y unit

  const PAD = 65;
  const a = edgeA;
  const h = height;

  // Estimate viewBox size
  const cubeW = (a + a) * ux;
  const cubeH = h * uy + 2 * a * uxz;
  const VW = Math.ceil(cubeW + 2 * PAD);
  const VH = Math.ceil(cubeH + 2 * PAD + 24);

  const FX = PAD + a * ux;
  const FY = PAD + 24 + h * uy;

  // Isometric projection: 3D → SVG pixel coords
  function pt(x: number, y: number, z: number): [number, number] {
    return [FX + x * ux - z * ux, FY - y * uy + (x + z) * uxz];
  }

  function d(pts: [number, number][]): string {
    return pts.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ') + 'Z';
  }

  // Key points
  const B0 = pt(0, 0, 0);    // front corner
  const B1 = pt(a, 0, 0);    // right corner
  const B2 = pt(a, 0, a);    // back-right corner
  const B3 = pt(0, 0, a);    // back-left corner
  const AP = pt(a / 2, h, a / 2);  // apex

  // Base center (floor level)
  const BC = pt(a / 2, 0, a / 2);

  // Apothem point (midpoint of front base edge, floor level)
  const MF = pt(a / 2, 0, 0);

  // Slant height from MF to AP
  const apothem = a / 2;
  const slantH = Math.sqrt(h * h + apothem * apothem);

  // ── state ──
  const [activeDim, setActiveDim] = useState(-1);
  const [activeFace, setActiveFace] = useState(-1);
  const [volumePhase, setVolumePhase] = useState(0);

  useEffect(() => { setActiveDim(-1); setActiveFace(-1); setVolumePhase(0); }, [stepKey]);

  useEffect(() => {
    if (anim !== 'highlight-dims') return;
    setActiveDim(-1);
    const t = [
      setTimeout(() => setActiveDim(0), 500),   // a (base edge)
      setTimeout(() => setActiveDim(1), 1500),   // v (height)
      setTimeout(() => setActiveDim(2), 2500),   // v_s (slant height)
      setTimeout(() => setActiveDim(3), 3500),   // all
    ];
    return () => t.forEach(clearTimeout);
  }, [anim, stepKey]);

  useEffect(() => {
    if (anim !== 'highlight-base' && anim !== 'highlight-face' && anim !== 'highlight-faces') return;
    setActiveFace(-1);
    if (anim === 'highlight-base') {
      const t = setTimeout(() => setActiveFace(0), 400);
      return () => clearTimeout(t);
    }
    if (anim === 'highlight-face') {
      const t = setTimeout(() => setActiveFace(1), 400);
      return () => clearTimeout(t);
    }
    // highlight-faces: cycle through base + 4 side faces
    const t = [
      setTimeout(() => setActiveFace(0), 400),   // base
      setTimeout(() => setActiveFace(1), 1400),   // front face
      setTimeout(() => setActiveFace(2), 2200),   // right face
      setTimeout(() => setActiveFace(3), 3000),   // back face
      setTimeout(() => setActiveFace(4), 3800),   // left face
      setTimeout(() => setActiveFace(5), 4600),   // all
    ];
    return () => t.forEach(clearTimeout);
  }, [anim, stepKey]);

  useEffect(() => {
    if (anim !== 'fill-volume') return;
    setVolumePhase(0);
    const t = [
      setTimeout(() => setVolumePhase(1), 600),   // show cuboid outline
      setTimeout(() => setVolumePhase(2), 1800),   // show pyramid inside
      setTimeout(() => setVolumePhase(3), 3000),   // show "⅓" label
    ];
    return () => t.forEach(clearTimeout);
  }, [anim, stepKey]);

  // Visible faces in painter order (back faces first)
  // For isometric view from front-left:
  // Back face: B2-B3-AP  (visible, drawn first)
  // Left face: B3-B0-AP  (visible)
  // Right face: B1-B2-AP (visible)
  // Front face: B0-B1-AP (visible, drawn last)
  // Base: B0-B1-B2-B3    (partially visible — bottom)
  const faces = [
    { pts: [B0, B1, B2, B3], idx: 0, label: `a² = ${a * a}`, color: '#10b981' },          // base
    { pts: [B2, B3, AP], idx: 3, label: '', color: '#a78bfa' },                             // back face
    { pts: [B3, B0, AP], idx: 4, label: '', color: '#818cf8' },                             // left face
    { pts: [B1, B2, AP], idx: 2, label: '', color: '#a5b4fc' },                             // right face
    { pts: [B0, B1, AP], idx: 1, label: `½·a·v_s`, color: '#6366f1' },                      // front face
  ];

  // Default translucent pyramid
  const defaultFills = ['#818cf8', '#a78bfa', '#818cf8', '#a5b4fc', '#6366f1'];
  const defaultOpacities = [0.12, 0.18, 0.22, 0.18, 0.25];

  function renderPyramid(highlightMode: boolean) {
    return (
      <g>
        {faces.map((f, i) => {
          const fActive = highlightMode && (f.idx === activeFace || activeFace >= 5);
          const fill = fActive ? f.color : defaultFills[i];
          const opacity = fActive ? 0.55 : defaultOpacities[i];
          const cx = f.pts.reduce((s, p) => s + p[0], 0) / f.pts.length;
          const cy = f.pts.reduce((s, p) => s + p[1], 0) / f.pts.length;
          return (
            <g key={i}>
              <path d={d(f.pts)}
                fill={fill} fillOpacity={opacity}
                stroke="#4d49f3" strokeOpacity={0.5} strokeWidth={1.5} strokeLinejoin="round"
                style={{ transition: 'all 500ms ease' }} />
              {fActive && f.label && (
                <g>
                  <rect x={cx - 42} y={cy - 12} width={84} height={24} rx={12} fill="#fff" opacity={0.9} />
                  <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
                    fontSize="13" fontWeight={700} fill={f.color}>
                    {f.label}
                  </text>
                </g>
              )}
            </g>
          );
        })}
        {highlightMode && activeFace >= 5 && (
          <g>
            <rect x={VW / 2 - 75} y={VH - 32} width={150} height={26} rx={13} fill="#312e81" opacity={0.9} />
            <text x={VW / 2} y={VH - 17} textAnchor="middle" dominantBaseline="middle"
              fontSize="13" fontWeight={600} fill="#fff">
              Podstava + 4 stěny
            </text>
          </g>
        )}
      </g>
    );
  }

  function renderDimLabels() {
    // a — base front edge (B0 → B1)
    const aM = [(B0[0] + B1[0]) / 2, (B0[1] + B1[1]) / 2 + 22] as const;
    // v — height (BC → AP, but shown as dashed vertical line)
    const vM = [(BC[0] + AP[0]) / 2 - 18, (BC[1] + AP[1]) / 2] as const;
    // v_s — slant height (MF → AP)
    const vsM = [(MF[0] + AP[0]) / 2 + 18, (MF[1] + AP[1]) / 2] as const;

    const dims = [
      { x1: B0[0], y1: B0[1], x2: B1[0], y2: B1[1], mx: aM[0], my: aM[1], c: DIM_COLORS_PYRAMID[0], lbl: `a = ${a} cm`, idx: 0 },
      { x1: BC[0], y1: BC[1], x2: AP[0], y2: AP[1], mx: vM[0], my: vM[1], c: DIM_COLORS_PYRAMID[1], lbl: `v = ${h} cm`, idx: 1, dashed: true },
      { x1: MF[0], y1: MF[1], x2: AP[0], y2: AP[1], mx: vsM[0], my: vsM[1], c: DIM_COLORS_PYRAMID[2], lbl: `v_s ≈ ${Math.round(slantH * 100) / 100}`, idx: 2, dashed: true },
    ];

    const pillW = 96, pillH = 26, pillR = 13;

    return (
      <g>
        {renderPyramid(false)}
        {dims.map((dd, i) => {
          const on = i <= activeDim || activeDim >= 3;
          const cur = i === activeDim;
          return (
            <g key={`dim${i}`} style={{ transition: 'opacity 400ms' }} opacity={on ? 1 : 0.25}>
              <line x1={dd.x1} y1={dd.y1} x2={dd.x2} y2={dd.y2}
                stroke={on ? dd.c : '#cbd5e1'}
                strokeWidth={cur ? 4.5 : on ? 3 : 1.5}
                strokeLinecap="round"
                strokeDasharray={dd.dashed ? '6 4' : 'none'}
                style={{ transition: 'all 400ms' }} />
              {on && (
                <g>
                  <rect x={dd.mx - pillW / 2} y={dd.my - pillH / 2} width={pillW} height={pillH}
                    rx={pillR} fill={dd.c} opacity={0.92} />
                  <text x={dd.mx} y={dd.my + 1}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize="14" fontWeight={700} fill="#fff">{dd.lbl}</text>
                </g>
              )}
            </g>
          );
        })}
      </g>
    );
  }

  function renderVolumeComparison() {
    // Show transparent cuboid, pyramid inside, and "⅓" label
    const C0 = pt(0, 0, 0), C1 = pt(a, 0, 0), C2 = pt(a, 0, a), C3 = pt(0, 0, a);
    const C4 = pt(0, h, 0), C5 = pt(a, h, 0), C6 = pt(a, h, a), C7 = pt(0, h, a);

    return (
      <g>
        {/* Cuboid wireframe (transparent) */}
        {volumePhase >= 1 && (
          <g opacity={Math.min(1, volumePhase >= 1 ? 1 : 0)} style={{ transition: 'opacity 600ms' }}>
            {/* Bottom face */}
            <path d={d([C0, C1, C2, C3])} fill="#818cf8" fillOpacity={0.06}
              stroke="#94a3b8" strokeWidth={1.2} strokeDasharray="6 4" strokeLinejoin="round" />
            {/* Left face */}
            <path d={d([C0, C3, C7, C4])} fill="#818cf8" fillOpacity={0.04}
              stroke="#94a3b8" strokeWidth={1.2} strokeDasharray="6 4" strokeLinejoin="round" />
            {/* Right face */}
            <path d={d([C0, C4, C5, C1])} fill="#818cf8" fillOpacity={0.04}
              stroke="#94a3b8" strokeWidth={1.2} strokeDasharray="6 4" strokeLinejoin="round" />
            {/* Top face */}
            <path d={d([C4, C7, C6, C5])} fill="#818cf8" fillOpacity={0.04}
              stroke="#94a3b8" strokeWidth={1.2} strokeDasharray="6 4" strokeLinejoin="round" />
            {/* Back faces (hidden edges) */}
            <line x1={C1[0]} y1={C1[1]} x2={C5[0]} y2={C5[1]}
              stroke="#94a3b8" strokeWidth={0.8} strokeDasharray="4 3" />
            <line x1={C2[0]} y1={C2[1]} x2={C6[0]} y2={C6[1]}
              stroke="#94a3b8" strokeWidth={0.8} strokeDasharray="4 3" />
            <line x1={C3[0]} y1={C3[1]} x2={C7[0]} y2={C7[1]}
              stroke="#94a3b8" strokeWidth={0.8} strokeDasharray="4 3" />
          </g>
        )}
        {/* Solid pyramid inside */}
        {volumePhase >= 2 && (
          <g style={{ transition: 'opacity 600ms' }}>
            {faces.slice(1).map((f, i) => (
              <path key={i} d={d(f.pts)}
                fill={defaultFills[i + 1]} fillOpacity={0.45}
                stroke="#4d49f3" strokeWidth={1.5} strokeLinejoin="round" />
            ))}
            <path d={d(faces[0].pts)}
              fill="#818cf8" fillOpacity={0.2}
              stroke="#4d49f3" strokeWidth={1.5} strokeLinejoin="round" />
          </g>
        )}
        {/* ⅓ label */}
        {volumePhase >= 3 && (
          <g>
            <rect x={VW / 2 - 90} y={VH - 38} width={180} height={30} rx={15} fill="#312e81" opacity={0.92} />
            <text x={VW / 2} y={VH - 21} textAnchor="middle" dominantBaseline="middle"
              fontSize="15" fontWeight={700} fill="#fff">
              V_jehlan = ⅓ · V_kvádr
            </text>
          </g>
        )}
      </g>
    );
  }

  // Default label
  const defLblX = (B0[0] + B1[0]) / 2;
  const defLblY = (B0[1] + B1[1]) / 2 + 24;

  return (
    <svg key={stepKey} viewBox={`0 0 ${VW} ${VH}`} width="100%" style={{ maxWidth: 420, maxHeight: '70vh' }}>
      {anim === 'highlight-dims' ? renderDimLabels()
        : anim === 'fill-volume' ? renderVolumeComparison()
        : anim === 'highlight-base' || anim === 'highlight-face' || anim === 'highlight-faces'
          ? renderPyramid(true)
          : (
            <g>
              {renderPyramid(false)}
              <g>
                <rect x={defLblX - 60} y={defLblY - 13} width={120} height={26}
                  rx={13} fill="#4d49f3" opacity={0.92} />
                <text x={defLblX} y={defLblY + 1}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize="14" fontWeight={700} fill="#fff">
                  a={a}, v={h} cm
                </text>
              </g>
            </g>
          )}
    </svg>
  );
}

// ── Main component ─────────────────────────────────────────

export function TutorialPage() {
  const { tutorialId } = useParams<{ tutorialId: string }>();
  const navigate = useNavigate();

  const tutorial = TUTORIALS[tutorialId || ''];

  const [stepIdx, setStepIdx] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [answerState, setAnswerState] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const [showHint, setShowHint] = useState(false);
  // Key to force remount/reset animation on step change
  const [animKey, setAnimKey] = useState(0);

  const step = tutorial?.steps[stepIdx];
  const totalSteps = tutorial?.steps.length ?? 0;
  const isLast = stepIdx >= totalSteps - 1;

  const resetStep = useCallback(() => {
    setUserAnswer('');
    setAnswerState('idle');
    setShowHint(false);
    setAnimKey((k) => k + 1);
  }, []);

  const goNext = useCallback(() => {
    if (isLast) return;
    setStepIdx((i) => i + 1);
    resetStep();
  }, [isLast, resetStep]);

  const goPrev = useCallback(() => {
    if (stepIdx === 0) return;
    setStepIdx((i) => i - 1);
    resetStep();
  }, [stepIdx, resetStep]);

  const checkAnswer = useCallback(() => {
    if (!step?.question) return;
    const num = parseFloat(userAnswer.replace(',', '.'));
    if (Number.isFinite(num) && Math.abs(num - step.question.correctAnswer) < 0.01) {
      setAnswerState('correct');
    } else {
      setAnswerState('wrong');
    }
  }, [step, userAnswer]);

  const gap = 16;
  const canGoNext = !step?.question || answerState === 'correct';

  if (!tutorial) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#64748b', fontSize: 18, marginBottom: 16 }}>Tutoriál nenalezen.</p>
          <button onClick={() => navigate('/')} style={{ color: '#4d49f3', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15 }}>
            <ArrowLeft style={{ display: 'inline', width: 16, height: 16, verticalAlign: 'middle', marginRight: 4 }} />
            Zpět
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#fff',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'row',
        fontFamily: "'Fenomen Sans', ui-sans-serif, system-ui, sans-serif",
      }}
    >
      {/* ─── Left panel: tutorial content ─── */}
      <div
        style={{
          width: '50%',
          display: 'flex',
          flexDirection: 'column',
          background: '#ffffff',
          overflow: 'hidden',
        }}
      >
        {/* Header bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, flexShrink: 0 }}>
          <button
            onClick={() => navigate('/')}
            style={{
              width: 40, height: 40, borderRadius: '50%', background: '#f8fafc',
              border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
            title="Zpět"
          >
            <ArrowLeft style={{ width: 16, height: 16, color: '#475569' }} />
          </button>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 14, color: '#94a3b8' }}>Tutoriál</span>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#0f172a' }}>
              {tutorial.objectName} — {tutorial.taskLabel}
            </div>
          </div>
          <span style={{ fontSize: 18, color: '#94a3b8', fontWeight: 500 }}>
            {stepIdx + 1}/{totalSteps}
          </span>
        </div>

        {/* Progress bar */}
        <div style={{ height: 3, background: '#e2e8f0', flexShrink: 0 }}>
          <div
            style={{
              height: '100%',
              width: `${((stepIdx + 1) / totalSteps) * 100}%`,
              background: '#4d49f3',
              transition: 'width 300ms ease',
              borderRadius: '0 2px 2px 0',
            }}
          />
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '32px 28px 20px' }}>
          {/* Step title */}
          <h2 style={{ fontSize: 32, fontWeight: 600, color: '#09056f', marginBottom: 16, marginTop: 0 }}>{step?.title}</h2>

          {/* Explanation */}
          <p
            style={{ fontSize: 22, lineHeight: 1.65, color: '#334155', marginBottom: 24 }}
            dangerouslySetInnerHTML={{ __html: step?.explanation || '' }}
          />

          {/* Formula */}
          {step?.formula && (
            <div
              style={{
              background: '#eef2ff', border: '2px solid #c7d2fe', borderRadius: 16,
              padding: '20px 28px', textAlign: 'center', marginBottom: 24,
            }}
          >
            <span style={{ fontSize: 28, fontWeight: 700, color: '#4338ca', letterSpacing: '0.02em' }}>{step.formula}</span>
            </div>
          )}

          {/* Question */}
          {step?.question && (
            <div
              style={{
                background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 16,
                padding: 24, marginBottom: 20,
              }}
            >
              <p style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', marginBottom: 16, marginTop: 0 }}>{step.question.prompt}</p>

              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                <input
                  type="text"
                  inputMode="decimal"
                  value={userAnswer}
                  onChange={(e) => { setUserAnswer(e.target.value); setAnswerState('idle'); }}
                  onKeyDown={(e) => e.key === 'Enter' && checkAnswer()}
                  placeholder="Tvoje odpověď"
                  style={{
                    flex: 1, padding: '14px 18px', fontSize: 22, borderRadius: 12,
                    border: answerState === 'correct' ? '2px solid #22c55e' : answerState === 'wrong' ? '2px solid #ef4444' : '2px solid #cbd5e1',
                    outline: 'none', transition: 'border-color 200ms', fontFamily: 'inherit',
                  }}
                />
                <span style={{ fontSize: 20, color: '#64748b', fontWeight: 500 }}>{step.question.unit}</span>
                <button
                  onClick={checkAnswer}
                  disabled={!userAnswer.trim()}
                  style={{
                    padding: '14px 28px', borderRadius: 12,
                    background: userAnswer.trim() ? '#4d49f3' : '#cbd5e1',
                    color: '#fff', fontWeight: 600, fontSize: 18, border: 'none',
                    cursor: userAnswer.trim() ? 'pointer' : 'default', transition: 'background 200ms',
                  }}
                >
                  Zkontrolovat
                </button>
              </div>

              {answerState === 'correct' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#16a34a', fontSize: 20, fontWeight: 600 }}>
                <CheckCircle2 style={{ width: 24, height: 24 }} /> Správně! Výborně!
                </div>
              )}
              {answerState === 'wrong' && (
                <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#dc2626', fontSize: 20, fontWeight: 600, marginBottom: 10 }}>
                  <XCircle style={{ width: 24, height: 24 }} /> Zkus to znovu
                  </div>
                  {!showHint && (
                    <button
                      onClick={() => setShowHint(true)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      background: '#fefce8', border: '1px solid #fde68a', borderRadius: 10,
                      padding: '10px 18px', fontSize: 18, color: '#92400e', cursor: 'pointer',
                    }}
                  >
                    <Lightbulb style={{ width: 20, height: 20 }} /> Nápověda
                    </button>
                  )}
                </div>
              )}
              {showHint && (
                <div
                  style={{
                    marginTop: 10, background: '#fefce8', border: '1px solid #fde68a',
                    borderRadius: 12, padding: '14px 18px', fontSize: 18, color: '#92400e',
                  }}
                >
                  <Lightbulb style={{ width: 14, height: 14, display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
                  {step.question.hint}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom navigation bar */}
        <div
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 20px', flexShrink: 0, borderTop: '1px solid #f1f5f9',
          }}
        >
          <button
            onClick={goPrev}
            disabled={stepIdx === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '14px 24px', borderRadius: 12,
              border: '1px solid #e2e8f0',
              background: stepIdx === 0 ? '#f8fafc' : '#fff',
              color: stepIdx === 0 ? '#94a3b8' : '#334155',
              cursor: stepIdx === 0 ? 'default' : 'pointer', fontSize: 18, fontWeight: 500,
            }}
          >
            <ArrowLeft style={{ width: 20, height: 20 }} /> Zpět
          </button>

          {isLast ? (
            <button
              onClick={() => navigate('/')}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '14px 28px', borderRadius: 12,
                background: '#4d49f3', color: '#fff', fontWeight: 600, fontSize: 18, border: 'none',
                cursor: 'pointer', boxShadow: '0 4px 12px rgba(77,73,243,0.3)',
              }}
            >
              <RotateCcw style={{ width: 20, height: 20 }} /> Hotovo
            </button>
          ) : (
            <button
              onClick={goNext}
              disabled={!canGoNext}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '14px 28px', borderRadius: 12,
                background: canGoNext ? '#4d49f3' : '#cbd5e1',
                color: '#fff', fontWeight: 600, fontSize: 18, border: 'none',
                cursor: canGoNext ? 'pointer' : 'default',
                boxShadow: canGoNext ? '0 4px 12px rgba(77,73,243,0.3)' : 'none',
                transition: 'all 200ms',
              }}
            >
              Další <ArrowRight style={{ width: 20, height: 20 }} />
            </button>
          )}
        </div>
      </div>

      {/* ─── Right panel: animated visualisation ─── */}
      <div
        style={{
          width: '50%',
          position: 'relative',
          padding: gap,
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'stretch',
        }}
      >
        <div
          style={{
            flex: 1,
            borderRadius: 16,
            background: '#E0E7FF',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {step?.squareSide ? (
            <SquareVis side={step.squareSide} anim={step.anim || 'none'} stepKey={animKey} />
          ) : step?.rectA != null && step?.rectB != null ? (
            <RectVis sideA={step.rectA} sideB={step.rectB} anim={step.rectAnim || 'none'} stepKey={animKey} />
          ) : step?.triA != null && step?.triB != null ? (
            <TriangleVis sideA={step.triA} sideB={step.triB} apex={step.triApex ?? 0} anim={step.triAnim || 'none'} stepKey={animKey} />
          ) : step?.cubeEdge ? (
            <CubeVis edge={step.cubeEdge} anim={step.cubeAnim || 'none'} stepKey={animKey} />
          ) : step?.cuboidA != null && step?.cuboidB != null && step?.cuboidC != null ? (
            <CuboidVis edgeA={step.cuboidA} edgeB={step.cuboidB} edgeC={step.cuboidC} anim={step.cuboidAnim || 'none'} stepKey={animKey} />
          ) : step?.circleR != null ? (
            <CircleVis radius={step.circleR} sectors={step.circleSectors} anim={step.circleAnim || 'none'} stepKey={animKey} />
          ) : step?.pyramidA != null && step?.pyramidH != null ? (
            <PyramidVis edgeA={step.pyramidA} height={step.pyramidH} anim={step.pyramidAnim || 'none'} stepKey={animKey} />
          ) : step?.cylinderR != null && step?.cylinderH != null ? (
            <CylinderVis radius={step.cylinderR} cylHeight={step.cylinderH} anim={step.cylinderAnim || 'none'} stepKey={animKey} />
          ) : step?.prismA != null && step?.prismH != null && step?.prismSides != null ? (
            <PrismVis sides={step.prismSides} edgeA={step.prismA} prismHeight={step.prismH} anim={step.prismAnim || 'none'} stepKey={animKey} />
          ) : step?.coneR != null && step?.coneH != null ? (
            <ConeVis radius={step.coneR} coneHeight={step.coneH} anim={step.coneAnim || 'none'} stepKey={animKey} />
          ) : step?.sphereR != null ? (
            <SphereVis radius={step.sphereR} anim={step.sphereAnim || 'none'} stepKey={animKey} />
          ) : (
            <span style={{ color: '#94a3b8', fontSize: 15 }}>Objekt</span>
          )}
        </div>
      </div>
    </div>
  );
}
