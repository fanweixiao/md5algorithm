const INITIAL_HASH = Object.freeze([
  0x67452301,
  0xefcdab89,
  0x98badcfe,
  0x10325476,
]);

const SHIFT_AMOUNTS = Object.freeze([
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]);

const TABLE_K = Object.freeze(
  Array.from({ length: 64 }, (_, index) =>
    Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0,
  ),
);

const ROUND_FORMULAS = Object.freeze({
  F: '(B & C) | (~B & D)',
  G: '(D & B) | (~D & C)',
  H: 'B ^ C ^ D',
  I: 'C ^ (B | ~D)',
});

const INDEX_FORMULAS = Object.freeze({
  F: 'g = i',
  G: 'g = (5i + 1) mod 16',
  H: 'g = (3i + 5) mod 16',
  I: 'g = (7i) mod 16',
});

function leftRotate(value, amount) {
  return ((value << amount) | (value >>> (32 - amount))) >>> 0;
}

function bytesToWordLittleEndian(bytes, offset) {
  return (
    (bytes[offset]) |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function wordToHexLittleEndian(word) {
  const value = word >>> 0;
  return [
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function toHex32(value) {
  return (value >>> 0).toString(16).padStart(8, '0');
}

export function formatWord(value) {
  return `0x${toHex32(value)}`;
}

function parseHexInput(value) {
  const clean = value.replace(/\s+/g, '').toLowerCase();
  if (clean.length === 0) {
    return [];
  }

  if (clean.length % 2 !== 0) {
    throw new Error('Hex input must contain an even number of digits.');
  }

  if (/[^0-9a-f]/.test(clean)) {
    throw new Error('Hex input can only contain 0-9 and a-f.');
  }

  const bytes = [];
  for (let index = 0; index < clean.length; index += 2) {
    bytes.push(parseInt(clean.slice(index, index + 2), 16));
  }

  return bytes;
}

function parseInputBytes(value, inputType) {
  if (inputType === 'hex') {
    return parseHexInput(value);
  }

  return Array.from(new TextEncoder().encode(value));
}

function padBytes(bytes) {
  const bitLength = BigInt(bytes.length) * 8n;
  const padded = [...bytes, 0x80];

  while (padded.length % 64 !== 56) {
    padded.push(0);
  }

  for (let offset = 0n; offset < 8n; offset += 1n) {
    padded.push(Number((bitLength >> (offset * 8n)) & 0xffn));
  }

  return padded;
}

function digestFromState(state) {
  return state.map((word) => wordToHexLittleEndian(word)).join('');
}

function chunkBytes(bytes) {
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const block = bytes.slice(offset, offset + 64);
    chunks.push({
      index: offset / 64,
      bytes: block,
      words: Array.from({ length: 16 }, (_, wordIndex) =>
        bytesToWordLittleEndian(block, wordIndex * 4),
      ),
    });
  }
  return chunks;
}

export function buildMd5Trace(inputValue, inputType = 'text') {
  const inputBytes = parseInputBytes(inputValue, inputType);
  const paddedBytes = padBytes(inputBytes);
  const chunks = chunkBytes(paddedBytes);

  const events = [
    {
      type: 'preprocess',
      inputType,
      inputLengthBytes: inputBytes.length,
      inputLengthBits: Number(BigInt(inputBytes.length) * 8n),
      paddedLengthBytes: paddedBytes.length,
      paddedLengthBits: paddedBytes.length * 8,
      addedBytes: paddedBytes.length - inputBytes.length,
      chunkCount: chunks.length,
      digestPreview: digestFromState(INITIAL_HASH),
    },
  ];

  let hash = [...INITIAL_HASH];

  for (const chunk of chunks) {
    const hashBefore = [...hash];
    let [a, b, c, d] = hash;

    events.push({
      type: 'chunk-start',
      chunkIndex: chunk.index,
      chunkWords: [...chunk.words],
      hashBefore,
      registersBefore: [a, b, c, d],
      digestPreview: digestFromState(hashBefore),
    });

    for (let i = 0; i < 64; i += 1) {
      const aBefore = a >>> 0;
      const bBefore = b >>> 0;
      const cBefore = c >>> 0;
      const dBefore = d >>> 0;

      let functionName = 'F';
      let f = 0;
      let g = 0;

      if (i < 16) {
        functionName = 'F';
        f = (bBefore & cBefore) | (~bBefore & dBefore);
        g = i;
      } else if (i < 32) {
        functionName = 'G';
        f = (dBefore & bBefore) | (~dBefore & cBefore);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        functionName = 'H';
        f = bBefore ^ cBefore ^ dBefore;
        g = (3 * i + 5) % 16;
      } else {
        functionName = 'I';
        f = cBefore ^ (bBefore | ~dBefore);
        g = (7 * i) % 16;
      }

      const functionResult = f >>> 0;
      const sum = (aBefore + functionResult + TABLE_K[i] + chunk.words[g]) >>> 0;
      const rotated = leftRotate(sum, SHIFT_AMOUNTS[i]);
      const nextB = (bBefore + rotated) >>> 0;

      a = dBefore;
      d = cBefore;
      c = bBefore;
      b = nextB;

      const previewHash = [
        (hashBefore[0] + a) >>> 0,
        (hashBefore[1] + b) >>> 0,
        (hashBefore[2] + c) >>> 0,
        (hashBefore[3] + d) >>> 0,
      ];

      events.push({
        type: 'round',
        chunkIndex: chunk.index,
        roundIndex: i,
        stepWithinChunk: i + 1,
        functionName,
        functionFormula: ROUND_FORMULAS[functionName],
        indexFormula: INDEX_FORMULAS[functionName],
        g,
        shift: SHIFT_AMOUNTS[i],
        constant: TABLE_K[i],
        messageWord: chunk.words[g],
        functionResult,
        sum,
        rotated,
        registersBefore: [aBefore, bBefore, cBefore, dBefore],
        registersAfter: [a, b, c, d],
        digestPreview: digestFromState(previewHash),
      });
    }

    hash = [
      (hash[0] + a) >>> 0,
      (hash[1] + b) >>> 0,
      (hash[2] + c) >>> 0,
      (hash[3] + d) >>> 0,
    ];

    events.push({
      type: 'chunk-end',
      chunkIndex: chunk.index,
      hashBefore,
      registersBeforeAdd: [a >>> 0, b >>> 0, c >>> 0, d >>> 0],
      hashAfter: [...hash],
      digestAfterChunk: digestFromState(hash),
      digestPreview: digestFromState(hash),
    });
  }

  const digest = digestFromState(hash);

  events.push({
    type: 'done',
    hash: [...hash],
    digest,
    chunkCount: chunks.length,
    digestPreview: digest,
  });

  return {
    inputType,
    inputBytes,
    paddedBytes,
    chunks,
    events,
    digest,
    constants: TABLE_K,
    shifts: SHIFT_AMOUNTS,
    initialHash: [...INITIAL_HASH],
  };
}
