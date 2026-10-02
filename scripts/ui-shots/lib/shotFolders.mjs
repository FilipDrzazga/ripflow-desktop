// Catalogue id prefix -> the folder a shot goes to (the designer's pack is organised by view).
const FOLDERS = {
  GL: "global",
  PR: "print",
  BH: "batch",
  PD: "production",
  RL: "production-roles",
  CO: "custom-orders",
  AN: "analytics",
  LG: "logs",
  ST: "settings",
  WZ: "wizard",
};

export const folderOf = (id) => {
  const folder = FOLDERS[id.slice(0, 2)];
  if (!folder) throw new Error(`no folder for shot id ${id}`);
  return folder;
};
