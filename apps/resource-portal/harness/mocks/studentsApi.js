// Made-up students for the preview.
const names = [["Ava", "Nguyen", 9], ["Liam", "O'Connor", 10], ["Maya", "Haddad", 7], ["Noah", "Taylor", 12], ["Zoe", "Papadopoulos", 5], ["Ethan", "Kaur", 8]];
export async function listStudents() {
  return names.map(([firstName, lastName, year], index) => ({
    id: `student-${index + 1}`, firstName, lastName, displayName: `${firstName} ${lastName}`, grade: `Year ${year}`, studentYear: year, year,
  }));
}
