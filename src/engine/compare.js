'use strict';
function compare(v, op, ref) {
  if (v === null || v === undefined) return false;
  switch (op) {
    case '>': return v > ref;
    case '<': return v < ref;
    case '>=': return v >= ref;
    case '<=': return v <= ref;
    case '==': return v === ref;
    case '!=': return v !== ref;
    default: throw new Error('Unknown operator ' + op);
  }
}
module.exports = { compare };
