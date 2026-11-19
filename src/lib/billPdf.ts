/**
 * The bill as a PDF. jsPDF's built-in fonts have no ₹ and no Tamil, so the
 * bill is drawn on a canvas with the app's own fonts (Anek Tamil, Hind
 * Madurai) and placed on a single PDF page, A5 wide and as tall as the bill.
 *
 * Layout only: every figure arrives as text in the BillModel, so nothing here
 * adds anything up. Loaded lazily (jsPDF is large).
 */
import { colors } from '@/theme/colors';
import type { BillModel, StampTone } from './bill';

/** Pixels per millimetre (about 200 dpi). */
const PX_PER_MM = 8;
const PAGE_W_MM = 148; // A5 width
const MIN_H_MM = 210; // A5 height
const W = PAGE_W_MM * PX_PER_MM;
const M = 76; // side margin
const HEAD = '"Anek Tamil", "Noto Sans Tamil", system-ui, sans-serif';
const BODY = '"Hind Madurai", "Noto Sans Tamil", system-ui, sans-serif';

const STAMP_COLOR: Record<StampTone, string> = {
  paid: colors.peacock.DEFAULT,
  due: colors.terracotta.DEFAULT,
  cancelled: colors.muted,
};

type Ctx = CanvasRenderingContext2D;

function font(ctx: Ctx, weight: number, size: number, family: string, spacing = 0) {
  ctx.font = `${weight} ${size}px ${family}`;
  // letterSpacing is newer than the rest of the canvas API; skip where missing.
  if ('letterSpacing' in ctx) (ctx as Ctx & { letterSpacing: string }).letterSpacing = `${spacing}px`;
}

/** Break text into lines no wider than maxW; very long words are split. */
function wrap(ctx: Ctx, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxW) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    while (ctx.measureText(line).width > maxW && line.length > 1) {
      let cut = line.length - 1;
      while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxW) cut--;
      lines.push(line.slice(0, cut));
      line = line.slice(cut);
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function rule(ctx: Ctx, y: number, color: string = colors.line.strong, width = 2) {
  ctx.fillStyle = color;
  ctx.fillRect(M, y, W - 2 * M, width);
}

/** A label on the left (wrapping) and an amount on the right. Returns the new y. */
function row(ctx: Ctx, y: number, label: string, amount: string, o: { size: number; weight: number; color: string; amountSize?: number; amountWeight?: number }) {
  const amountSize = o.amountSize ?? o.size;
  font(ctx, o.amountWeight ?? 600, amountSize, HEAD);
  const amountW = ctx.measureText(amount).width;
  font(ctx, o.weight, o.size, BODY);
  const lines = wrap(ctx, label, W - 2 * M - amountW - 32);
  const lh = Math.round(o.size * 1.45);
  ctx.fillStyle = o.color;
  ctx.textAlign = 'left';
  lines.forEach((l, i) => ctx.fillText(l, M, y + i * lh));
  font(ctx, o.amountWeight ?? 600, amountSize, HEAD);
  ctx.fillStyle = colors.teak;
  ctx.textAlign = 'right';
  ctx.fillText(amount, W - M, y);
  ctx.textAlign = 'left';
  return y + lines.length * lh;
}

