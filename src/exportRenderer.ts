import {
  createExportFileName,
  exportMimeType,
  normalizeExportSettings,
  type ExportFormat,
  type ExportSettings,
  type ExportSourceMetadata,
} from './exportSettings';
import { offlineFontFaceCss, OFFLINE_FONT_STACK } from './offlineFont';
import {
  replaceSvgAttributeIdReferences,
  replaceSvgStyleIdReferences,
} from './svgIdReferences';

export interface ExportArtifact {
  bytes: Uint8Array;
  fileName: string;
  format: ExportFormat;
  height: number;
  mimeType: string;
  width: number;
}

export interface ExportRenderInput {
  fileName: string;
  metadata: ExportSourceMetadata;
  settings: ExportSettings;
  svg: string;
}

interface PreparedSvg {
  height: number;
  source: string;
  width: number;
}

interface RasterizedSvg {
  canvas: HTMLCanvasElement;
  height: number;
  width: number;
}

const textEncoder = new TextEncoder();
const MAX_RASTER_DIMENSION = 16_384;
export const MAX_RASTER_PIXELS = 32_000_000;

export async function renderExportArtifact(input: ExportRenderInput): Promise<ExportArtifact> {
  const settings = normalizeExportSettings(input.settings);
  const fileName = createExportFileName({ fileName: input.fileName, settings });
  if (settings.format === 'svg') {
    const prepared = prepareSvg(input.svg, settings, input.metadata);
    return {
      bytes: textEncoder.encode(prepared.source),
      fileName,
      format: 'svg',
      height: prepared.height,
      mimeType: exportMimeType('svg'),
      width: prepared.width,
    };
  }

  const prepared = prepareSvg(input.svg, settings, input.metadata);
  const raster = await rasterizeSvg(prepared, settings);
  if (settings.format === 'pdf') {
    const bytes = await canvasToPdf(
      raster.canvas,
      settings.dpi,
      settings.includeMetadata ? input.metadata : undefined,
    );
    return {
      bytes,
      fileName,
      format: 'pdf',
      height: raster.height,
      mimeType: exportMimeType('pdf'),
      width: raster.width,
    };
  }

  const mimeType = exportMimeType(settings.format);
  const blob = await canvasToBlob(raster.canvas, mimeType, 0.94);
  let bytes: Uint8Array<ArrayBufferLike> = new Uint8Array(await blob.arrayBuffer());
  if (settings.includeMetadata) {
    const metadataJson = JSON.stringify(input.metadata);
    bytes = settings.format === 'png'
      ? addPngMetadata(bytes, metadataJson)
      : addWebpMetadata(bytes, metadataJson);
  }
  return {
    bytes,
    fileName,
    format: settings.format,
    height: raster.height,
    mimeType,
    width: raster.width,
  };
}

export async function renderExportPreview(
  input: ExportRenderInput,
  maximumDimension = 1200,
): Promise<{ dataUrl: string; height: number; width: number }> {
  const settings = normalizeExportSettings({
    ...input.settings,
    dpi: 96,
    scale: Math.min(input.settings.scale, 2),
  });
  const prepared = prepareSvg(input.svg, settings, input.metadata);
  const previewScale = Math.min(1, maximumDimension / Math.max(prepared.width, prepared.height));
  const raster = await rasterizeSvg(prepared, { ...settings, scale: previewScale });
  const outputScale = input.settings.scale * (input.settings.dpi / 96);
  return {
    dataUrl: raster.canvas.toDataURL('image/png'),
    height: Math.max(1, Math.round(prepared.height * outputScale)),
    width: Math.max(1, Math.round(prepared.width * outputScale)),
  };
}

