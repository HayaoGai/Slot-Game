/**
 * 以程式組出 SVG，光柵化為 PNG。
 *
 *   pnpm gen:symbols
 *
 * 輸出：
 *   assets/resources/textures/symbols/<ID>.png   256x256，9 種符號
 *   assets/resources/textures/ui/background.png  1920x720，純裝飾背景
 *   assets/resources/textures/ui/white.png       純白小圖，供 Sprite 著色使用
 *   assets/resources/textures/ui/glow.png        放射狀光暈，供中獎演出使用
 */
import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import type { SymbolId } from '../assets/scripts/core/types';

const ROOT = process.cwd();
const SYMBOL_DIR = path.join(ROOT, 'assets/resources/textures/symbols');
const UI_DIR = path.join(ROOT, 'assets/resources/textures/ui');
const SIZE = 256;
const FONT = `'Arial Black', 'Segoe UI Black', Arial, sans-serif`;

interface Palette {
    top: string;
    bottom: string;
    border: string;
}

/** 所有符號共用的外框：相同的圓角、邊框寬度與內縮留白，確保盤面上視覺重量一致。 */
function framed(palette: Palette, content: string, defs = ''): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${palette.top}"/>
      <stop offset="1" stop-color="${palette.bottom}"/>
    </linearGradient>
    <radialGradient id="shine" cx="0.5" cy="0.18" r="0.75">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.32"/>
      <stop offset="0.6" stop-color="#ffffff" stop-opacity="0.04"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    ${defs}
  </defs>
  <rect x="12" y="12" width="232" height="232" rx="36" fill="url(#panel)"/>
  <rect x="12" y="12" width="232" height="232" rx="36" fill="url(#shine)"/>
  <rect x="12" y="12" width="232" height="232" rx="36" fill="none" stroke="${palette.border}" stroke-width="6"/>
  <rect x="22" y="22" width="212" height="212" rx="28" fill="none" stroke="#000000" stroke-opacity="0.25" stroke-width="2"/>
  ${content}
</svg>`;
}

function letter(char: string, palette: Palette, outline: string): string {
    return framed(
        palette,
        `<text x="128" y="182" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="150"
           fill="#ffffff" stroke="${outline}" stroke-width="12" stroke-linejoin="round" paint-order="stroke">${char}</text>`,
    );
}

function starPath(cx: number, cy: number, outer: number, inner: number): string {
    const points: string[] = [];
    for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const angle = -Math.PI / 2 + (i * Math.PI) / 5;
        points.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
    }
    return `M${points.join(' L')} Z`;
}

const SYMBOLS: Record<SymbolId, () => string> = {
    J: () => letter('J', { top: '#4f8dff', bottom: '#1d4fb8', border: '#b9d3ff' }, '#0d2a66'),
    Q: () => letter('Q', { top: '#4fd07c', bottom: '#1c8a45', border: '#bff0cf' }, '#0b4020'),
    K: () => letter('K', { top: '#ff6a5c', bottom: '#b82a22', border: '#ffc9c2' }, '#5c0f0a'),
    A: () => letter('A', { top: '#ffab4a', bottom: '#cc6a10', border: '#ffe0b8' }, '#663000'),

    H1: () =>
        framed(
            { top: '#4a2380', bottom: '#1d0b3a', border: '#c49bff' },
            `<polygon points="64,100 98,58 158,58 192,100" fill="url(#crownFacet)" stroke="#f1e2ff" stroke-width="4" stroke-linejoin="round"/>
             <polygon points="64,100 192,100 128,206" fill="url(#pavilion)" stroke="#f1e2ff" stroke-width="4" stroke-linejoin="round"/>
             <polyline points="98,58 112,100 128,58 144,100 158,58" fill="none" stroke="#f1e2ff" stroke-opacity="0.8" stroke-width="3"/>
             <polyline points="112,100 128,206 144,100" fill="none" stroke="#f1e2ff" stroke-opacity="0.6" stroke-width="3"/>
             <polygon points="104,66 118,66 108,92" fill="#ffffff" fill-opacity="0.55"/>`,
            `<linearGradient id="crownFacet" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e6c7ff"/><stop offset="1" stop-color="#a45cf0"/></linearGradient>
             <linearGradient id="pavilion" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9b4dea"/><stop offset="1" stop-color="#4b148f"/></linearGradient>`,
        ),

    H2: () =>
        framed(
            { top: '#5c4100', bottom: '#2a1c00', border: '#ffd54a' },
            `<circle cx="128" cy="128" r="82" fill="url(#coin)" stroke="#8a5d00" stroke-width="6"/>
             <circle cx="128" cy="128" r="62" fill="none" stroke="#fff1a8" stroke-width="5"/>
             <circle cx="128" cy="128" r="56" fill="url(#coinInner)"/>
             <path d="${starPath(128, 132, 34, 15)}" fill="#b07a00" stroke="#fff1a8" stroke-width="3" stroke-linejoin="round"/>
             <ellipse cx="102" cy="88" rx="22" ry="10" transform="rotate(-30 102 88)" fill="#ffffff" fill-opacity="0.45"/>`,
            `<linearGradient id="coin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff08a"/><stop offset="0.5" stop-color="#f5c02a"/><stop offset="1" stop-color="#c78a00"/></linearGradient>
             <linearGradient id="coinInner" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffe066"/><stop offset="1" stop-color="#e0a100"/></linearGradient>`,
        ),

    H3: () =>
        framed(
            { top: '#8c1426', bottom: '#3d0510', border: '#ffcc33' },
            `<path d="M54 176 L62 88 L100 126 L128 66 L156 126 L194 88 L202 176 Z" fill="url(#gold)" stroke="#6b4100" stroke-width="5" stroke-linejoin="round"/>
             <rect x="52" y="170" width="152" height="28" rx="8" fill="url(#gold)" stroke="#6b4100" stroke-width="5"/>
             <circle cx="62" cy="84" r="11" fill="#ffe27a" stroke="#6b4100" stroke-width="4"/>
             <circle cx="128" cy="62" r="12" fill="#ffe27a" stroke="#6b4100" stroke-width="4"/>
             <circle cx="194" cy="84" r="11" fill="#ffe27a" stroke="#6b4100" stroke-width="4"/>
             <circle cx="92" cy="184" r="8" fill="#e0203a" stroke="#ffe9a8" stroke-width="2"/>
             <circle cx="128" cy="184" r="9" fill="#e0203a" stroke="#ffe9a8" stroke-width="2"/>
             <circle cx="164" cy="184" r="8" fill="#e0203a" stroke="#ffe9a8" stroke-width="2"/>
             <path d="M128 112 L140 132 L128 152 L116 132 Z" fill="#e0203a" stroke="#ffe9a8" stroke-width="3"/>`,
            `<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2a0"/><stop offset="0.55" stop-color="#f2b822"/><stop offset="1" stop-color="#b87800"/></linearGradient>`,
        ),

    WILD: () =>
        framed(
            { top: '#2d2d2d', bottom: '#060606', border: '#e8b923' },
            `<path d="M26 98 L230 98 L214 128 L230 158 L26 158 L42 128 Z" fill="url(#banner)" stroke="#5c4000" stroke-width="5" stroke-linejoin="round"/>
             <text x="128" y="147" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="54" fill="#141414" letter-spacing="2">WILD</text>
             <path d="${starPath(62, 62, 16, 6)}" fill="#ffd54a"/>
             <path d="${starPath(196, 200, 14, 5)}" fill="#ffd54a"/>
             <path d="${starPath(200, 60, 9, 3.5)}" fill="#fff1a8"/>`,
            `<linearGradient id="banner" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1a0"/><stop offset="0.5" stop-color="#e8b923"/><stop offset="1" stop-color="#a87400"/></linearGradient>`,
        ),

    SCATTER: () =>
        framed(
            { top: '#0f5a58', bottom: '#032626', border: '#46e6d6' },
            `<path d="${starPath(128, 136, 96, 40)}" fill="url(#star)" stroke="#e0fffb" stroke-width="6" stroke-linejoin="round"/>
             <path d="${starPath(128, 136, 50, 21)}" fill="#bffff6" fill-opacity="0.55"/>`,
            `<linearGradient id="star" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ffcef"/><stop offset="1" stop-color="#0f9e90"/></linearGradient>`,
        ),
};

