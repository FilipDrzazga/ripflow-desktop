// The Print view's filter panel (one "Filter" button: sort + print types, FILIP 2026-10-14).
//
// matchesTabAndSearch is THE tab + search condition: the store's applyFilters filters with it and
// countByPrintType counts with it, so a type chip's count is exactly what the list shows once that
// type is picked - never a second copy of the search rule.

export const SORT_ORDER = { METERS_DESC: "meters_desc", DATE_ASC: "date_asc" };

export const matchesTabAndSearch = (item, activeTab, query) => {
  if (activeTab !== "All" && item.materialType !== activeTab) return false;
  if (!query) return true;
  return Boolean(
    item.orderId?.toLowerCase().includes(query) ||
      item.customerName?.toLowerCase().includes(query) ||
      item.material?.toLowerCase().includes(query),
  );
};

// How many files of each print type the current tab + search hold, the type filter itself left
// out (the count says what picking the chip would show). { [printTypeCode]: n }
export const countByPrintType = (files, activeTab, searchQuery) => {
  const query = (searchQuery ?? "").trim().toLowerCase();
  const counts = {};
  for (const group of files ?? []) {
    for (const item of group.items ?? []) {
      if (!matchesTabAndSearch(item, activeTab, query)) continue;
      counts[item.printTypeCode] = (counts[item.printTypeCode] ?? 0) + 1;
    }
  }
  return counts;
};

// The number on the Filter button: each picked type plus the sort when one is on.
export const activeFilterCount = (printTypeFilter, sortOrder) =>
  printTypeFilter.length + (sortOrder ? 1 : 0);
