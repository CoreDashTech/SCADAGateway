'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { decode, encode, planBlocks } = require('../src/drivers/codec');

test('float32 round trip, normal and word-swapped', () => {
  for (const wordSwap of [false, true]) {
    const tag = { dataType: 'float32', wordSwap };
    assert.ok(Math.abs(decode(encode(231.75, tag), tag) - 231.75) < 1e-4);
  }
});

test('int16 negative, scale and offset', () => {
  const tag = { dataType: 'int16', scale: 0.1 };
  assert.deepStrictEqual(encode(-12.5, tag), [0xff83]);
  assert.strictEqual(decode([0xff83], tag), -12.5);
  assert.strictEqual(decode([625], { dataType: 'uint16', scale: 0.1 }), 62.5);
});

test('uint32 totaliser', () => {
  const tag = { dataType: 'uint32', scale: 0.01 };
  assert.strictEqual(decode(encode(48211.42, tag), tag), 48211.42);
});

test('block planner merges near addresses and splits far ones', () => {
  const blocks = planBlocks([
    { address: 0, dataType: 'float32' }, { address: 2, dataType: 'float32' }, { address: 4, dataType: 'float32' },
    { address: 52, dataType: 'float32' }, { address: 342, dataType: 'float32' }
  ]);
  assert.deepStrictEqual(blocks.map((b) => [b.start, b.end]), [[0, 6], [52, 54], [342, 344]]);
});
