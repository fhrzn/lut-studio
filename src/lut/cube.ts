import type { Lut1D, Lut3D, Vec3 } from './types';

export const MIN_LUT_SIZE = 2;
export const MAX_LUT3D_SIZE = 65;
export const MAX_LUT1D_SIZE = 65536;

export interface CubeParseResult {
  lut3d?: Lut3D;
  lut1d?: Lut1D;
  title?: string;
}

export interface SerializeCubeOptions {
  title?: string;
  comments?: string[];
  /** Decimal places per value. Default 6. */
  precision?: number;
}

/** Thrown for malformed .cube input. `line` is 1-based. */
export class CubeParseError extends Error {
  readonly line: number;

  constructor(message: string, line: number) {
    super(`line ${line}: ${message}`);
    this.name = 'CubeParseError';
    this.line = line;
  }
}

const KEYWORDS = new Set([
  'TITLE',
  'LUT_1D_SIZE',
  'LUT_3D_SIZE',
  'DOMAIN_MIN',
  'DOMAIN_MAX',
  'LUT_1D_INPUT_RANGE',
  'LUT_3D_INPUT_RANGE',
  'LUT_IN_VIDEO_RANGE',
  'LUT_OUT_VIDEO_RANGE',
]);
const NUMBER_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const NON_FINITE_RE = /^[+-]?(?:nan|inf|infinity)$/i;
const INTEGER_RE = /^\d+$/;
const WHITESPACE_RE = /\s+/;

function parseNumber(token: string, line: number): number {
  if (!NUMBER_RE.test(token)) {
    throw new CubeParseError(
      NON_FINITE_RE.test(token)
        ? `non-finite value "${token}" is not allowed`
        : `invalid number "${token}"`,
      line,
    );
  }
  const value = Number(token);
  if (!Number.isFinite(value)) {
    throw new CubeParseError(`number "${token}" is out of range`, line);
  }
  return value;
}

function parseSize(keyword: string, args: string[], max: number, line: number): number {
  const [token] = args;
  if (args.length !== 1 || token === undefined || !INTEGER_RE.test(token)) {
    throw new CubeParseError(`${keyword} expects a single integer`, line);
  }
  const size = Number(token);
  if (size < MIN_LUT_SIZE || size > max) {
    throw new CubeParseError(
      `${keyword} must be between ${MIN_LUT_SIZE} and ${max}, got ${size}`,
      line,
    );
  }
  return size;
}

function parseNumbers(keyword: string, args: string[], count: number, line: number): number[] {
  if (args.length !== count) {
    throw new CubeParseError(`${keyword} expects ${count} values, got ${args.length}`, line);
  }
  return args.map((token) => parseNumber(token, line));
}

function isNumericStart(line: string): boolean {
  const c = line.charCodeAt(0);
  // digit, '+', '-', '.'
  return (c >= 48 && c <= 57) || c === 43 || c === 45 || c === 46;
}

/**
 * Parses an Adobe/IRIDAS `.cube` LUT (spec 1.0, plus the Resolve `LUT_*_INPUT_RANGE` keywords).
 * A file may hold a 1D LUT, a 3D LUT, or both (1D shaper rows first, then the 3D rows).
 */
