export const classSlotLimits = (year: string, subjects: readonly string[]) => {
  const combinedPrimary =
    (year === "Year 5" || year === "Year 6") &&
    subjects.length === 2 &&
    subjects.includes("Maths") &&
    subjects.includes("English");

  return { min: combinedPrimary ? 1 : subjects.length, max: subjects.length };
};

export const hasValidClassSelection = (
  year: string,
  subjects: readonly string[],
  classes: readonly { id: string }[]
) => {
  const { min, max } = classSlotLimits(year, subjects);
  return (
    subjects.length > 0 &&
    classes.length >= min &&
    classes.length <= max &&
    new Set(classes.map((slot) => slot.id)).size === classes.length
  );
};