function background(): string {
    const stripes = Array.from({ length: 40 }, (_, i) => {
        const x = -720 + i * 72;
        return `<path d="M${x} 720 L${x + 720} 0" stroke="#ffffff" stroke-opacity="0.025" stroke-width="18"/>`;
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="720" viewBox="0 0 1920 720">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#241046"/>
      <stop offset="1" stop-color="#0b0619"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.45">
      <stop offset="0" stop-color="#5b2ea6" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#5b2ea6" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="vignette" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#000000" stop-opacity="0.45"/>
      <stop offset="0.25" stop-color="#000000" stop-opacity="0"/>
      <stop offset="0.75" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.45"/>
    </linearGradient>
  </defs>
  <rect width="1920" height="720" fill="url(#bg)"/>
  ${stripes}
  <rect width="1920" height="720" fill="url(#glow)"/>
  <rect width="1920" height="720" fill="url(#vignette)"/>
</svg>`;
}

const glow = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs><radialGradient id="g" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#ffffff" stop-opacity="1"/>
    <stop offset="0.45" stop-color="#ffffff" stop-opacity="0.45"/>
    <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
  </radialGradient></defs>
  <rect width="256" height="256" fill="url(#g)"/>
</svg>`;

const white = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#ffffff"/></svg>`;

function rasterize(svg: string, outFile: string): void {
    const png = new Resvg(svg, {
        fitTo: { mode: 'original' },
        font: { loadSystemFonts: true, defaultFontFamily: 'Arial' },
    })
        .render()
        .asPng();
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, png);
    console.log(`  ${path.relative(ROOT, outFile)} (${(png.length / 1024).toFixed(1)} KB)`);
}

console.log('Generating textures:');
for (const [id, build] of Object.entries(SYMBOLS)) rasterize(build(), path.join(SYMBOL_DIR, `${id}.png`));
rasterize(background(), path.join(UI_DIR, 'background.png'));
rasterize(glow, path.join(UI_DIR, 'glow.png'));
rasterize(white, path.join(UI_DIR, 'white.png'));
