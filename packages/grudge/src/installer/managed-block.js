// OWNER: lane-c

export const MANAGED_BEGIN = "<!-- grudge:begin v1 -->";
export const MANAGED_END = "<!-- grudge:end -->";

export const INSTRUCTION_BLOCK = `${MANAGED_BEGIN}
## Grudge (mistake guard)
- A hook may block a tool call and cite a "scar". Do not retry the same call or work around it. Change approach, or ask the user if you think it is a false positive.
- When the user corrects a repeatable mistake, or something failed because of an action you should never repeat in this repo, record it once:
  \`node .grudge/bin/grudge.mjs propose --rule '<rule>' --why '<one sentence>'\`
- Rule forms: \`never call <tool> where <field> ~ "<text>"\`, \`must call <tool> before <tool>\`, \`never call <tool> where <field> tainted_by <tool>\`. Tools: read_file, write_file, shell, http. Run \`... propose --help\` for examples.
- One rule per correction. Never propose rules that block reading files or running tests. Do not edit \`.grudge/\`.
${MANAGED_END}`;

/** Return the versioned block, including its stable markers. */
export function managedBlock() {
  return INSTRUCTION_BLOCK;
}

/** Replace the existing Grudge block or append it without disturbing other text. */
export function upsertManagedBlock(text = "", block = INSTRUCTION_BLOCK) {
  const source = String(text);
  const start = source.indexOf(MANAGED_BEGIN);
  const end = source.indexOf(MANAGED_END, start + MANAGED_BEGIN.length);
  const begins = count(source, MANAGED_BEGIN);
  const ends = count(source, MANAGED_END);
  if (begins !== ends) throw new Error("cannot safely update malformed Grudge markers");
  if (start >= 0 && end >= 0) {
    const replaced = `${source.slice(0, start)}${block.trim()}${source.slice(end + MANAGED_END.length)}`;
    return ensureTrailingNewline(replaced);
  }
  const prefix = source.length === 0 || /(?:\r?\n)$/.test(source) ? source : `${source}\n`;
  return `${prefix}${block.trim()}\n`;
}

/** Remove only the bytes between the managed markers. */
export function removeManagedBlock(text = "") {
  const source = String(text);
  if (count(source, MANAGED_BEGIN) !== count(source, MANAGED_END)) return source;
  let clean = source;
  while (true) {
    const start = clean.indexOf(MANAGED_BEGIN);
    const end = clean.indexOf(MANAGED_END, start + MANAGED_BEGIN.length);
    if (start < 0 || end < 0) return clean;
    clean = `${clean.slice(0, start)}${clean.slice(end + MANAGED_END.length)}`;
  }
}

export function hasManagedBlock(text = "") {
  return String(text).includes(MANAGED_BEGIN) && String(text).includes(MANAGED_END);
}

function ensureTrailingNewline(text) {
  return text.endsWith("\n") ? text : `${text}\n`;
}

function count(source, marker) {
  return source.split(marker).length - 1;
}
