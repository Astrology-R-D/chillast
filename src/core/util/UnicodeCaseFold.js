'use strict';

const { CASE_FOLD_MAP } = require('./UnicodeCaseFoldData');

/** Apply Unicode 17.0.0 full default case folding (CaseFolding statuses C + F). */
function unicodeDefaultCaseFold(value) {
  let folded = '';
  for (const character of value) {
    const mapping = CASE_FOLD_MAP.get(character.codePointAt(0));
    folded += mapping ? String.fromCodePoint(...mapping) : character;
  }
  return folded;
}

module.exports = unicodeDefaultCaseFold;