export function prepareSvg(
  originalSvg: string,
  rawSettings: ExportSettings,
  metadata: ExportSourceMetadata,
): PreparedSvg {
  const settings = normalizeExportSettings(rawSettings);
  if (settings.format === 'svg' && settings.svgVariant === 'original') {
    const size = readSvgSize(originalSvg);
    return { height: size.height, source: originalSvg, width: size.width };
  }

  const { documentNode, root } = parseSvg(originalSvg);
  normalizeSvgIds(root);

  const size = svgElementSize(root);
  const margin = settings.margin;
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  root.setAttribute(
    'viewBox',
    `${formatNumber(size.x - margin)} ${formatNumber(size.y - margin)} ` +
      `${formatNumber(size.width + margin * 2)} ${formatNumber(size.height + margin * 2)}`,
  );
  root.setAttribute('width', formatNumber(size.width + margin * 2));
  root.setAttribute('height', formatNumber(size.height + margin * 2));

  const fontStyle = documentNode.createElementNS('http://www.w3.org/2000/svg', 'style');
  fontStyle.setAttribute('data-mermaid-offline-font', 'true');
  fontStyle.textContent = `${offlineFontFaceCss()}` +
    `text,tspan,foreignObject,foreignObject *{font-family:${OFFLINE_FONT_STACK}!important;}`;
  root.insertBefore(fontStyle, root.firstChild);

  if (settings.background === 'color') {
    const background = documentNode.createElementNS('http://www.w3.org/2000/svg', 'rect');
    background.setAttribute('x', formatNumber(size.x - margin));
    background.setAttribute('y', formatNumber(size.y - margin));
    background.setAttribute('width', formatNumber(size.width + margin * 2));
    background.setAttribute('height', formatNumber(size.height + margin * 2));
    background.setAttribute('fill', settings.backgroundColor);
    background.setAttribute('data-mermaid-export-background', 'true');
    root.insertBefore(background, root.firstChild);
  }

  if (settings.includeMetadata) {
    const metadataNode = documentNode.createElementNS('http://www.w3.org/2000/svg', 'metadata');
    metadataNode.setAttribute('id', 'mermaid-preview-offline-metadata');
    metadataNode.textContent = JSON.stringify(metadata);
    root.insertBefore(metadataNode, root.firstChild);
  }

  const serialized = new XMLSerializer().serializeToString(root);
  return {
    height: size.height + margin * 2,
    source: settings.optimizeSvg ? optimizeSvg(serialized) : serialized,
    width: size.width + margin * 2,
  };
}

export function optimizeSvg(svg: string): string {
  return svg
    .replace(/<!--(?:.|\s)*?-->/gu, '')
    .replace(/>\s+</gu, '><')
    .replace(/\s+\/?>/gu, (match) => match.replace(/^\s+/u, ''))
    .trim();
}

function normalizeSvgIds(root: SVGSVGElement): void {
  const idMap = new Map<string, string>();
  const identified = [root, ...Array.from(root.querySelectorAll<SVGElement>('[id]'))]
    .filter((element) => element.id.length > 0);
  identified.forEach((element, index) => {
    const previous = element.id;
    const stable = `mermaid-offline-${index + 1}`;
    if (!idMap.has(previous)) idMap.set(previous, stable);
    element.id = stable;
  });

  for (const element of [root, ...Array.from(root.querySelectorAll<SVGElement>('*'))]) {
    for (const attribute of Array.from(element.attributes)) {
      const value = replaceSvgAttributeIdReferences(attribute.name, attribute.value, idMap);
      if (value !== attribute.value) element.setAttribute(attribute.name, value);
    }
  }
  root.querySelectorAll('style').forEach((style) => {
    if (style.textContent) {
      style.textContent = replaceSvgStyleIdReferences(style.textContent, idMap);
    }
  });
}

