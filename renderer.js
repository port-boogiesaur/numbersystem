"use strict";

(() => {
  const state = {
    stage: "count",
    countSelection: "",
    inputCount: 0,
    selectedBase: null,
    currentValue: "",
    inputs: [],
    selectedOperation: null,
    finalResult: null,
    message: ""
  };

  const baseNames = { 2: "BIN", 8: "OCT", 10: "DEC", 16: "HEX" };
  const baseDigits = { 2: "01", 8: "01234567", 10: "0123456789", 16: "0123456789ABCDEF" };
  const operations = {
    add: { name: "Addition", symbol: "+" },
    subtract: { name: "Subtraction", symbol: "\u2212" },
    multiply: { name: "Multiplication", symbol: "\u00d7" },
    divide: { name: "Division", symbol: "\u00f7" }
  };
  const calculator = document.querySelector(".calculator");
  const display = document.querySelector("#display");
  const buttons = [...calculator.querySelectorAll("button")];

  function greatestCommonDivisor(a, b) {
    a = a < 0n ? -a : a;
    b = b < 0n ? -b : b;
    while (b !== 0n) [a, b] = [b, a % b];
    return a;
  }

  function reduceFraction(numerator, denominator) {
    if (denominator === 0n) throw new Error("Cannot divide by zero.");
    if (denominator < 0n) { numerator = -numerator; denominator = -denominator; }
    const divisor = greatestCommonDivisor(numerator, denominator);
    return { numerator: numerator / divisor, denominator: denominator / divisor };
  }

  // Fold from left to right so subtraction and division follow input order.
  // Only exact BigInt fractions participate; displayed conversions are never reused.
  function calculateInputs(inputs, operation) {
    if (!operations[operation] || !inputs.length) throw new Error("Select an operation first.");
    if (operation === "divide" && inputs.slice(1).some(input => input.exactValue.numerator === 0n)) {
      throw new Error("Cannot divide by zero.");
    }
    return inputs.slice(1).reduce((left, input) => {
      const { numerator: a, denominator: b } = left;
      const { numerator: c, denominator: d } = input.exactValue;
      switch (operation) {
        case "add": return reduceFraction(a * d + c * b, b * d);
        case "subtract": return reduceFraction(a * d - c * b, b * d);
        case "multiply": return reduceFraction(a * c, b * d);
        case "divide": return reduceFraction(a * d, b * c);
      }
    }, inputs[0].exactValue);
  }

  function formatExpression(inputs, operation) {
    return inputs.map(input => `(${input.originalText} ${baseNames[input.originalBase]})`)
      .join(` ${operations[operation].symbol} `);
  }

  // Read each digit in its original base. BigInt arithmetic keeps every digit
  // exact, even when the integer is larger than JavaScript's safe Number range.
  function parseWholeNumber(originalText, originalBase) {
    const digits = baseDigits[originalBase];
    if (!digits || !originalText) throw new Error("A base and non-empty number are required.");
    let decimalValue = 0n;
    const radix = BigInt(originalBase);
    for (const character of originalText) {
      if (!digits.includes(character)) throw new Error("Invalid digit for the selected base.");
      const digitValue = BigInt("0123456789ABCDEF".indexOf(character));
      decimalValue = decimalValue * radix + digitValue;
    }
    return decimalValue;
  }

  // A fraction is stored exactly as numerator / denominator, never as a float.
  function parseBaseNumber(originalText, originalBase) {
    const parts = originalText.split(".");
    if (parts.length > 2 || !parts.join("")) throw new Error("Enter a number.");
    const fraction = parts[1] || "";
    const denominator = BigInt(originalBase) ** BigInt(fraction.length);
    const numerator = parseWholeNumber(parts.join(""), originalBase);
    return reduceFraction(numerator, denominator);
  }

  const MAX_FRACTION_DIGITS = 8;

  function formatInBase({ numerator, denominator }, base) {
    const radix = BigInt(base);
    const sign = numerator < 0n ? "-" : "";
    numerator = numerator < 0n ? -numerator : numerator;
    let result = sign + (numerator / denominator).toString(base).toUpperCase();
    let remainder = numerator % denominator;
    if (remainder === 0n) return result;
    result += ".";
    // Long division generates at most eight fractional digits. A remaining
    // remainder means the expansion continues; the ellipsis marks truncation.
    for (let i = 0; i < MAX_FRACTION_DIGITS && remainder !== 0n; i++) {
      remainder *= radix;
      result += (remainder / denominator).toString(base).toUpperCase();
      remainder %= denominator;
    }
    return result + (remainder === 0n ? "" : "\u2026");
  }

  function convertToAllBases(exactValue) {
    return {
      binary: formatInBase(exactValue, 2),
      octal: formatInBase(exactValue, 8),
      decimal: formatInBase(exactValue, 10),
      hexadecimal: formatInBase(exactValue, 16)
    };
  }

  function createInputResult(originalText, originalBase) {
    const exactValue = parseBaseNumber(originalText, originalBase);
    // Keep the user's text (including leading zeros) alongside normalized results.
    return { originalText, originalBase, exactValue,
      conversions: convertToAllBases(exactValue) };
  }

  // Save a screen before confirming it, including exact BigInt values.
  // Going back restores that editable screen and discards later confirmations.
  const history = [];

  function goBack() {
    if (history.length) Object.assign(state, history.pop());
    else if (state.stage === "count") state.countSelection = "";
    state.message = "";
    state.finalResult = null;
  }

  function acceptsValue(value) {
    if (state.stage === "count") return /^[3-9]$/.test(value);
    if (value === ".") return state.stage === "input" &&
      state.selectedBase !== null && !state.currentValue.includes(".");
    return state.stage === "input" && state.selectedBase !== null &&
      value.length === 1 && baseDigits[state.selectedBase].includes(value);
  }

  function line(text, className) {
    const element = document.createElement("span");
    element.className = className;
    element.textContent = text;
    // Explain the precision marker on hover without cluttering the display.
    if (text.includes("\u2026")) element.title = "Truncated to 8 fractional digits.";
    return element;
  }

  function complementPanel(showSubtraction) {
    const panel = document.createElement("details");
    panel.className = "complement-panel";
    const heading = document.createElement("summary");
    heading.textContent = showSubtraction ? "Complement subtraction" : "Complements";
    panel.append(heading);
    for (const base of ComplementMath.bases) {
      const report = ComplementMath.analyze(state.inputs, base);
      const { layout } = report;
      const fixed = value => ComplementMath.formatFixed(value, layout);
      const group = document.createElement("details");
      const title = document.createElement("summary");
      title.textContent = `${ComplementMath.names[base]}: ${base}'s / ${base - 1}'s`;
      group.append(title);
      const add = text => group.append(line(text, "complement-line"));
      const width = line(`Width: ${layout.integerDigits} + ${layout.places} frac`, "complement-line");
      width.title = "Shared integer and fractional digit counts, including leading zeros.";
      group.append(width);
      if (layout.approximate) {
        const note = line("Approx. (8 fractional digits)", "complement-line");
        note.title = "Complement operands are truncated. The main calculation remains exact.";
        group.append(note);
      }
      if (!showSubtraction) {
        report.inputs.forEach((input, index) => {
          add(`Input ${index + 1}: ${fixed(input.value)}`);
          add(`${base}'s: ${fixed(input.radix)}`);
          add(`${base - 1}'s: ${fixed(input.diminished)}`);
        });
      } else {
        for (const [method, name] of [["radix", `${base}'s`], ["diminished", `${base - 1}'s`]]) {
          add(`${name}: ${fixed(report[method].signed)}`);
          const steps = document.createElement("details");
          const label = document.createElement("summary");
          label.textContent = `${name} steps`;
          steps.append(label);
          const detail = text => steps.append(line(text, "complement-line"));
          report[method].steps.forEach((step, index) => {
            detail(`Step ${index + 1}`);
            detail(`${fixed(step.previous)} + ${fixed(step.added)} = ${fixed(step.sum)}`);
            detail(step.carry ? (method === "radix" ? "Discard carry: 1" : "End-around carry: +1 least place") : "No carry");
            detail(`Encoded: ${fixed(step.encoded)}`);
            detail(`Signed: ${fixed(step.signed)}`);
          });
          group.append(steps);
        }
      }
      panel.append(group);
    }
    return panel;
  }

  function render() {
    const lines = [];
    if (state.stage === "count") {
      lines.push(line("How many input numbers?", "display-title"));
      lines.push(line("Enter 3 to 9", "display-hint"));
      if (state.countSelection) lines.push(line(state.countSelection, "display-value"));
    } else if (state.stage === "input") {
      lines.push(line(`Input ${state.inputs.length + 1} of ${state.inputCount}`, "display-title"));
      lines.push(line(state.selectedBase === null ? "Select BIN, OCT, DEC, or HEX" :
        `${baseNames[state.selectedBase]}`, "display-hint"));
      if (state.currentValue) lines.push(line(state.currentValue, "display-value"));
    } else if (state.stage === "results") {
      lines.push(line("Conversions", "display-title"));
      lines.push(line("= Continue", "display-hint"));
      state.inputs.forEach((input, index) => {
        lines.push(line(`Input ${index + 1}: ${input.originalText} (${baseNames[input.originalBase]})`, "result-heading"));
        const { binary, octal, decimal, hexadecimal } = input.conversions;
        for (const text of [`BIN: ${binary}`, `OCT: ${octal}`, `DEC: ${decimal}`, `HEX: ${hexadecimal}`]) {
          lines.push(line(text, "display-summary"));
        }
      });
      lines.push(complementPanel(false));
    } else if (state.stage === "operation") {
      lines.push(line("Select an arithmetic operation", "display-title"));
      lines.push(line("+, \u2212, \u00d7, or \u00f7", "display-hint"));
      if (state.selectedOperation) lines.push(line(`${operations[state.selectedOperation].name}  =`, "display-hint"));
    } else if (state.stage === "final" || state.stage === "error") {
      lines.push(line("Expression:", "display-title"));
      lines.push(line(formatExpression(state.inputs, state.selectedOperation), "display-summary"));
      if (state.stage === "error") {
        lines.push(line("Cannot divide by zero.", "display-title"));
      } else {
        lines.push(line("Result", "display-title"));
        const { binary, octal, decimal, hexadecimal } = convertToAllBases(state.finalResult);
        for (const text of [`BIN: ${binary}`, `OCT: ${octal}`, `DEC: ${decimal}`, `HEX: ${hexadecimal}`]) {
          lines.push(line(text, "display-summary"));
        }
        if (state.selectedOperation === "subtract") lines.push(complementPanel(true));
      }
    }
    if (state.message) lines.push(line(state.message, "display-hint"));
    display.replaceChildren(...lines);
    display.scrollTop = 0;

    for (const button of buttons) {
      const { value, base, action, operation } = button.dataset;
      if (value !== undefined) button.disabled = !acceptsValue(value);
      else if (base !== undefined) {
        button.disabled = state.stage !== "input";
        button.setAttribute("aria-pressed", String(Number(base) === state.selectedBase));
      } else if (operation) {
        button.disabled = state.stage !== "operation";
        button.setAttribute("aria-pressed", String(state.stage === "operation" && operation === state.selectedOperation));
      } else {
        const availableActions = {
          count: ["clear", "backspace", "equals"],
          input: ["clear", "backspace", "equals"],
          results: ["clear", "equals"],
          operation: state.selectedOperation ? ["clear", "backspace", "equals"] : ["clear", "backspace"],
          final: ["clear", "backspace"],
          error: ["clear", "backspace"]
        };
        button.disabled = !availableActions[state.stage].includes(action);
      }
      if (action === "equals") button.setAttribute("aria-label",
        state.stage === "results" ? "Continue" :
        state.stage === "operation" ? "Calculate" : "Confirm input");
      if (action === "clear") {
        button.setAttribute("aria-label", "Go back");
        button.title = "Go back";
      }
      if (action === "backspace") button.setAttribute("aria-label",
        ["final", "error"].includes(state.stage) ? "Return to operation selection" :
        state.stage === "operation" ? "Clear operation selection" : "Backspace");
    }
  }

  function confirm() {
    if (state.stage === "count") {
      if (!state.countSelection) {
        state.message = "Choose 3 to 9 before pressing =.";
        return;
      }
      state.inputCount = Number(state.countSelection);
      state.stage = "input";
    } else if (state.stage === "input") {
      if (state.selectedBase === null || !state.currentValue || state.currentValue === ".") {
        state.message = state.selectedBase === null ? "Select a base first." : "Enter a number before pressing =.";
        return;
      }
      state.inputs.push(createInputResult(state.currentValue, state.selectedBase));
      state.currentValue = "";
      state.selectedBase = null;
      if (state.inputs.length === state.inputCount) state.stage = "results";
    } else if (state.stage === "results") {
      state.stage = "operation";
    } else if (state.stage === "operation" && state.selectedOperation) {
      try {
        state.finalResult = calculateInputs(state.inputs, state.selectedOperation);
        state.stage = "final";
      } catch (error) {
        if (error.message !== "Cannot divide by zero.") throw error;
        state.finalResult = null;
        state.stage = "error";
      }

    }
  }

  calculator.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button || !calculator.contains(button) || button.disabled) return;
    const { value, base, action, operation } = button.dataset;
    state.message = "";

    if (value !== undefined && acceptsValue(value)) {
      if (state.stage === "count") state.countSelection = value;
      else if (value === "." && !state.currentValue) state.currentValue = "0.";
      else state.currentValue += value;
    } else if (base !== undefined && state.stage === "input") {
      state.selectedBase = Number(base);
      // Keep compatible text verbatim; never retain invalid digits after a base change.
      if (![...state.currentValue].every(character => character === "." || acceptsValue(character))) {
        state.currentValue = "";
        state.message = "Number cleared: its digits do not fit this base.";
      }
    } else if (operation && state.stage === "operation") {
      state.selectedOperation = operation;
      state.finalResult = null;
    } else if (action === "clear") {
      goBack();
    } else if (action === "backspace") {
      if (state.stage === "count") state.countSelection = "";
      else if (state.stage === "input") state.currentValue = state.currentValue.slice(0, -1);
      else if (state.stage === "final" || state.stage === "error") {
        goBack();
        state.selectedOperation = null;
      } else if (state.stage === "operation") state.selectedOperation = null;
    } else if (action === "equals") {
      const previous = structuredClone(state);
      confirm();
      // Invalid confirmations stay on the same screen and do not add history.
      if (state.stage !== previous.stage || state.inputs.length !== previous.inputs.length) {
        history.push(previous);
      }
    }
    render();
  });

  render();
})();
