export const getFabricGlobals = () => window.api.getFabricGlobals();
export const setFabricGlobals = (globals) => window.api.setFabricGlobals(globals);
export const getFabrics = () => window.api.getFabrics();
export const saveFabric = (oldName, fabric) => window.api.saveFabric(oldName, fabric);
export const deleteFabric = (name) => window.api.deleteFabric(name);
export const setAllFabrics = (fabrics) => window.api.setAllFabrics(fabrics);
