import { describe, expect, it } from 'vitest';
import { CubeParseError, identityLut3D, parseCube, serializeCube } from '@/lut';
import type { Lut3D } from '@/lut';
import { fixture } from './fixtures';

function parseError(text: string): CubeParseError {
  try {
    parseCube(text);
  } catch (e) {
    expect(e).toBeInstanceOf(CubeParseError);
    return e as CubeParseError;
  }
  throw new Error('expected parseCube to throw');
}

function expectError(text: string, line: number, message: RegExp): void {
  const e = parseError(text);
  expect(e.line).toBe(line);
  expect(e.message).toMatch(message);
  expect(e.message).toContain(`line ${line}:`);
}

const IDENTITY_2 = 'LUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n';

describe('parseCube: fixtures', () => {
  it.each([2, 17, 33])('parses identity %i^3', (n) => {
    const { lut3d, lut1d, title } = parseCube(fixture(`identity-${n}.cube`));
    expect(lut1d).toBeUndefined();
    expect(title).toBe(`identity ${n}`);
    expect(lut3d?.size).toBe(n);
    expect(lut3d?.domainMin).toEqual([0, 0, 0]);
    expect(lut3d?.domainMax).toEqual([1, 1, 1]);
    const expected = identityLut3D(n).data;
    expect(lut3d?.data.length).toBe(expected.length);
    for (let i = 0; i < expected.length; i++) {
      expect(Math.abs((lut3d?.data[i] as number) - (expected[i] as number))).toBeLessThan(1e-6);
    }
  });

  it('parses a 1D-only file', () => {
    const { lut1d, lut3d, title } = parseCube(fixture('gamma-1d.cube'));
    expect(lut3d).toBeUndefined();
    expect(title).toBe('gamma 1D');
    expect(lut1d?.size).toBe(5);
    expect(lut1d?.title).toBe('gamma 1D');
    expect(lut1d?.domainMin).toEqual([0, 0, 0]);
    expect(Array.from(lut1d?.data.slice(6, 9) ?? [])).toEqual(
      [0.25, 0.5, 0.707107].map(Math.fround),
    );
  });

  it('parses a 1D shaper + 3D file with Resolve input-range keywords', () => {
    const { lut1d, lut3d } = parseCube(fixture('shaper-1d-3d.cube'));
    expect(lut1d?.size).toBe(4);
    expect(lut1d?.domainMin).toEqual([-0.5, -0.5, -0.5]);
    expect(lut1d?.domainMax).toEqual([1.5, 1.5, 1.5]);
    expect(lut1d?.data.length).toBe(12);
    expect(lut1d?.data[9]).toBe(1);
    expect(lut3d?.size).toBe(2);
    expect(lut3d?.domainMin).toEqual([0, 0, 0]);
    expect(lut3d?.domainMax).toEqual([1, 1, 1]);
    expect(lut3d?.data.length).toBe(24);
    expect(Array.from(lut3d?.data.slice(0, 3) ?? [])).toEqual([0.05, 0.1, 0.15].map(Math.fround));
    expect(Array.from(lut3d?.data.slice(21, 24) ?? [])).toEqual([0.95, 0.9, 0.85].map(Math.fround));
  });

  it('parses a custom domain', () => {
    const { lut3d } = parseCube(fixture('custom-domain.cube'));
    expect(lut3d?.domainMin).toEqual([-0.25, -0.5, 0]);
    expect(lut3d?.domainMax).toEqual([1.5, 2, 4]);
  });

  it('parses CRLF, blank lines, trailing whitespace and out-of-order keywords', () => {
    const text = fixture('crlf.cube');
    expect(text).toContain('\r\n');
    const { lut3d, title } = parseCube(text);
    expect(title).toBe('crlf');
    expect(lut3d?.size).toBe(2);
    expect(Array.from(lut3d?.data ?? [])).toEqual(Array.from(identityLut3D(2).data));
  });
});

describe('parseCube: malformed fixtures', () => {
  it.each([
    ['bad-too-few-rows.cube', 4, /expected 8 data rows, found 3/],
    ['bad-non-numeric.cube', 4, /invalid number "abc"/],
    ['bad-size.cube', 3, /LUT_3D_SIZE must be between 2 and 65, got 66/],
    ['bad-nan.cube', 7, /non-finite value "nan"/],
  ])('%s throws CubeParseError with a line number', (name, line, message) => {
    expectError(fixture(name), line, message);
  });
});

