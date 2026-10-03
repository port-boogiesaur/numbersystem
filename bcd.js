"use strict";

// 8421 BCD: each decimal digit is a separate four-bit group, not base 2.
const BcdMath = (() => {
  const bits = digit => Number(digit).toString(2).padStart(4, "0");
  function encode(text) {
    if (!/^-?\d+(?:\.\d*)?$/.test(text)) throw new Error("Invalid decimal value.");
    const sign = text.startsWith("-") ? "-" : "";
    return sign + text.replace(/^-/, "").split(".")
      .map(part => [...part].map(bits).join(" ")).join(" . ");
  }
  function decode(text) {
    const compact = text.replace(/\s/g, "");
    if (!/^[01]+(?:\.[01]*)?$/.test(compact)) throw new Error("Enter BCD using 0 and 1 only.");
    const parts = compact.split(".");
    if (parts.some(part => part.length % 4)) throw new Error("Complete each BCD digit with four bits.");
    return parts.map(part => {
      const groups = part.match(/.{4}/g) || [];
      return groups.map(group => {
        const value = Number.parseInt(group, 2);
        if (value > 9) throw new Error("Invalid BCD digit: use 0000 through 1001.");
        return String(value);
      }).join("");
    }).join(".");
  }
  const groupEntry = text => text.split(".").map(part => (part.match(/.{1,4}/g) || []).join(" ")).join(" . ");

  function layoutFor(texts) {
    if (texts.length < 3 || texts.length > 9) throw new Error("Choose 3 to 9 inputs.");
    if (texts.some(text => !/^\d+(?:\.\d*)?$/.test(text))) throw new Error("Enter non-negative decimal values.");
    const places = Math.max(...texts.map(text => (text.split(".")[1] || "").length));
    const scale = 10n ** BigInt(places);
    const values = texts.map(text => {
      const [whole, fraction = ""] = text.split(".");
      return BigInt(whole + fraction.padEnd(places, "0"));
    });
    let integerDigits = Math.max(1, ...texts.map(text => text.split(".")[0].length));
    let modulus = 10n ** BigInt(integerDigits + places);
    const total = values.reduce((a, b) => a + b, 0n);
    // Both signed complement encodings must fit every intermediate sum/difference.
    while (modulus <= 2n * total + 1n) { integerDigits++; modulus *= 10n; }
    return { places, scale, values, integerDigits, width: integerDigits + places, modulus };
  }
  function fixed(value, layout, padded = true) {
    const negative = value < 0n;
    let text = (negative ? -value : value).toString().padStart((padded ? layout.integerDigits : 1) + layout.places, "0");
    if (layout.places) text = text.slice(0, -layout.places) + "." + text.slice(-layout.places);
    return (negative ? "-" : "") + text;
  }
  function addDigits(left, right, width) {
    const a = String(left).padStart(width, "0"), b = String(right).padStart(width, "0");
    if (a.length > width || b.length > width || left < 0n || right < 0n) throw new Error("BCD width overflow.");
    let carry = 0, digits = "";
    const corrections = [];
    for (let index = width - 1; index >= 0; index--) {
      const carryIn = carry;
      const raw = Number(a[index]) + Number(b[index]) + carryIn;
      const correction = raw > 9 ? 6 : 0;
      const corrected = raw + correction;
      carry = corrected > 15 ? 1 : 0;
      const digit = corrected % 16;
      digits = digit + digits;
      corrections.push({ place: width - index, left: bits(a[index]), right: bits(b[index]), carryIn,
        raw: raw.toString(2).padStart(4, "0"), correction: correction ? "0110" : "0000",
        digit: bits(digit), carryOut: carry });
    }
    return { value: BigInt(digits), carry: BigInt(carry), corrections };
  }
  function complement(value, layout, method) {
    // Digitwise 9's complement, then a corrected BCD +1 for the 10's complement.
    const nine = BigInt([...value.toString().padStart(layout.width, "0")].map(d => 9 - Number(d)).join(""));
    return method === "nines" ? nine : addDigits(nine, 1n, layout.width).value;
  }
  function signed(encoded, layout, method) {
    const limit = method === "tens" ? layout.modulus : layout.modulus - 1n;
    if (method === "nines" && encoded === limit) return 0n;
    return encoded > limit / 2n ? encoded - limit : encoded;
  }
  function calculate(layout, operation, method) {
    let encoded = layout.values[0];
    const steps = [];
    for (const operand of layout.values.slice(1)) {
      const previous = encoded;
      const added = operation === "subtract" ? complement(operand, layout, method) : operand;
      const addition = addDigits(previous, added, layout.width);
      encoded = addition.value;
      let endAround = null;
      if (method === "nines" && addition.carry) {
        endAround = addDigits(encoded, addition.carry, layout.width);
        encoded = endAround.value;
      }
      steps.push({ previous, operand, added, ...addition, endAround, encoded, signed: signed(encoded, layout, method) });
    }
    return { encoded, signed: signed(encoded, layout, method), steps };
  }
  function analyze(texts, operation) {
    if (!["add", "subtract"].includes(operation)) throw new Error("BCD supports addition and subtraction only.");
    const layout = layoutFor(texts);
    return { layout, inputs: layout.values.map(value => ({ value,
      nines: complement(value, layout, "nines"), tens: complement(value, layout, "tens") })),
      tens: calculate(layout, operation, "tens"), nines: calculate(layout, operation, "nines") };
  }
  return { encode, decode, groupEntry, layoutFor, fixed, addDigits, complement, analyze };
})();
if (typeof module !== "undefined" && module.exports) module.exports = BcdMath;