export function parseCube(text: string): CubeParseResult {
  let title: string | undefined;
  let size1d = 0;
  let size3d = 0;
  let domainMin: Vec3 | undefined;
  let domainMax: Vec3 | undefined;
  let domainLine = 0;
  let range1d: [number, number] | undefined;
  let range3d: [number, number] | undefined;

  let data1d: Float32Array | undefined;
  let data3d: Float32Array | undefined;
  let total1d = 0;
  let total = 0;
  let count = 0;
  let writeAt = 0;

  let lineNo = 0;
  let lastContentLine = 1;
  const len = text.length;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  // Resolves header state into data buffers; runs once, at the first data row or at EOF.
  const startData = (line: number): void => {
    if (size1d === 0 && size3d === 0) {
      throw new CubeParseError('missing LUT_1D_SIZE or LUT_3D_SIZE', line);
    }
    if (domainMin && domainMax) {
      for (let c = 0; c < 3; c++) {
        if ((domainMin[c] as number) >= (domainMax[c] as number)) {
          throw new CubeParseError('DOMAIN_MIN must be less than DOMAIN_MAX', domainLine);
        }
      }
    }
    total1d = size1d;
    total = size1d + size3d * size3d * size3d;
    if (size1d > 0) data1d = new Float32Array(size1d * 3);
    if (size3d > 0) data3d = new Float32Array(size3d * size3d * size3d * 3);
  };

  while (pos <= len) {
    let end = text.indexOf('\n', pos);
    if (end === -1) end = len;
    lineNo++;
    let line = text.slice(pos, end).trim();
    pos = end + 1;

    if (line === '' || line.charCodeAt(0) === 35) continue;
    lastContentLine = lineNo;

    let keyword = '';
    if (!isNumericStart(line)) {
      const keywordEnd = line.search(/[\s#]/);
      keyword = (keywordEnd === -1 ? line : line.slice(0, keywordEnd)).toUpperCase();
    }

    // Once rows have started, anything that is not a known keyword is a (possibly bad) row.
    if (keyword === '' || NON_FINITE_RE.test(keyword) || (count > 0 && !KEYWORDS.has(keyword))) {
      if (count === 0) startData(lineNo);
      if (count >= total) {
        throw new CubeParseError(
          `unexpected data row ${count + 1}, expected ${total} rows`,
          lineNo,
        );
      }
      const hash = line.indexOf('#');
      if (hash !== -1) line = line.slice(0, hash).trimEnd();
      const tokens = line.split(WHITESPACE_RE);
      if (tokens.length !== 3) {
        throw new CubeParseError(`data row needs 3 values, got ${tokens.length}`, lineNo);
      }
      const target = (count < total1d ? data1d : data3d) as Float32Array;
      for (let c = 0; c < 3; c++) {
        target[writeAt + c] = parseNumber(tokens[c] as string, lineNo);
      }
      count++;
      writeAt += 3;
      if (count === total1d) writeAt = 0;
      continue;
    }

    if (count > 0) {
      throw new CubeParseError(`keyword ${keyword} after data rows began`, lineNo);
    }

    if (keyword === 'TITLE') {
      const rest = line.slice(keyword.length).trim();
      if (rest.startsWith('"')) {
        const close = rest.indexOf('"', 1);
        if (close === -1) throw new CubeParseError('unterminated TITLE string', lineNo);
        title = rest.slice(1, close);
      } else {
        title = rest;
      }
      continue;
    }

    const hash = line.indexOf('#');
    if (hash !== -1) line = line.slice(0, hash).trimEnd();
    const args = line.split(WHITESPACE_RE).slice(1);

    switch (keyword) {
      case 'LUT_3D_SIZE':
        if (size3d !== 0) throw new CubeParseError('duplicate LUT_3D_SIZE', lineNo);
        size3d = parseSize(keyword, args, MAX_LUT3D_SIZE, lineNo);
        break;
      case 'LUT_1D_SIZE':
        if (size1d !== 0) throw new CubeParseError('duplicate LUT_1D_SIZE', lineNo);
        size1d = parseSize(keyword, args, MAX_LUT1D_SIZE, lineNo);
        break;
      case 'DOMAIN_MIN':
        domainMin = parseNumbers(keyword, args, 3, lineNo) as Vec3;
        domainLine = lineNo;
        break;
      case 'DOMAIN_MAX':
        domainMax = parseNumbers(keyword, args, 3, lineNo) as Vec3;
        domainLine = lineNo;
        break;
      case 'LUT_1D_INPUT_RANGE':
      case 'LUT_3D_INPUT_RANGE': {
        const [lo, hi] = parseNumbers(keyword, args, 2, lineNo) as [number, number];
        if (lo >= hi) throw new CubeParseError(`${keyword} min must be less than max`, lineNo);
        if (keyword === 'LUT_1D_INPUT_RANGE') range1d = [lo, hi];
        else range3d = [lo, hi];
        break;
      }
      case 'LUT_IN_VIDEO_RANGE':
      case 'LUT_OUT_VIDEO_RANGE':
        break;
      default:
        throw new CubeParseError(`unknown keyword "${keyword}"`, lineNo);
    }
  }

  if (count === 0) startData(lastContentLine);
  if (count < total) {
    throw new CubeParseError(`expected ${total} data rows, found ${count}`, lastContentLine);
  }

  const domainFor = (range: [number, number] | undefined): [Vec3, Vec3] => {
    if (range)
      return [
        [range[0], range[0], range[0]],
        [range[1], range[1], range[1]],
      ];
    return [domainMin ?? [0, 0, 0], domainMax ?? [1, 1, 1]];
  };

  const result: CubeParseResult = {};
  if (title !== undefined) result.title = title;
  if (data1d) {
    const [min, max] = domainFor(range1d);
    result.lut1d = { size: size1d, domainMin: [...min], domainMax: [...max], data: data1d };
    if (title !== undefined) result.lut1d.title = title;
  }
  if (data3d) {
    const [min, max] = domainFor(range3d);
    result.lut3d = { size: size3d, domainMin: [...min], domainMax: [...max], data: data3d };
    if (title !== undefined) result.lut3d.title = title;
  }
  return result;
}

/** Writes a 3D LUT as `.cube` text (LF line endings, trailing newline). */
export function serializeCube(lut: Lut3D, opts: SerializeCubeOptions = {}): string {
  const { size, data } = lut;
  const precision = opts.precision ?? 6;
  if (!Number.isInteger(precision) || precision < 0 || precision > 10) {
    throw new RangeError(`precision must be an integer between 0 and 10, got ${precision}`);
  }
  if (!Number.isInteger(size) || size < MIN_LUT_SIZE || size > MAX_LUT3D_SIZE) {
    throw new RangeError(`size must be an integer between ${MIN_LUT_SIZE} and ${MAX_LUT3D_SIZE}`);
  }
  if (data.length !== size * size * size * 3) {
    throw new RangeError(`data length ${data.length} does not match size ${size}`);
  }

  const lines: string[] = [];
  const title = opts.title ?? lut.title;
  if (title !== undefined) lines.push(`TITLE "${title.replace(/["\r\n]/g, ' ')}"`);
  for (const comment of opts.comments ?? []) {
    for (const part of comment.split(/\r?\n/)) lines.push(`# ${part}`);
  }
  lines.push(`LUT_3D_SIZE ${size}`);
  const isDefaultDomain =
    lut.domainMin.every((v) => v === 0) && lut.domainMax.every((v) => v === 1);
  if (!isDefaultDomain) {
    lines.push(`DOMAIN_MIN ${lut.domainMin.map((v) => formatValue(v, precision)).join(' ')}`);
    lines.push(`DOMAIN_MAX ${lut.domainMax.map((v) => formatValue(v, precision)).join(' ')}`);
  }
  for (let i = 0; i < data.length; i += 3) {
    lines.push(
      `${formatValue(data[i] as number, precision)} ${formatValue(data[i + 1] as number, precision)} ${formatValue(data[i + 2] as number, precision)}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function formatValue(value: number, precision: number): string {
  if (!Number.isFinite(value)) {
    throw new RangeError(`cannot serialize non-finite value ${value}`);
  }
  const text = value.toFixed(precision);
  // Avoid "-0.000000" for tiny negatives.
  return /^-0(?:\.0*)?$/.test(text) ? text.slice(1) : text;
}
