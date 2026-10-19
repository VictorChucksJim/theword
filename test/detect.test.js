'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalise } = require('../src/scripture');
test('normalise spoken reference punctuation', () => {
  assert.equal(normalise('John 3:16'), 'john 3 : 16');
});