export function artifactDataBase64(artifact: ExportArtifact): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < artifact.bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...artifact.bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function rasterizeSvg(
  prepared: PreparedSvg,
  settings: ExportSettings,
): Promise<RasterizedSvg> {
  const pixelScale = settings.scale * (settings.dpi / 96);
  const width = Math.max(1, Math.round(prepared.width * pixelScale));
  const height = Math.max(1, Math.round(prepared.height * pixelScale));
  if (
    width > MAX_RASTER_DIMENSION ||
    height > MAX_RASTER_DIMENSION ||
    width * height > MAX_RASTER_PIXELS
  ) {
    throw new Error(
      `The requested ${width.toLocaleString()} × ${height.toLocaleString()} export exceeds the ` +
      `${MAX_RASTER_PIXELS.toLocaleString()}-pixel memory budget. Reduce scale or DPI.`,
    );
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas rendering is unavailable in this VS Code webview.');
  }
  if (settings.background === 'color' || settings.format === 'pdf') {
    context.fillStyle = settings.background === 'color' ? settings.backgroundColor : '#ffffff';
    context.fillRect(0, 0, width, height);
  }

  const canvasSafeSvg = replaceForeignObjectsForCanvas(prepared.source);
  const blob = new Blob([canvasSafeSvg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    context.drawImage(image, 0, 0, width, height);
  } finally {
    URL.revokeObjectURL(url);
  }
  return { canvas, height, width };
}

function replaceForeignObjectsForCanvas(svg: string): string {
  const documentNode = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (documentNode.querySelector('parsererror')) {
    return svg;
  }
  for (const foreignObject of Array.from(documentNode.querySelectorAll('foreignObject'))) {
    const width = positiveDimension(foreignObject.getAttribute('width'));
    const height = positiveDimension(foreignObject.getAttribute('height'));
    const x = Number.parseFloat(foreignObject.getAttribute('x') ?? '0') || 0;
    const y = Number.parseFloat(foreignObject.getAttribute('y') ?? '0') || 0;
    const text = documentNode.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', formatNumber(x + width / 2));
    text.setAttribute('y', formatNumber(y + height / 2));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    const styledNode = foreignObject.querySelector('[style*="color"]');
    const color = /(?:^|;)\s*color\s*:\s*([^;!]+)/iu.exec(
      styledNode?.getAttribute('style') ?? '',
    )?.[1]?.trim();
    if (color) {
      text.setAttribute('fill', color);
    }
    text.textContent = foreignObject.textContent?.replace(/\s+/gu, ' ').trim() ?? '';
    foreignObject.replaceWith(text);
  }
  return new XMLSerializer().serializeToString(documentNode.documentElement);
}

function readSvgSize(svg: string): { height: number; width: number } {
  const size = svgElementSize(parseSvg(svg).root);
  return { height: size.height, width: size.width };
}

function parseSvg(svg: string): { documentNode: Document; root: SVGSVGElement } {
  const parser = new DOMParser();
  const xmlDocument = parser.parseFromString(svg, 'image/svg+xml');
  if (!xmlDocument.querySelector('parsererror') && xmlDocument.documentElement.localName === 'svg') {
    return {
      documentNode: xmlDocument,
      root: xmlDocument.documentElement as unknown as SVGSVGElement,
    };
  }
  const htmlDocument = parser.parseFromString(svg, 'text/html');
  const recoveredRoot = htmlDocument.querySelector('svg');
  if (!recoveredRoot) {
    throw new Error('The rendered Mermaid SVG could not be parsed for export.');
  }
  return { documentNode: htmlDocument, root: recoveredRoot };
}

function svgElementSize(root: Element): { height: number; width: number; x: number; y: number } {
  const viewBox = root.getAttribute('viewBox')?.trim().split(/[\s,]+/u).map(Number);
  if (
    viewBox?.length === 4 &&
    viewBox.every(Number.isFinite) &&
    (viewBox[2] ?? 0) > 0 &&
    (viewBox[3] ?? 0) > 0
  ) {
    return {
      height: viewBox[3] ?? 1,
      width: viewBox[2] ?? 1,
      x: viewBox[0] ?? 0,
      y: viewBox[1] ?? 0,
    };
  }
  const width = positiveDimension(root.getAttribute('width'));
  const height = positiveDimension(root.getAttribute('height'));
  return { height, width, x: 0, y: 0 };
}

function positiveDimension(value: string | null): number {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The exported SVG could not be rasterized.'));
    image.src = source;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob || (mimeType === 'image/webp' && blob.type !== mimeType)) {
          reject(new Error(`${mimeType} export is unavailable in this VS Code webview.`));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}

async function canvasToPdf(
  canvas: HTMLCanvasElement,
  dpi: number,
  metadata: ExportSourceMetadata | undefined,
): Promise<Uint8Array> {
  const jpeg = await canvasToBlob(canvas, 'image/jpeg', 0.96);
  const jpegBytes = new Uint8Array(await jpeg.arrayBuffer());
  const widthPoints = (canvas.width / dpi) * 72;
  const heightPoints = (canvas.height / dpi) * 72;
  const content = `q ${formatNumber(widthPoints)} 0 0 ${formatNumber(heightPoints)} 0 0 cm /Im0 Do Q`;
  const info = [
    '/Creator (Mermaid Preview Offline)',
    ...(metadata ? [
      `/Title (${escapePdfString(metadata.fileName)})`,
      `/Subject (${escapePdfString(metadata.sourceUri ?? metadata.fileName)})`,
      `/CreationDate (D:${pdfDate(metadata.exportedAt)})`,
    ] : []),
  ].join(' ');
  const objects: Uint8Array[] = [
    textEncoder.encode('<< /Type /Catalog /Pages 2 0 R >>'),
    textEncoder.encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    textEncoder.encode(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${formatNumber(widthPoints)} ${formatNumber(heightPoints)}] ` +
        '/Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>',
    ),
    pdfStream(textEncoder.encode(content), ''),
    pdfStream(
      jpegBytes,
      `/Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} ` +
        '/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ',
    ),
    textEncoder.encode(`<< ${info} >>`),
  ];
  return assemblePdf(objects, 6);
}

function pdfStream(bytes: Uint8Array, prefix: string): Uint8Array {
  return concatBytes([
    textEncoder.encode(`<< ${prefix}/Length ${bytes.length} >>\nstream\n`),
    bytes,
    textEncoder.encode('\nendstream'),
  ]);
}

function assemblePdf(objects: Uint8Array[], infoObject: number): Uint8Array {
  const chunks: Uint8Array[] = [textEncoder.encode('%PDF-1.7\n%\u00e2\u00e3\u00cf\u00d3\n')];
  const offsets = [0];
  let length = chunks[0]?.length ?? 0;
  objects.forEach((object, index) => {
    offsets.push(length);
    const wrapped = concatBytes([
      textEncoder.encode(`${index + 1} 0 obj\n`),
      object,
      textEncoder.encode('\nendobj\n'),
    ]);
    chunks.push(wrapped);
    length += wrapped.length;
  });
  const xrefOffset = length;
  const xref = [
    `xref\n0 ${objects.length + 1}\n`,
    '0000000000 65535 f \n',
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoObject} 0 R >>\n`,
    `startxref\n${xrefOffset}\n%%EOF\n`,
  ].join('');
  chunks.push(textEncoder.encode(xref));
  return concatBytes(chunks);
}

