import fs from "fs";
import path from "path";
import { getSettings } from "./getSettings.js";

const getHistoryFolder = () => path.join(getSettings().storagePath, "CUSTOM_ORDERS");

const todayStr = () => {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

const safeName = (str) => String(str ?? "UNKNOWN").replace(/[^a-zA-Z0-9_\- ]/g, "_");

export async function saveOrder(orderData) {
  const folder = getHistoryFolder();
  await fs.promises.mkdir(folder, { recursive: true });
  const fileName = `PO_${safeName(orderData.poNumber)}_${safeName(orderData.materialName)}_${todayStr()}.json`;
  await fs.promises.writeFile(
    path.join(folder, fileName),
    JSON.stringify(orderData, null, 2),
    "utf8"
  );
}

export async function getAllOrders() {
  const folder = getHistoryFolder();
  try {
    await fs.promises.access(folder);
  } catch {
    return [];
  }

  const entries = await fs.promises.readdir(folder, { withFileTypes: true });
  const orders = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const content = await fs.promises.readFile(path.join(folder, entry.name), "utf8");
      orders.push(JSON.parse(content));
    } catch {
      // skip corrupted files
    }
  }

  return orders.sort((a, b) => new Date(b.date) - new Date(a.date));
}
