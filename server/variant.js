// Single source of truth for variant derivation. Mirrored byte-for-byte in
// client/src/state/variant.js — keep both in sync (§5). Unused while every
// case ships with exactly one variant (see build spec §2.2) — index.js
// resolves the single variant directly instead of calling this — kept for
// parity in case a later phase reintroduces multi-variant halt cases.
function getVariant(rollNumber) {
  const digits = String(rollNumber).replace(/\D/g, '');
  let n;
  if (digits.length > 0) {
    n = parseInt(digits, 10);
  } else {
    n = 0;
    for (let i = 0; i < String(rollNumber).length; i++) {
      n += rollNumber.charCodeAt(i);
    }
  }
  return (n % 3) + 1;
}

module.exports = { getVariant };