function addPngMetadata(bytes: Uint8Array, metadata: string): Uint8Array {
  if (bytes.length < 12 || String.fromCharCode(...bytes.subarray(1, 4)) !== 'PNG') {
    return bytes;
  }
  const keyword = textEncoder.encode('Mermaid Source');
  const text = textEncoder.encode(metadata);
  const payload = concatBytes([
    keyword,
    new Uint8Array([0, 0, 0, 0, 0]),
    text,
  ]);
  const type = textEncoder.encode('iTXt');
  const chunkData = concatBytes([type, payload]);
  const chunk = concatBytes([
    uint32(payload.length),
    chunkData,
    uint32(crc32(chunkData)),
  ]);
  return concatBytes([bytes.subarray(0, bytes.length - 12), chunk, bytes.subarray(bytes.length - 12)]);
}

function addWebpMetadata(bytes: Uint8Array, metadata: string): Uint8Array {
  if (bytes.length < 12 || ascii(bytes.subarray(0, 4)) !== 'RIFF' || ascii(bytes.subarray(8, 12)) !== 'WEBP') {
    return bytes;
  }
  const payload = textEncoder.encode(metadata);
  const padded = payload.length % 2 === 0 ? payload : concatBytes([payload, new Uint8Array(1)]);
  const chunk = concatBytes([textEncoder.encode('XMP '), uint32LittleEndian(payload.length), padded]);
  const result = concatBytes([bytes, chunk]);
  result.set(uint32LittleEndian(result.length - 8), 4);
  return result;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint32(value: number): Uint8Array {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function uint32LittleEndian(value: number): Uint8Array {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function ascii(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function formatNumber(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function escapePdfString(value: string): string {
  return value.replace(/[^\x20-\x7e]/gu, '?').replace(/([()\\])/gu, '\\$1');
}

function pdfDate(isoDate: string): string {
  const value = new Date(isoDate);
  if (!Number.isFinite(value.getTime())) {
    return '19700101000000Z';
  }
  return [
    value.getUTCFullYear(),
    value.getUTCMonth() + 1,
    value.getUTCDate(),
    value.getUTCHours(),
    value.getUTCMinutes(),
    value.getUTCSeconds(),
  ]
    .map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, '0')))
    .join('') + 'Z';
}
