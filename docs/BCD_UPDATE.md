# BCD activity update

## Running the update

Run `npm ci`, then `npm start` (`npm.cmd start` in PowerShell if needed).
At input-count selection, choose **BCD - decimal entry** or **BCD - 4-bit entry**.
Select 3 to 9 inputs and press Equals. In decimal entry, enter e.g. `25`.
In bit entry, enter `00100101` for 25; the screen groups it as `0010 0101`.
Every BCD nibble must be `0000` through `1001`. Fractional BCD uses complete
four-bit groups on each side of the radix point, e.g. `0101.0101` for 5.5.

Confirm all inputs, review Conversions and BCD complements, press Equals,
select + or minus, and press Equals. Expand **BCD complement arithmetic**,
**10's steps** / **9's steps**, then **Digit corrections** to inspect working.
All prior number-system features remain in **Number systems** mode.

## Arithmetic conventions

BCD is a decimal encoding, not base 2. Each decimal digit is independently
encoded in four bits. The complement systems here are decimal 10's and 9's,
not bitwise 2's and 1's. The program performs digitwise BCD addition and adds
0110 when the digit sum exceeds 9 (including a carry-producing binary sum).

Both addition and subtraction are evaluated in both signed complement systems.
Inputs remain non-negative. Positive operands have the same ordinary BCD
encoding in either system, so positive addition uses the same corrected BCD
addition in both. Subtraction adds the subtrahend's 10's or 9's complement.
The 10's method discards carry; the 9's method adds an end-around carry.
Negative encoded intermediates are decoded, and 9's negative zero is normalized.

The shared width retains input leading zeros and decimal places and is enlarged
until both signed systems can hold every intermediate result. Fixed-point BCD
uses all entered decimal places without truncation. BIN/OCT/DEC/HEX summaries
retain the existing eight-place display limit. Exact rational arithmetic remains
an independent main calculation. No negative input, mixed-mode operand set,
BCD multiplication, or BCD division is provided.

## Tests

`npm test` runs the existing complement suite and the new BCD unit suite.
For actual Electron UI regression testing:

```sh
npm start -- --remote-debugging-port=9226
# In another terminal (Node.js with fetch and WebSocket support):
npm run test:ui
```

New test files: `tests/bcd.cjs` and `tests/bcd-workflow.cjs`.
Manual screenshot cases are in the editable activity report.

| Case | Decimal entry | Operation | Expected decimal | Expected BCD magnitude |
|---|---|---|---|---|
| Addition | 25, 17, 3 | + | 45 | 0100 0101 |
| Subtraction | 25, 5, 3 | minus | 17 | 0001 0111 |
| Negative | 1, 10, 1 | minus | -10 | -0001 0000 |
| Zero | 5, 3, 2 | minus | 0 | 0000 |
| Fraction | 5.5, 1.5, 0.5 | minus | 3.5 | 0011 . 0101 |
| Carry | 99, 1, 1 | + | 101 | 0001 0000 0001 |

Panels may show extra leading zero groups because their encoded width is fixed.
