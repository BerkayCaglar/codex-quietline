import { mkdir, writeFile } from 'node:fs/promises';
import stringWidth from 'string-width';
import { Resvg } from '@resvg/resvg-js';

// Render the shipped React components, not a separately maintained mockup.
process.env.FORCE_COLOR = '3';
const { render } = await import('ink-testing-library');
const { Screen } = await import('../src/ui/screen.js');
const { demoEngine } = await import('../src/demo.js');
const xml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function svg(frame: string, columns: number): string {
  const lines = frame.split('\n');
  const cell = 8.4,
    lineHeight = 20,
    padding = 24;
  const width = columns * cell + padding * 2;
  const height = lines.length * lineHeight + 68;
  let content = '';
  const palette: Record<number, string> = {
    30: '#11151c',
    31: '#eb8b91',
    32: '#69d3ac',
    33: '#eac477',
    34: '#7eb9ed',
    35: '#c4a7e7',
    36: '#7eb9ed',
    37: '#d8dee9',
    90: '#7d8597',
  };
  for (const [row, line] of lines.entries()) {
    let x = padding,
      color = '#d8dee9',
      bold = false;
    for (const part of line.split(/(\x1b\[[0-9;]*m)/)) {
      if (part.startsWith('\x1b[')) {
        const values = part.slice(2, -1).split(';').map(Number);
        for (let i = 0; i < values.length; i++) {
          const value = values[i];
          if (value === 0) {
            color = '#d8dee9';
            bold = false;
          } else if (value === 1) bold = true;
          else if (value === 22) bold = false;
          else if (value === 39) color = '#d8dee9';
          else if (value === 38 && values[i + 1] === 2) {
            color = `rgb(${values.slice(i + 2, i + 5).join(',')})`;
            i += 4;
          } else if (value !== undefined && palette[value]) color = palette[value];
        }
      } else if (part) {
        const length = stringWidth(part) * cell;
        content += `<text x="${x}" y="${64 + row * lineHeight}" fill="${color}"${bold ? ' font-weight="600"' : ''} textLength="${length}" lengthAdjust="spacingAndGlyphs">${xml(part)}</text>`;
        x += length;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Codex Quietline terminal preview"><rect width="${width}" height="${height}" rx="14" fill="#11151c"/><rect x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="14" fill="none" stroke="#2c3442"/><circle cx="24" cy="23" r="5" fill="#eb8b91"/><circle cx="42" cy="23" r="5" fill="#eac477"/><circle cx="60" cy="23" r="5" fill="#69d3ac"/><text x="${width / 2}" y="28" text-anchor="middle" fill="#7d8597" font-family="monospace" font-size="12">codex-quietline</text><g font-family="Cascadia Code, SFMono-Regular, Consolas, monospace" font-size="14" xml:space="preserve">${content}</g></svg>\n`;
}

await mkdir('docs/media', { recursive: true });
for (const [name, width, height, selected] of [
  ['overview', 116, 29, 'demo-main'],
  ['agent', 116, 27, 'demo-survey'],
  ['compact', 60, 24, 'demo-main'],
] as const) {
  const engine = demoEngine();
  engine.store.select(selected);
  const view = render(
    <Screen
      store={engine.store}
      width={width}
      height={height}
      focus={selected === 'demo-main' ? 'composer' : 'agents'}
      cwd="codex-quietline"
    />,
  );
  await new Promise((resolve) => setTimeout(resolve, 80));
  const frame = view.lastFrame();
  if (!frame) throw new Error('The UI produced no frame.');
  const rendered = svg(frame, width);
  await writeFile(`docs/media/${name}.svg`, rendered);
  await writeFile(`docs/media/${name}.png`, new Resvg(rendered).render().asPng());
  view.cleanup();
}
console.log('Rendered overview, agent and compact terminal previews.');
