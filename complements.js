"use strict";

// Fixed-point complement arithmetic. The decimal point is an implied scale;
// all complement and carry operations below use exact BigInt integers.
const ComplementMath = (() => {
  const bases = [2, 8, 10, 16];
  const names = { 2: "BIN", 8: "OCT", 10: "DEC", 16: "HEX" };

  function makeLayout(inputs, base) {
    const radix = BigInt(base);
    let places = 0, scale = 1n;
    while (places < 8 && inputs.some(input => input.exactValue.numerator * scale % input.exactValue.denominator !== 0n)) {
      places++;
      scale *= radix;
    }
    // Preserve entered leading/trailing zeros in the native base where possible.
    for (const input of inputs) {
      if (input.originalBase === base) {
        const fraction = input.originalText.split('.')[1] || '';
        while (places < Math.min(8, fraction.length)) { places++; scale *= radix; }
      }
    }
    const values = inputs.map(input => input.exactValue.numerator * scale / input.exactValue.denominator);
    const approximate = inputs.some(input => input.exactValue.numerator * scale % input.exactValue.denominator !== 0n);
    let integerDigits = Math.max(1, ...inputs.filter(input => input.originalBase === base)
      .map(input => input.originalText.split('.')[0].length));
    let modulus = radix ** BigInt(integerDigits) * scale;
    const total = values.reduce((sum, value) => sum + value, 0n);
    // Reserve signed range for every intermediate result, including nine inputs.
    // This prevents overflow and makes negative complement decoding unambiguous.
    while (modulus <= 2n * total + 1n) { integerDigits++; modulus *= radix; }
    return { base, places, scale, integerDigits, modulus, values, approximate };
  }

  function formatFixed(value, layout, padded = true) {
    const sign = value < 0n ? '-' : '';
    const magnitude = value < 0n ? -value : value;
    let digits = magnitude.toString(layout.base).toUpperCase()
      .padStart((padded ? layout.integerDigits : 1) + layout.places, '0');
    if (layout.places) digits = digits.slice(0, -layout.places) + '.' + digits.slice(-layout.places);
    return sign + digits;
  }

  function complement(value, layout, method) {
    return method === 'radix' ? (layout.modulus - value) % layout.modulus : layout.modulus - 1n - value;
  }

  function decode(encoded, layout, method) {
    const limit = method === 'radix' ? layout.modulus : layout.modulus - 1n;
    // The all-(r-1) pattern represents negative zero in diminished complement.
    if (method === 'diminished' && encoded === limit) return 0n;
    return encoded > limit / 2n ? encoded - limit : encoded;
  }

  function subtract(layout, method) {
    let encoded = layout.values[0];
    const steps = [];
    for (const operand of layout.values.slice(1)) {
      const previous = encoded;
      const added = complement(operand, layout, method);
      const sum = previous + added;
      const carry = sum / layout.modulus;
      encoded = sum % layout.modulus;
      // r's: discard the carry. (r-1)'s: add it to the least significant place.
      if (method === 'diminished') encoded += carry;
      steps.push({ previous, operand, added, sum, carry, encoded, signed: decode(encoded, layout, method) });
    }
    return { steps, encoded, signed: decode(encoded, layout, method) };
  }

  function analyze(inputs, base) {
    const layout = makeLayout(inputs, base);
    return {
      layout,
      inputs: layout.values.map(value => ({ value, radix: complement(value, layout, 'radix'), diminished: complement(value, layout, 'diminished') })),
      radix: subtract(layout, 'radix'),
      diminished: subtract(layout, 'diminished')
    };
  }
  return { bases, names, makeLayout, formatFixed, complement, subtract, analyze };
})();

// The same implementation is used by Electron and the standalone unit tests.
if (typeof module !== 'undefined' && module.exports) module.exports = ComplementMath;
