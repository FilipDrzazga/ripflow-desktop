// The search of the app's Select (components/Select, `searchable`): which options a typed text leaves.
// Every word of the text must appear in the label, in any order, ignoring case and extra spaces - "eco lycra"
// finds "Recycled Eco Lycra" and "Eco Dynamica Lycra". Nothing typed leaves every option.

export const searchWords = (query) =>
  String(query ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

export const filterOptions = (options, query) => {
  const words = searchWords(query);
  if (words.length === 0) return options;
  return options.filter((option) => {
    const label = String(option.label ?? "").toLowerCase();
    return words.every((word) => label.includes(word));
  });
};
