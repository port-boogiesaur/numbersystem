'use strict';
// Run Electron with --remote-debugging-port=9226, then npm run test:ui.
const assert = require('node:assert/strict');
async function run() {
  const pages = await (await fetch('http://127.0.0.1:9226/json')).json();
  const ws = new WebSocket(pages.find(p => p.url.endsWith('/index.html')).webSocketDebuggerUrl);
  await new Promise(resolve => { ws.onopen = resolve; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = ({data}) => { const m = JSON.parse(data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise(resolve => { pending.set(++id, resolve); ws.send(JSON.stringify({id, method, params})); });
  try {
    await send('Page.reload');
    await new Promise(resolve => setTimeout(resolve, 500));
    const result = await send('Runtime.evaluate', {expression: `(${testWorkflow.toString()})()`, returnByValue: true});
    assert.ok(!result.result.exceptionDetails, JSON.stringify(result.result.exceptionDetails));
    console.log(result.result.result.value);
  } finally { ws.close(); }
}
function testWorkflow(verifyLayout = true) {
  const check = (value, label) => { if (!value) throw new Error(label); };
  const btn = (key, value) => document.querySelector(`[data-${key}="${value}"]`);
  const click = (key, value) => btn(key, value).click();
  const type = value => [...value].forEach(v => click('value', v));
  const action = value => click('action', value);
  const display = document.querySelector('#display');
  const text = () => display.textContent;
  const value = () => document.querySelector('.display-value')?.textContent || '';
  const select = document.querySelector('#calculation-mode');
  const mode = name => { select.value = name; select.dispatchEvent(new Event('change')); };
  const reset = () => { for (let i = 0; i < 25 && !text().includes('How many input numbers?'); i++) action('clear'); action('clear'); };
  const collect = (values, selection = 'bcd-decimal') => {
    mode(selection); type(String(values.length)); action('equals');
    check(select.disabled, 'Mode locked after count');
    check([...document.querySelectorAll('[data-base]')].every(b => b.disabled), 'BCD base keys disabled');
    for (const input of values) { type(input); action('equals'); }
    check(text().includes('Conversions') && text().includes('BCD complements'), 'BCD conversion screen');
    action('equals');
    check(btn('operation','multiply').disabled && btn('operation','divide').disabled, 'BCD operations restricted');
    check(btn('action','equals').disabled, 'Requires operation');
  };
  const calculate = op => { click('operation', op); action('equals'); };
  const decimal = () => [...display.querySelectorAll('.display-summary')].find(n => n.textContent.startsWith('DEC: '))?.textContent.slice(5);
  for (const [inputs, op, expected] of [
    [['25','17','3'],'add','45'], [['25','5','3'],'subtract','17'],
    [['1','10','1'],'subtract','-10'], [['5','3','2'],'subtract','0'],
    [['0','0','0'],'subtract','0'], [['5.5','1.5','0.5'],'subtract','3.5'],
    [['99','1','1'],'add','101'], [Array(9).fill('1.5'),'add','13.5'],
    [['9007199254740993','1','1'],'add','9007199254740995']
  ]) {
    collect(inputs); calculate(op);
    check(decimal() === expected, `BCD expected ${expected}, got ${decimal()}`);
    check(text().includes("10's result:") && text().includes("9's result:"), 'Both method answers');
    display.querySelectorAll('details').forEach(d => { d.open = true; });
    check(text().includes('Correction') && text().includes('Encoded:'), 'Digit and encoding traces');
    display.scrollTop = display.scrollHeight;
    if (verifyLayout) check(display.scrollTop > 0 && document.documentElement.scrollHeight <= innerHeight, 'Internal scrolling only');
    action('backspace'); check(text().includes('Select an arithmetic operation') && btn('action','equals').disabled, 'Return and clear operator');
    action('clear'); action('clear');
    check(value() === inputs[inputs.length - 1], 'Last input restored');
    reset();
  }
  collect(['00100101','00000101','00000011'], 'bcd-bits'); calculate('subtract');
  check(decimal() === '17' && text().includes('0010 0101 BCD'), 'Actual BCD bit input');
  reset(); mode('bcd-bits'); type('3'); action('equals');
  check(btn('value','2').disabled, 'Bits only');
  type('1010'); action('equals'); check(text().includes('Invalid BCD digit'), 'Invalid nibble rejected');
  action('backspace'); action('equals'); check(text().includes('four bits'), 'Incomplete nibble rejected');
  action('clear'); type('3'); action('equals'); type('.');
  check(value() === '0000 . ', 'Leading BCD radix point');
  type('0101'); action('equals'); type('0000.0101'); action('equals'); type('0000'); action('equals'); action('equals'); calculate('add');
  check(decimal() === '1', 'BCD fractions');
  reset(); collect(['25','5','3']); calculate('subtract');
  action('clear'); action('clear'); action('clear');
  action('backspace'); type('2'); action('equals'); action('equals'); calculate('subtract');
  check(decimal() === '18', 'Editing replaces old operand');
  reset(); mode('standard');
  check([...document.querySelectorAll('[data-value]:not(:disabled)')].map(b=>b.dataset.value).sort().join('') === '3456789', 'Standard count restriction restored');
  return 'BCD workflows passed: 9 arithmetic cases, bit entry, fractions, invalid groups, mode restrictions, editing and navigation. Layout/scrolling: ' + (verifyLayout ? 'passed.' : 'not tested in DOM simulation.');
}
if (require.main === module) run().catch(e => { console.error(e); process.exitCode = 1; });
module.exports = { testWorkflow };
