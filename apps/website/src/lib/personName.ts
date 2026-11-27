// Tidies a person's name typed into a public form before it is stored.
//
// Names typed entirely in capitals ("MIA CHAN") or entirely in lower case
// ("mia chan") are put into title case, including after hyphens and
// apostrophes ("MARY-JANE O'BRIEN" -> "Mary-Jane O'Brien"). A name with any
// mixed case is left as typed, because the family has chosen its casing
// ("McDonald", "van der Berg", "DeSouza"). Runs of whitespace collapse to one
// space either way.
export const normalisePersonName = (value: string) => {
  const name = value.trim().replace(/\s+/g, " ");
  const isAllUpper = name === name.toUpperCase();
  const isAllLower = name === name.toLowerCase();
  if (!isAllUpper && !isAllLower) return name;

  return name
    .toLowerCase()
    .replace(/(^|[\s\-'’])(\p{L})/gu, (_, before, letter) => before + letter.toUpperCase());
};
