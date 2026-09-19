'use strict';
const assert = require('node:assert/strict');
const C = require('../complements.js');
const input = (numerator, denominator = 1n, originalBase = 10, originalText = String(numerator)) => ({
  exactValue: { numerator: BigInt(numerator), denominator }, originalBase, originalText
});
let checks = 0;
for (const base of C.bases) {
  // Cover carry/no carry, zeros, equality and negative intermediate results.
  for (let a = 0; a < 20; a++) for (let b = 0; b < 20; b++) {
    const report = C.analyze([input(a), input(b), input(3)], base);
    const expected = BigInt(a - b - 3);
    assert.equal(report.radix.signed, expected);
    assert.equal(report.diminished.signed, expected);
    checks++;
  }
  const nine = C.analyze(Array.from({length:9}, (_,i) => input(i+1)), base);
  assert.equal(nine.radix.signed, -43n);
  assert.equal(nine.diminished.signed, -43n);
  const fractions = C.analyze([input(11,2n), input(3,2n), input(1,2n)],base);
  assert.equal(fractions.layout.approximate, false);
  assert.equal(fractions.radix.signed * 2n, 7n * fractions.layout.scale);
  assert.equal(fractions.diminished.signed, fractions.radix.signed);
  const huge = C.analyze([input(900719925474099300n),input(12),input(1)],base);
  assert.equal(huge.radix.signed,900719925474099287n);
  assert.equal(huge.diminished.signed,huge.radix.signed);
  const zero = C.analyze([input(0),input(0),input(0)],base);
  assert.equal(zero.radix.signed,0n);assert.equal(zero.diminished.signed,0n);
  const a = C.analyze([input(1,10n),input(0),input(0)],base);
  assert.equal(a.layout.approximate, base !== 10);
  assert.equal(a.radix.signed,a.diminished.signed);
}
// Explicit known patterns, preserving native leading zeros and fractional places.
for (const [base,text,numerator,denominator,radix,diminished] of [
  [2,'0101',5n,1n,'1011','1010'],
  [8,'017',15n,1n,'761','760'],
  [10,'025',25n,1n,'975','974'],
  [16,'0AF',175n,1n,'F51','F50'],
  [10,'05.50',550n,100n,'94.50','94.49']
]) {
  const r=C.analyze([input(numerator,denominator,base,text)],base);
  assert.equal(C.formatFixed(r.inputs[0].radix,r.layout),radix);
  assert.equal(C.formatFixed(r.inputs[0].diminished,r.layout),diminished);
}
console.log(`${checks} subtraction combinations plus known complements, fractional, precision and nine-input checks passed.`);