describe('parseCube: syntax tolerance', () => {
  it('accepts a BOM, lowercase keywords, inline comments and no trailing newline', () => {
    const text = `\uFEFFlut_3D_size 2 # size\n${IDENTITY_2.split('\n').slice(1).join('\n').trimEnd()}`;
    const { lut3d } = parseCube(text.replace('1 1 1', '1 1 1 # last'));
    expect(lut3d?.size).toBe(2);
    expect(lut3d?.data[23]).toBe(1);
  });

  it('accepts exponent, signed and leading-dot numbers', () => {
    const text = 'LUT_1D_SIZE 2\n+.5 1e-1 -0.5E+1\n1. 0 0\n';
    const { lut1d } = parseCube(text);
    expect(Array.from(lut1d?.data ?? [])).toEqual([0.5, 0.1, -5, 1, 0, 0].map(Math.fround));
  });

  it('accepts quoted, unquoted and empty TITLE', () => {
    expect(parseCube(`TITLE "a # b"\n${IDENTITY_2}`).title).toBe('a # b');
    expect(parseCube(`TITLE Plain title\n${IDENTITY_2}`).title).toBe('Plain title');
    expect(parseCube(`TITLE ""\n${IDENTITY_2}`).title).toBe('');
  });

  it('omits title when absent', () => {
    const result = parseCube(IDENTITY_2);
    expect(result.title).toBeUndefined();
    expect(result.lut3d?.title).toBeUndefined();
  });

  it('uses DOMAIN_MIN/MAX for 1D and 3D when no input range is given', () => {
    const text = `DOMAIN_MIN -1 -1 -1\nDOMAIN_MAX 2 2 2\nLUT_1D_SIZE 2\nLUT_3D_SIZE 2\n0 0 0\n1 1 1\n${IDENTITY_2.split('\n').slice(1).join('\n')}`;
    const { lut1d, lut3d } = parseCube(text);
    expect(lut1d?.domainMax).toEqual([2, 2, 2]);
    expect(lut3d?.domainMin).toEqual([-1, -1, -1]);
  });

  it('accepts a LUT_3D_INPUT_RANGE-only file and ignores video-range keywords', () => {
    const text = `LUT_IN_VIDEO_RANGE 0 1\nLUT_OUT_VIDEO_RANGE 0 1\nLUT_3D_INPUT_RANGE 0 255\n${IDENTITY_2}`;
    expect(parseCube(text).lut3d?.domainMax).toEqual([255, 255, 255]);
  });

  it('does not share domain arrays between the 1D and 3D results', () => {
    const text = `LUT_1D_SIZE 2\n${IDENTITY_2.replace('LUT_3D_SIZE 2\n', 'LUT_3D_SIZE 2\n0 0 0\n1 1 1\n')}`;
    const { lut1d, lut3d } = parseCube(text);
    expect(lut1d?.domainMin).not.toBe(lut3d?.domainMin);
  });
});

