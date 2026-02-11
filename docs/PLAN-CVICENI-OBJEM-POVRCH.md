# Plán: Mód „Cvičení“ – výpočet objemu a povrchu

## 1. RVP a učivo na ZŠ

### Co žáci počítají a jak

- **6. ročník**
  - **Krychle:** objem V = a³, povrch S = 6a² (jednotky: cm, dm, m → cm³, dm³, m³, cm², …).
  - **Kvádr:** objem V = a · b · c, povrch S = 2(ab + ac + bc).
  - Postup: přečíst rozměry, dosadit do vzorce, dopočítat, zapsat výsledek včetně jednotek.

- **7. ročník**
  - **Hranol:** objem V = Sₚ · v (obsah podstavy × výška), povrch S = 2Sₚ + Sₚₗ (dvě podstavy + plášť).
  - Žáci nejdřív spočítají obsah podstavy (např. trojúhelník, šestúhelník), pak objem a povrch.

- **8. ročník**
  - **Jehlan:** V = (1/3) · Sₚ · v.
  - **Válec:** V = πr²v, S = 2πr(r + v).
  - **Kužel:** V = (1/3)πr²v, S = πr(r + s) (s = délka strany).
  - **Koule:** V = (4/3)πr³, S = 4πr².

V RVP (a v praxi) se u všech těles klade důraz na:
- správné dosazení do vzorce,
- jednotky (délka v cm/dm/m, objem v cm³/dm³/m³, povrch v cm²/dm²/m²),
- zaokrouhlování na 1–2 desetinná místa dle zadání.

---

## 2. Návrh módu „Cvičení“

### 2.1 Účel

- Žák vidí konkrétní těleso (3D náhled vpravo) s danými rozměry.
- V levém panelu má zadání (např. „Vypočítejte objem kvádru.“) a zadané rozměry.
- Do pole napíše číselnou odpověď (s jednotkou nebo bez – jednotka může být pevně uvedená).
- Po kontrole dostane zpětnou vazbu (správně / špatně, popř. správný výsledek).

### 2.2 Zdroj rozměrů

- **Náhodné:** rozměry se vygenerují z rozsahů daných v `parameterDefs` (min, max, step) pro dané těleso. Každé načtení/obnovení úlohy = nové čísla.
- **Zadané učitelem (volitelně později):** učitel zadá konkrétní rozměry (např. a = 5, b = 4, c = 10) a odkaz s těmito parametry pošle žákům (query parametry nebo jednoduchý „kód úlohy“). V první fázi stačí náhodné rozměry.

### 2.3 Typ úlohy

- **Objem** – úloha typu „Vypočítejte objem [tělesa].“
- **Povrch** – „Vypočítejte povrch [tělesa].“

Pro každé těleso (krychle, kvádr, hranol, jehlan, válec, kužel, koule) budou podporovány úlohy na objem a povrch podle toho, co RVP a `computeProperties` u objektu nabízejí (už teď máte objem a povrch v matematických vlastnostech).

### 2.4 Vzhled a chování

- **Layout:** Stejný jako u prohlížení objektu – vlevo panel, vpravo 3D náhled.
- **Levý panel v módu Cvičení:**
  - Nahoře: název tělesa + badge „Cvičení“ nebo „Výpočet“.
  - Zadání: jedna věta („Vypočítejte objem kvádru.“ / „Vypočítejte povrch kvádru.“).
  - Zobrazené rozměry: např. „a = 10 cm, b = 6 cm, c = 8 cm“ (u kvádru). U jiných těles odpovídající parametry (r, v, a, …) včetně jednotek.
  - Jedno vstupní pole pro odpověď (číslo; jednotka může být vedle pole jako text „cm³“ / „cm²“).
  - Tlačítko „Zkontrolovat“.
  - Po kontrole: zpráva „Správně.“ / „Špatně. Správný výsledek: …“ (příp. zobrazení správného vzorce jen v režimu pro učitele – lze doplnit později).
- **Pravá část:** Stejný 3D viewer jako na stránce objektu, ale s **pevnými** rozměry dané úlohy (žák nemění posuvníky; posuvníky v módu cvičení nejsou, nebo jsou disabled).
- **Navigace:** Zpět na rozcestník (šipka v kolečku) jako nyní; přepnutí „Zpět na prohlížení [tělesa]“ (odkaz na `/:objectId`) je vhodné, aby žák mohl stejné těleso prohlížet i s posuvníky.

