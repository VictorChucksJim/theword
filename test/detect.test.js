'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { Scripture, normalise } = require('../src/scripture');

const S = new Scripture();
const label = (t) => S.findReferences(t).map((r) => r.label);

test('number words', () => {
  assert.strictEqual(normalise('John three sixteen'), 'john 3 16');
  assert.strictEqual(normalise('Psalm one hundred and nineteen verse one hundred five'), 'psalm 119 verse 105');
  assert.strictEqual(normalise('Romans eight twenty eight'), 'romans 8 28 '.trim());
  assert.strictEqual(normalise('first Corinthians thirteen'), '1 corinthians 13');
});

test('explicit references', () => {
  assert.deepStrictEqual(label('turn with me to John 3:16'), ['John 3:16']);
  assert.deepStrictEqual(label('turn to John three sixteen'), ['John 3:16']);
  assert.deepStrictEqual(label('Romans chapter 8 verse 28'), ['Romans 8:28']);
  assert.deepStrictEqual(label('Romans eight twenty eight'), ['Romans 8:28']);
  assert.deepStrictEqual(label('first Corinthians thirteen verses four to seven'), ['1 Corinthians 13:4–7']);
  assert.deepStrictEqual(label('second Timothy three sixteen'), ['2 Timothy 3:16']);
  assert.deepStrictEqual(label('Psalm one hundred nineteen verse one oh five'.replace(' oh ', ' ')), ['Psalm 119:1']);
  assert.deepStrictEqual(label('Jude 5'), ['Jude 1:5']);
  assert.deepStrictEqual(label('Philippians four thirteen and Isaiah forty one ten'), ['Philippians 4:13', 'Isaiah 41:10']);
  assert.deepStrictEqual(label('Song of Solomon two four'), ['Song of Solomon 2:4']);
  assert.deepStrictEqual(label('First John one nine'), ['1 John 1:9']);
  assert.deepStrictEqual(label('John 99:99'), []);
});

test('chapter only gives opening verses', () => {
  const r = S.findReferences('Psalm 23')[0];
  assert.strictEqual(r.vStart, 1);
  assert.ok(r.wholeChapter);
});

test('verse carry-over in a session', () => {
  S.findReferences('turn to Ephesians two', 's1');
  const r = S.findReferences('look at verse eight', 's1');
  assert.strictEqual(r[0].label, 'Ephesians 2:8');
});

test('false positives stay quiet', () => {
  assert.deepStrictEqual(label('John said he would be late'), []);
  assert.deepStrictEqual(label('I have one job to do today'), []);
  assert.deepStrictEqual(label('we gave the first number to Mark'), []);
});

test('paraphrase search', () => {
  const top = (t, cue) => S.suggest(t, { cue })[0];
  assert.strictEqual(top('God loved the world so much that he gave his only son so that anyone who believes will not die but live forever').label, 'John 3:16');
  assert.strictEqual(top('the Lord is my shepherd I will not lack anything').label, 'Psalm 23:1');
  assert.strictEqual(top('I can do all things through Christ who gives me strength').label, 'Philippians 4:13');
  assert.strictEqual(top('trust in the Lord with all your heart and do not lean on your own understanding').label, 'Proverbs 3:5');
  assert.strictEqual(top('for by grace you have been saved through faith and that not of yourselves it is a gift of God').label, 'Ephesians 2:8');
  assert.strictEqual(top('all things work together for good to those who love God', true).label, 'Romans 8:28');
});

test('ordinary speech gives no suggestion', () => {
  assert.strictEqual(S.suggest('good morning everyone please be seated and welcome to church today').length, 0);
  assert.strictEqual(S.suggest('the offering buckets will be passed around after the service').length, 0);
});

test('best version follows the speaker wording', () => {
  const kjv = S.suggest('for God so loved the world that he gave his only begotten son')[0];
  assert.strictEqual(kjv.bestVersion, 'KJV');
  const bbe = S.suggest('God had such love for the world that he gave his only Son')[0];
  assert.strictEqual(bbe.bestVersion, 'BBE');
});
