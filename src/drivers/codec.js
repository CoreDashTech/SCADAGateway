'use strict';
// Converts between Modbus 16-bit registers and engineering values.

const WORDS = { bool: 1, int16: 1, uint16: 1, int32: 2, uint32: 2, float32: 2 };

function wordCount(dataType) {
  const n = WORDS[dataType || 'uint16'];
  if (!n) throw new Error('Unsupported dataType ' + dataType);
  return n;
}

function round(v) { return Math.round(v * 1e6) / 1e6; }

// regs: array of uint16 words starting at the tag's address
function decode(regs, tag) {
  const type = tag.dataType || 'uint16';
  const buf = Buffer.alloc(4);
  let raw;
  if (type === 'bool') return Boolean(regs[0]);
  if (type === 'int16') { buf.writeUInt16BE(regs[0] & 0xffff, 0); raw = buf.readInt16BE(0); }
  else if (type === 'uint16') raw = regs[0] & 0xffff;
  else {
    const [hi, lo] = tag.wordSwap ? [regs[1], regs[0]] : [regs[0], regs[1]];
    buf.writeUInt16BE(hi & 0xffff, 0);
    buf.writeUInt16BE(lo & 0xffff, 2);
    raw = type === 'int32' ? buf.readInt32BE(0) : type === 'uint32' ? buf.readUInt32BE(0) : buf.readFloatBE(0);
  }
  return round(raw * (tag.scale ?? 1) + (tag.offset ?? 0));
}

// Returns array of uint16 words for writing
function encode(value, tag) {
  const type = tag.dataType || 'uint16';
  if (type === 'bool') return [value ? 1 : 0];
  const raw = (Number(value) - (tag.offset ?? 0)) / (tag.scale ?? 1);
  const buf = Buffer.alloc(4);
  if (type === 'int16') { buf.writeInt16BE(Math.round(raw), 0); return [buf.readUInt16BE(0)]; }
  if (type === 'uint16') return [Math.max(0, Math.min(0xffff, Math.round(raw)))];
  if (type === 'int32') buf.writeInt32BE(Math.round(raw), 0);
  else if (type === 'uint32') buf.writeUInt32BE(Math.max(0, Math.round(raw)) >>> 0, 0);
  else buf.writeFloatBE(raw, 0);
  const words = [buf.readUInt16BE(0), buf.readUInt16BE(2)];
  return tag.wordSwap ? [words[1], words[0]] : words;
}

// Groups tags of one register type into contiguous read blocks.
function planBlocks(tags, { maxGap = 10, maxLen = 120 } = {}) {
  const sorted = [...tags].sort((a, b) => a.address - b.address);
  const blocks = [];
  for (const t of sorted) {
    const end = t.address + wordCount(t.dataType);
    const last = blocks[blocks.length - 1];
    if (last && t.address - last.end <= maxGap && end - last.start <= maxLen) {
      last.end = Math.max(last.end, end);
      last.tags.push(t);
    } else {
      blocks.push({ start: t.address, end, tags: [t] });
    }
  }
  return blocks;
}

module.exports = { decode, encode, wordCount, planBlocks };