### 2.5 Vyhodnocení odpovědi

- **Správný výsledek:** Získáme z existující logiky – `def.computeProperties(params)` vrací např. `{ label: 'Objem', value: '480 cm³', color: 'purple' }`. Z hodnoty vytáhneme číslo (480) a jednotku (cm³). Případně můžeme pro každé těleso a typ úlohy (objem/povrch) počítat hodnotu přímo ve cvičném módu ze stejných vzorců jako v `computeCuboidProperties` atd.
- **Porovnání:** Žákovský vstup parsujeme jako číslo (desetinná tečka/čárka). Tolerance: malá odchylka zaokrouhlování (např. 0,01 nebo 1 jednotka v poslední platné číslici), aby se nebraly za chybu správné výsledky typu 376 vs 376.0.
- Jednotky: V první verzi lze mít u pole pevně napsáno „cm³“ nebo „cm²“ a vyžadovat jen číslo; případně akceptovat i „480 cm³“ a z textu vyparsovat číslo.

---

## 3. Implementační kroky (stručně)

1. **Routing a režim**
   - Přidat cestu např. `/:objectId/cviceni` (nebo `/:objectId?mode=cviceni`).
   - Na stránce objektu rozlišit režim „prohlížení“ vs „cvičení“ (parametr z URL nebo query).

2. **Generování úlohy**
   - Pro dané `objectId` a typ úlohy (objem / povrch) vygenerovat `params` (náhodně z min/max/step z `parameterDefs`, nebo později z query/konfigurace od učitele).
   - Uložit do stavu; při přepnutí na „novou úlohu“ (tlačítko „Další úloha?“) vygenerovat nové `params`.

3. **Levý panel v módu Cvičení**
   - Nová komponenta např. `ObjectQuizPanel` (nebo sekce v `ObjectControls` při `mode === 'quiz'`):
     - zobrazí zadání (objem/povrch),
     - zobrazí rozměry z `params` (s jednotkami),
     - input + „Zkontrolovat“,
     - po kontrole zobrazí správně/špatně + případně správný výsledek.

4. **Výpočet správné odpovědi**
   - Z `def.computeProperties(params)` najít položku „Objem“ nebo „Povrch“ a z `value` vyparsovat číslo (a jednotku). Nebo mít malou pomocnou funkci `getVolume(params, objectId)` / `getSurface(params, objectId)`, která pro každé těleso vrátí číslo (případně i jednotku), aby byl jeden zdroj pravdy.

5. **3D náhled**
   - Stejný `Canvas3DViewer` + `computeFaces(params, …)` s `params` z úlohy. Bez ovladačů (nebo s disabled sliders) v levém panelu.

6. **Přepínání režimů**
   - Na rozcestníku nebo na stránce objektu odkaz „Cvičení: objem a povrch“ → `/:objectId/cviceni`.
   - V módu cvičení odkaz „Prohlížet těleso“ → `/:objectId`.

7. **Rozšíření pro učitele (později)**
   - Query parametry např. `?a=5&b=4&c=10` pro pevné rozměry.
   - Nebo jednoduchý „kód úlohy“ (hash parametrů), který učitel zkopíruje a žáci otevřou stejnou úlohu.

---

## 4. Shrnutí

| Co | Jak |
|----|-----|
| **RVP** | 6. tř.: krychle, kvádr (V, S). 7. tř.: hranol (V, S). 8. tř.: jehlan, válec, kužel, koule (V, S). Postup: vzorec, dosazení, jednotky. |
| **Mód** | Nová stránka/mód „Cvičení“ na `/:objectId/cviceni`. |
| **Levý panel** | Zadání (objem/povrch), zadané rozměry, vstup pro odpověď, tlačítko Zkontrolovat, zpětná vazba. |
| **Rozměry** | 1. fáze: náhodné z limitů tělesa. Později: zadané učitelem (URL parametry). |
| **Vyhodnocení** | Číslo ze `computeProperties` vs zadané číslo; tolerance zaokrouhlování; jednotky cm³/cm². |
| **Pravá část** | Stejný 3D viewer s pevnými parametry úlohy, bez ovládání rozměrů. |

Tím bude mít aplikace druhý mód vedle prohlížení: žáci u daného tělesa přímo počítají objem nebo povrch podle RVP a dostanou okamžitou kontrolu.