/** Draws the whole bill and returns the height it used. */
function paint(ctx: Ctx, m: BillModel, height: number): number {
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = colors.jasmine;
  ctx.fillRect(0, 0, W, height);

  // Header band: property name and contact.
  font(ctx, 700, 30, BODY);
  const contact = m.contact ? wrap(ctx, m.contact, W - 2 * M) : [];
  const bandH = 168 + contact.length * 42;
  ctx.fillStyle = colors.peacock.DEFAULT;
  ctx.fillRect(0, 0, W, bandH);
  ctx.fillStyle = colors.marigold.DEFAULT;
  ctx.fillRect(0, bandH, W, 10);

  font(ctx, 700, 64, HEAD);
  ctx.fillStyle = colors.jasmine;
  ctx.fillText(m.propertyName, M, 112);
  font(ctx, 400, 30, BODY);
  ctx.fillStyle = colors.peacock.mist;
  contact.forEach((l, i) => ctx.fillText(l, M, 166 + i * 42));

  // Title, bill number and date.
  let y = bandH + 110;
  font(ctx, 700, 60, HEAD);
  ctx.fillStyle = colors.teak;
  ctx.fillText('Bill', M, y);
  font(ctx, 600, 34, HEAD, 1);
  ctx.textAlign = 'right';
  ctx.fillText(m.billNo, W - M, y - 30);
  font(ctx, 400, 28, BODY);
  ctx.fillStyle = colors.muted;
  ctx.fillText(`Date ${m.billDate}`, W - M, y + 8);
  ctx.textAlign = 'left';

  y += 46;
  rule(ctx, y);

  // Guest and stay.
  const label = (text: string, at: number) => {
    font(ctx, 600, 24, BODY, 2);
    ctx.fillStyle = colors.muted;
    ctx.fillText(text.toUpperCase(), M, at);
  };
  y += 62;
  label('Guest', y);
  y += 50;
  font(ctx, 600, 36, BODY);
  ctx.fillStyle = colors.teak;
  for (const l of wrap(ctx, m.guestName, W - 2 * M)) {
    ctx.fillText(l, M, y);
    y += 48;
  }
  font(ctx, 400, 30, BODY);
  ctx.fillStyle = colors.muted;
  ctx.fillText(m.guestPhone, M, y);
  y += 72;
  label('Stay', y);
  y += 48;
  font(ctx, 400, 30, BODY);
  ctx.fillStyle = colors.teak;
  for (const l of wrap(ctx, m.stayLine, W - 2 * M)) {
    ctx.fillText(l, M, y);
    y += 44;
  }

  y += 12;
  rule(ctx, y);
  y += 64;

  // Accommodation, charges and discounts, then the total.
  for (const l of m.lines) {
    y = row(ctx, y, l.label, l.amount, { size: 30, weight: 400, color: colors.teak }) + 18;
  }
  y += 4;
  rule(ctx, y, colors.teak, 3);
  y += 66;
  font(ctx, 700, 38, HEAD);
  ctx.fillStyle = colors.teak;
  ctx.fillText('Total', M, y);
  ctx.textAlign = 'right';
  font(ctx, 700, 44, HEAD);
  ctx.fillText(m.total, W - M, y);
  ctx.textAlign = 'left';
  y += 40;

  // Payments received.
  if (m.payments.length > 0) {
    y += 52;
    label('Payments', y);
    y += 52;
    for (const p of m.payments) {
      y = row(ctx, y, p.label, p.amount, { size: 28, weight: 400, color: colors.muted, amountWeight: 500 }) + 14;
    }
  }

  // The stamp: a bordered, slightly tilted label (text, never colour alone).
  y += 70;
  font(ctx, 700, 42, HEAD, 3);
  const stampW = Math.min(W - 2 * M, ctx.measureText(m.stamp).width + 88);
  const stampH = 96;
  const tone = STAMP_COLOR[m.stampTone];
  ctx.save();
  ctx.translate(W / 2, y + stampH / 2);
  ctx.rotate((-3 * Math.PI) / 180);
  ctx.strokeStyle = tone;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(-stampW / 2, -stampH / 2, stampW, stampH, 18);
  ctx.stroke();
  ctx.fillStyle = tone;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(m.stamp, 0, 3);
  ctx.restore();
  y += stampH + 96;

  // Thanks.
  font(ctx, 400, 28, BODY);
  ctx.fillStyle = colors.muted;
  ctx.textAlign = 'center';
  for (const l of wrap(ctx, m.thanks, W - 2 * M)) {
    ctx.fillText(l, W / 2, y);
    y += 40;
  }
  ctx.textAlign = 'left';
  return y + 60;
}

/** Waits (briefly) for the web fonts the bill uses, including any Tamil glyphs. */
async function fontsReady(m: BillModel) {
  if (!('fonts' in document)) return;
  const sample = Object.values(m).flat().map((v) => (typeof v === 'string' ? v : `${v.label} ${v.amount}`)).join(' ');
  const specs = [`700 64px ${HEAD}`, `600 34px ${HEAD}`, `400 30px ${BODY}`, `600 36px ${BODY}`];
  const load = Promise.all(specs.map((s) => document.fonts.load(s, `${sample} ₹0123456789`)));
  // Offline with nothing cached: fall back to the system font rather than wait.
  await Promise.race([load, new Promise((r) => setTimeout(r, 2500))]);
}

/** The bill drawn at full size (also handy for an on-screen preview). */
export async function billCanvas(m: BillModel): Promise<HTMLCanvasElement> {
  await fontsReady(m);
  // Pass 1 measures; pass 2 draws on a canvas exactly that tall.
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) throw new Error('Canvas is not available');
  const used = paint(probe, m, 0);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = Math.max(MIN_H_MM * PX_PER_MM, Math.ceil(used));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  paint(ctx, m, canvas.height);
  return canvas;
}

export async function billPdf(m: BillModel): Promise<Blob> {
  const [{ jsPDF }, canvas] = await Promise.all([import('jspdf'), billCanvas(m)]);
  const hMm = canvas.height / PX_PER_MM;
  const doc = new jsPDF({ unit: 'mm', format: [PAGE_W_MM, hMm], orientation: 'portrait', compress: true });
  doc.setProperties({ title: `Bill ${m.billNo}`, subject: `${m.propertyName} bill for ${m.guestName}`, creator: m.propertyName });
  doc.addImage(canvas, 'PNG', 0, 0, PAGE_W_MM, hMm, undefined, 'FAST');
  return doc.output('blob');
}