describe('parseCube: error paths', () => {
  it('rejects missing size (at the first data row)', () => {
    expectError('# c\n0 0 0\n', 2, /missing LUT_1D_SIZE or LUT_3D_SIZE/);
  });

  it('rejects missing size (no data at all)', () => {
    expectError('TITLE "x"\n\n', 1, /missing LUT_1D_SIZE or LUT_3D_SIZE/);
    expectError('', 1, /missing LUT_1D_SIZE or LUT_3D_SIZE/);
  });

  it('rejects a header with no data rows', () => {
    expectError('LUT_3D_SIZE 2\n\n', 1, /expected 8 data rows, found 0/);
  });

  it('rejects bad sizes', () => {
    expectError('LUT_3D_SIZE\n', 1, /expects a single integer/);
    expectError('LUT_3D_SIZE 2 3\n', 1, /expects a single integer/);
    expectError('LUT_3D_SIZE 2.5\n', 1, /expects a single integer/);
    expectError('LUT_3D_SIZE -2\n', 1, /expects a single integer/);
    expectError('LUT_3D_SIZE 1\n', 1, /between 2 and 65, got 1/);
    expectError('LUT_3D_SIZE 66\n', 1, /between 2 and 65, got 66/);
    expectError('LUT_1D_SIZE 1\n', 1, /LUT_1D_SIZE must be between 2 and 65536, got 1/);
    expectError('LUT_1D_SIZE 65537\n', 1, /between 2 and 65536, got 65537/);
  });

  it('accepts the size limits', () => {
    expect(parseError('LUT_3D_SIZE 65\n0 0 0\n').message).toMatch(
      /expected 274625 data rows, found 1/,
    );
    expect(parseError('LUT_1D_SIZE 65536\n0 0 0\n').message).toMatch(
      /expected 65536 data rows, found 1/,
    );
  });

  it('rejects duplicate size keywords', () => {
    expectError('LUT_3D_SIZE 2\nLUT_3D_SIZE 2\n', 2, /duplicate LUT_3D_SIZE/);
    expectError('LUT_1D_SIZE 2\nLUT_1D_SIZE 2\n', 2, /duplicate LUT_1D_SIZE/);
  });

  it('rejects bad domain keywords', () => {
    expectError('DOMAIN_MIN 0 0\n', 1, /DOMAIN_MIN expects 3 values, got 2/);
    expectError('DOMAIN_MAX 1 1 1 1\n', 1, /DOMAIN_MAX expects 3 values, got 4/);
    expectError('DOMAIN_MIN 0 x 0\n', 1, /invalid number "x"/);
  });

  it('rejects an empty domain, reporting the line that defined it', () => {
    expectError(`DOMAIN_MIN 0 0 1\nDOMAIN_MAX 1 1 1\n${IDENTITY_2}`, 2, /DOMAIN_MIN must be less/);
    expectError(`DOMAIN_MAX 1 1 1\nDOMAIN_MIN 0 0 2\n${IDENTITY_2}`, 2, /DOMAIN_MIN must be less/);
  });

  it('rejects bad input ranges', () => {
    expectError('LUT_3D_INPUT_RANGE 0\n', 1, /expects 2 values, got 1/);
    expectError('LUT_3D_INPUT_RANGE 1 0\n', 1, /LUT_3D_INPUT_RANGE min must be less than max/);
    expectError('LUT_1D_INPUT_RANGE 1 1\n', 1, /LUT_1D_INPUT_RANGE min must be less than max/);
  });

  it('rejects unknown keywords', () => {
    expectError('LUT_3D_SIZE 2\nFOO 1\n', 2, /unknown keyword "FOO"/);
    expectError('FOO# c\n', 1, /unknown keyword "FOO"/);
  });

  it('rejects an unterminated TITLE', () => {
    expectError('# c\nTITLE "oops\n', 2, /unterminated TITLE/);
  });

  it('rejects keywords after data', () => {
    expectError('LUT_3D_SIZE 2\n0 0 0\nTITLE "late"\n', 3, /keyword TITLE after data/);
  });

  it('rejects rows with the wrong number of values', () => {
    expectError('LUT_3D_SIZE 2\n0 0\n', 2, /data row needs 3 values, got 2/);
    expectError('LUT_3D_SIZE 2\n0 0 0 0\n', 2, /data row needs 3 values, got 4/);
    expectError('LUT_3D_SIZE 2\n0 0 0 # a b\n1 0\n', 3, /got 2/);
  });

  it('rejects bad values', () => {
    expectError('LUT_3D_SIZE 2\n0 0 1,5\n', 2, /invalid number "1,5"/);
    expectError('LUT_3D_SIZE 2\n0x1 0 0\n', 2, /invalid number "0x1"/);
    expectError('LUT_3D_SIZE 2\n-inf 0 0\n', 2, /non-finite value "-inf"/);
    expectError('LUT_3D_SIZE 2\n0 Infinity 0\n', 2, /non-finite value "Infinity"/);
    expectError('LUT_3D_SIZE 2\n0 0 0\nabc 0 0\n', 3, /invalid number "abc"/);
    expectError('LUT_3D_SIZE 2\n0 0 1e999\n', 2, /number "1e999" is out of range/);
  });

  it('rejects too many rows', () => {
    expectError(`${IDENTITY_2}0 0 0\n`, 10, /unexpected data row 9, expected 8 rows/);
    expectError('LUT_1D_SIZE 2\n0 0 0\n1 1 1\n2 2 2\n', 4, /unexpected data row 3, expected 2/);
  });

  it('counts the 1D shaper rows as part of the total', () => {
    expectError(
      `LUT_1D_SIZE 2\nLUT_3D_SIZE 2\n0 0 0\n1 1 1\n${IDENTITY_2.split('\n').slice(1).join('\n')}0 0 0\n`,
      13,
      /unexpected data row 11, expected 10 rows/,
    );
    const e = parseError(`LUT_1D_SIZE 2\nLUT_3D_SIZE 2\n0 0 0\n1 1 1\n0 0 0\n`);
    expect(e.line).toBe(5);
    expect(e.message).toMatch(/expected 10 data rows, found 3/);
  });

  it('reports a short file at the last non-blank line', () => {
    expectError('LUT_3D_SIZE 2\n0 0 0\n1 0 0\n\n\n', 3, /expected 8 data rows, found 2/);
  });
});

