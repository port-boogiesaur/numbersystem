'use strict';
const assert = require('node:assert/strict');
const B = require('../bcd.js');
let cases = 0;
const check = (texts, op, expected) => {
  const r = B.analyze(texts, op);
  const [whole, frac = ''] = expected.replace('-', '').split('.');
  const scaled = BigInt(whole + frac.padEnd(r.layout.places, '0')) * (expected.startsWith('-') ? -1n : 1n);
  assert.equal(r.tens.signed, scaled);
  assert.equal(r.nines.signed, scaled);
  for (const method of ['tens', 'nines']) for (const step of r[method].steps) {
    assert.ok(step.corrections.every(c => Number.parseInt(c.digit, 2) <= 9));
  }
  cases++;
  return r;
};
assert.equal(B.encode('25'), '0010 0101');
assert.equal(B.decode('0010 0101'), '25');
assert.equal(B.decode('0000 0101 . 0101 0000'), '05.50');
assert.equal(B.encode('-10.5'), '-0001 0000 . 0101');
for (let digit = 0; digit <= 9; digit++) assert.equal(B.decode(B.encode(String(digit))), String(digit));
for (const text of ['', '010', '00101', '1010', '1111', '0001.001', '0001..0000', '-0001', '2']) {
  assert.throws(() => B.decode(text));
}
for (let a = 0; a < 100; a++) for (let b = 0; b < 100; b++) {
  check([String(a), String(b), '3'], 'add', String(a + b + 3));
  check([String(a), String(b), '3'], 'subtract', String(a - b - 3));
}
const known = check(['25', '5', '3'], 'subtract', '17');
assert.equal(B.fixed(known.inputs[0].tens, known.layout), '75');
assert.equal(B.fixed(known.inputs[0].nines, known.layout), '74');
assert.equal(known.tens.steps[0].carry, 1n);
assert.ok(known.nines.steps[0].endAround);
check(['25','17','3'], 'add', '45');
check(['1','10','1'], 'subtract', '-10');
check(['5','3','2'], 'subtract', '0');
check(['0','0','0'], 'subtract', '0');
check(['5.5','1.5','0.5'], 'subtract', '3.5');
check(['0.1','0.2','0.3'], 'add', '0.6');
check(['0.1','0.2','0.3'], 'subtract', '-0.4');
check(['99','1','1'], 'add', '101');
check(['9007199254740993','1','1'], 'add', '9007199254740995');
check(Array(9).fill('1.5'), 'add', '13.5');
check(['0.000000001','0.000000002','0.000000003'], 'add', '0.000000006');
const zeros = check(['005.50','001.50','000.50'], 'subtract', '3.5');
assert.equal(B.fixed(zeros.inputs[0].value, zeros.layout), '005.50');
assert.throws(() => B.analyze(['1','2','3'], 'multiply'));
console.log(`${cases} BCD cases passed for BOTH complement methods; codec, invalid groups, carry, negative, zero, fraction, width, nine-input and BigInt checks passed.`);
