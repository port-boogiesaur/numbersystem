// Run with Electron open: npm.cmd start -- --remote-debugging-port=9226
// Then: node tests/arithmetic.cjs
const assert = require('node:assert/strict');

async function run() {
  const pages = await (await fetch('http://127.0.0.1:9226/json')).json();
  const ws = new WebSocket(pages.find(page => page.url.endsWith('/index.html')).webSocketDebuggerUrl);
  await new Promise(resolve => { ws.onopen = resolve; });
  let id = 0;
  const pending = new Map(), errors = [];
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown' ||
        (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') ||
        (message.method === 'Log.entryAdded' && message.params.entry.level === 'error')) errors.push(message);
    if (pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  };
  const send = (method, params = {}) => new Promise(resolve => {
    pending.set(++id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  try {
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.reload');
    await new Promise(resolve => setTimeout(resolve, 500));
    const result = await send('Runtime.evaluate', {
      expression: `(${testWorkflow.toString()})()`, returnByValue: true
    });
    assert.ok(!result.result.exceptionDetails, JSON.stringify(result.result.exceptionDetails));
    assert.equal(errors.length, 0, JSON.stringify(errors));
    console.log(JSON.stringify(result.result.result.value, null, 2));
    console.log('No renderer exceptions or console errors.');
    await send('Page.reload');
  } finally { ws.close(); }
}

function testWorkflow() {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const button = (key, value) => document.querySelector(`[data-${key}="${value}"]`);
  const digit = value => button('value', value).click();
  const action = value => button('action', value).click();
  const select = value => button('operation', value).click();
  const display = document.querySelector('#display');
  const text = () => display.textContent;
  const entry = () => document.querySelector('.display-value')?.textContent || '';
  const allowed = () => [...document.querySelectorAll('[data-value]:not(:disabled)')].map(b => b.dataset.value).sort().join('');
  const geometry = () => JSON.stringify(document.querySelector('.keypad').getBoundingClientRect().toJSON());
  const initialGeometry = geometry();
  const assertReset = () => {
    check(text().includes('Enter 3 to 9') && allowed() === '3456789', 'Reset/count restrictions');
    check(!entry() && !document.querySelector('[aria-pressed="true"]'), 'Reset removes values/selections');
    check([...document.querySelectorAll('[data-base], [data-operation]')].every(b => b.disabled), 'Reset disables bases/operators');
  };
  const restart = () => {
    for (let i = 0; i < 20 && !text().includes('How many input numbers?'); i++) action('clear');
    action('clear'); assertReset();
  };
  const collect = inputs => {
    digit(String(inputs.length)); action('equals');
    inputs.forEach(([base, value], index) => {
      check(text().includes(`Input ${index + 1} of ${inputs.length}`) && allowed() === '', 'Input advance resets base');
      button('base', base).click();
      for (const character of value) digit(character);
      action('equals');
    });
    check(document.querySelectorAll('.result-heading').length === inputs.length, 'All individual conversions');
    check(document.querySelectorAll('.complement-panel > details').length === 4, 'Complements available in all four bases');
    check(geometry() === initialGeometry, 'Fixed keypad at individual results');
    action('equals');
    check(text().includes('Select an arithmetic operation') && allowed() === '', 'Operation stage');
    check(button('action', 'equals').disabled, 'Equals requires selection');
    check([...document.querySelectorAll('[data-operation]')].every(b => !b.disabled), 'Operators enabled');
  };
  const calculate = operation => {
    select(operation);
    check(button('operation', operation).getAttribute('aria-pressed') === 'true', 'Selected operator highlight');
    check(!button('action', 'equals').disabled, 'Equals enabled');
    action('equals');
  };
  const output = () => [...document.querySelectorAll('.display-summary')].map(e => e.textContent);
  const decimal = () => output().find(line => line.startsWith('DEC: '))?.slice(5);
  assertReset();
  action('equals'); check(text().includes('Choose 3 to 9'), 'Empty count');
  digit('3'); digit('9'); check(entry() === '9', 'Count replacement');
  action('backspace'); check(!entry(), 'Count Delete');
  digit('7'); action('clear'); check(!entry(), 'Count AC');

  const cases = [
    ['Addition', [[2,'101'],[8,'17'],[10,'25']], 'add', '45'],
    ['Subtraction', [[2,'11110'],[10,'5'],[16,'A']], 'subtract', '15'],
    ['Multiplication', [[8,'7'],[10,'3'],[16,'A']], 'multiply', '210'],
    ['Division', [[2,'110000'],[8,'4'],[16,'2']], 'divide', '6'],
    ['Fractional input', [[2,'10.1'],[8,'1.4'],[16,'0.8']], 'add', '4.5'],
    ['Fractional division', [[2,'101'],[10,'10'],[16,'1']], 'divide', '0.5'],
    ['Negative', [[2,'1'],[10,'10'],[16,'1']], 'subtract', '-10'],
    ['Zero divisor', [[2,'101'],[8,'0'],[16,'1']], 'divide', null]
  ];
  const reports = [];
  const names = {2:'BIN',8:'OCT',10:'DEC',16:'HEX'};
  const symbols = {add:'+',subtract:String.fromCodePoint(0x2212),multiply:String.fromCodePoint(0xd7),divide:String.fromCodePoint(0xf7)};
  for (const [name, inputs, operation, expected] of cases) {
    collect(inputs);
    select('multiply'); select(operation); action('backspace');
    check(button('action','equals').disabled && !document.querySelector('[aria-pressed="true"]'), 'Clear operation');
    calculate(operation);
    check(text().includes(inputs.map(([base,value]) => `(${value} ${names[base]})`).join(` ${symbols[operation]} `)), 'Original expression');
    if (expected === null) {
      check(text().includes('Cannot divide by zero.') && !text().includes('Infinity') && !text().includes('NaN'), 'Zero division handled');
    } else {
      check(decimal() === expected, `${name}: expected ${expected}, got ${decimal()}`);
      if (name === 'Addition') check(['BIN: 101101','OCT: 55','HEX: 2D'].every(line => output().includes(line)), 'All final bases');
      if (operation === 'subtract') {
        check(document.querySelector('.complement-panel > summary').textContent === 'Complement subtraction', 'Both subtraction methods available');
        const panels = [...document.querySelectorAll('.complement-panel > details')];
        check(panels.length === 4 && panels.every(panel => panel.textContent.includes('Encoded:') && panel.textContent.includes('Signed:')), 'Complement steps in every base');
      }
      if (name === 'Negative') check(['BIN: -1010','OCT: -12','HEX: -A'].every(line => output().includes(line)), 'All negative bases');
    }
    check(geometry() === initialGeometry && document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth, 'Fixed geometry/no overflow');
    action('clear'); check(text().includes('Select an arithmetic operation'), 'AC returns to operation selection');
    calculate(operation);
    action('backspace'); check(text().includes('Select an arithmetic operation') && button('action','equals').disabled, 'Return to operation selection');
    calculate('add'); check(decimal() !== undefined, 'Recalculate retained inputs');
    restart(); reports.push(`${name}: passed`);
  }
  // Nine differently based fractional inputs; each equals 1.5, sum is 13.5.
  const nine = Array.from({length:9}, (_,i) => [[2,'1.1'],[8,'1.4'],[10,'1.5'],[16,'1.8']][i%4]);
  collect(nine); calculate('add'); check(decimal() === '13.5', 'Nine-input sum');
  check((output()[0].match(/\(/g)||[]).length === 9, 'Nine terms in expression');
  display.scrollTop = display.scrollHeight; check(display.scrollTop > 0, 'Long results scroll');
  restart(); reports.push('Nine mixed-base fractional inputs: 13.5 passed');
  for (const [inputs,op,expected] of [
    [[[10,'1'],[10,'3'],[10,'1']], 'divide', '0.33333333'+String.fromCodePoint(8230)],
    [[[10,'0'],[10,'1'],[10,'2']], 'divide', '0'],
    [[[10,'0.1'],[10,'0.2'],[10,'0.3']], 'subtract', '-0.4'],
    [[[10,'9007199254740993'],[10,'1'],[10,'1']], 'add', '9007199254740995'],
    [[[10,'1'],[10,'1'],[8,'0.0']], 'divide', null]
  ]) {
    collect(inputs); calculate(op);
    check(expected === null ? text().includes('Cannot divide by zero.') : decimal() === expected, 'Precision/repeating/zero regression');restart();
  }
  // Decimal-point editing and digit restrictions remain unchanged.
  digit('3'); action('equals');
  for (const [base,valid] of [[2,'01'],[8,'01234567'],[10,'0123456789'],[16,'0123456789ABCDEF']]) {
    button('base',base).click(); check(allowed() === '.'+valid, 'Base restrictions');
    digit('.'); digit('.'); check(entry() === '0.', 'One decimal/leading zero');
    action('backspace'); check(entry() === '0', 'Delete decimal');action('backspace');check(!entry(), 'Delete remaining digit');
  }
  action('clear');
  check(text().includes('How many input numbers?'), 'AC returns to count');
  digit('3'); action('equals');
  button('base', 16).click(); digit('A'); action('equals');
  button('base', 10).click(); digit('2'); action('equals');
  action('clear');
  check(text().includes('Input 2 of 3') && entry() === '2' && button('base',10).getAttribute('aria-pressed') === 'true', 'Restore previous value/base');
  action('backspace'); digit('3'); action('equals');
  button('base', 2).click(); digit('1'); action('equals');
  action('clear'); check(entry() === '1', 'Conversions back to last input');
  action('equals'); action('equals'); calculate('add');
  check(decimal() === '14', 'Corrected input recalculated without duplicates');
  restart();
  return { reports, additionalChecks: 'Exact precision, signed fractions, repeating output, zero numerator/divisors, restart, selection, decimal editing and fixed layout passed' };
}
run().catch(error => { console.error(error); process.exitCode = 1; });