describe('serializeCube', () => {
  function randomLut(size: number, seed = 1): Lut3D {
    let s = seed;
    const rand = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const data = new Float32Array(size ** 3 * 3).map(() => rand());
    return { size, domainMin: [0, 0, 0], domainMax: [1, 1, 1], data };
  }

  function expectClose(a: Lut3D | undefined, b: Lut3D, tol = 1e-6): void {
    expect(a?.size).toBe(b.size);
    expect(a?.domainMin).toEqual(b.domainMin);
    expect(a?.domainMax).toEqual(b.domainMax);
    expect(a?.data.length).toBe(b.data.length);
    let worst = 0;
    for (let i = 0; i < b.data.length; i++) {
      worst = Math.max(worst, Math.abs((a?.data[i] as number) - (b.data[i] as number)));
    }
    expect(worst).toBeLessThanOrEqual(tol);
  }

  it('round-trips a random 17^3 LUT within 1e-6', () => {
    const lut = randomLut(17);
    expectClose(parseCube(serializeCube(lut)).lut3d, lut);
  });

  it('round-trips a custom domain and keeps the title', () => {
    const lut: Lut3D = {
      ...randomLut(5, 7),
      domainMin: [-0.25, -0.5, 0],
      domainMax: [1.5, 2, 4],
      title: 'my "look"',
    };
    const out = parseCube(serializeCube(lut));
    expectClose(out.lut3d, lut);
    expect(out.title).toBe('my  look ');
  });

  it('round-trips every 3D fixture', () => {
    for (const name of ['identity-2.cube', 'identity-17.cube', 'custom-domain.cube']) {
      const lut = parseCube(fixture(name)).lut3d as Lut3D;
      expectClose(parseCube(serializeCube(lut)).lut3d, lut);
    }
  });

  it('writes an identity 2^3 LUT exactly', () => {
    expect(serializeCube(identityLut3D(2))).toBe(
      'LUT_3D_SIZE 2\n' +
        '0.000000 0.000000 0.000000\n1.000000 0.000000 0.000000\n' +
        '0.000000 1.000000 0.000000\n1.000000 1.000000 0.000000\n' +
        '0.000000 0.000000 1.000000\n1.000000 0.000000 1.000000\n' +
        '0.000000 1.000000 1.000000\n1.000000 1.000000 1.000000\n',
    );
  });

  it('writes title, comments, domain and honours precision', () => {
    const lut: Lut3D = {
      ...identityLut3D(2),
      domainMin: [0, 0, -1],
      domainMax: [1, 1, 1],
      title: 'ignored',
    };
    const text = serializeCube(lut, { title: 'T', comments: ['one', 'two\nthree'], precision: 2 });
    const lines = text.split('\n');
    expect(lines.slice(0, 7)).toEqual([
      'TITLE "T"',
      '# one',
      '# two',
      '# three',
      'LUT_3D_SIZE 2',
      'DOMAIN_MIN 0.00 0.00 -1.00',
      'DOMAIN_MAX 1.00 1.00 1.00',
    ]);
    expect(lines[7]).toBe('0.00 0.00 0.00');
    expect(text.endsWith('\n')).toBe(true);
    expect(text.includes('\r')).toBe(false);
  });

  it('falls back to lut.title and never writes negative zero', () => {
    const lut: Lut3D = { ...identityLut3D(2), title: 'from lut' };
    lut.data[0] = -1e-9;
    const text = serializeCube(lut);
    expect(text.startsWith('TITLE "from lut"\n')).toBe(true);
    expect(text).not.toContain('-0.000000');
    expect(text.split('\n')[2]).toBe('0.000000 0.000000 0.000000');
  });

  it('keeps legitimate negatives', () => {
    const lut = identityLut3D(2);
    lut.data[0] = -0.5;
    expect(serializeCube(lut)).toContain('-0.500000 0.000000 0.000000');
  });

  it('rejects invalid input', () => {
    const lut = identityLut3D(2);
    expect(() => serializeCube(lut, { precision: -1 })).toThrow(RangeError);
    expect(() => serializeCube(lut, { precision: 1.5 })).toThrow(RangeError);
    expect(() => serializeCube(lut, { precision: 11 })).toThrow(RangeError);
    expect(() => serializeCube({ ...lut, size: 1 })).toThrow(RangeError);
    expect(() => serializeCube({ ...lut, size: 66 })).toThrow(RangeError);
    expect(() => serializeCube({ ...lut, size: 3 })).toThrow(/does not match size/);
    const bad = identityLut3D(2);
    bad.data[5] = NaN;
    expect(() => serializeCube(bad)).toThrow(/non-finite/);
  });
});

describe('parseCube: performance', () => {
  it('parses a 65^3 file (~275k lines) in under 500 ms', () => {
    const text = serializeCube(identityLut3D(65));
    expect(text.split('\n').length).toBeGreaterThan(274625);
    const start = performance.now();
    const { lut3d } = parseCube(text);
    const elapsed = performance.now() - start;
    console.log(`parseCube 65^3: ${elapsed.toFixed(0)} ms`);
    expect(lut3d?.size).toBe(65);
    expect(elapsed).toBeLessThan(500);
  });
});
