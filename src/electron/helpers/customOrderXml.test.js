import { describe, it, expect } from "vitest";
import path from "path";
import { buildCustomOrderXML } from "./customOrderXml.js";

// ETAP 2d-1: the first baseline for the custom-order XML (hole (b) of the Etap 2 gate).
// The expected text is written out in full on purpose - it is the contract PrintFactory
// reads, and 2d-4 (the folder from the shop profile) must leave it byte for byte the same.
// Paths go through path.join like the builder does, so the test holds on any OS.

const FOLDER = "C:\\Minerva\\Artwork";
const NESTING = "11111111-2222-4333-8444-555555555555";

const group = {
  poNumber: "PO<7>&'x\"",
  materialName: "Silky Satin & Co",
  printer: "YOKO",
  files: [
    { fileName: "art_one", found: true, metersToprint: 1.25 },
    { fileName: "art_missing", found: false, metersToprint: 9 },
    { fileName: "art<two>", found: true, metersToprint: 0.3336 },
  ],
};

const expected = `<RipFlowJob>
  <BatchId>CUSTOM_ORDER_PO_7___x__20260924_abcd1234</BatchId>
  <Printer>YOKO</Printer>
  <BatchType>CUSTOM_ORDER</BatchType>
  <PONumber>PO&lt;7&gt;&amp;&apos;x&quot;</PONumber>
  <NestingGroup>${NESTING}</NestingGroup>
  <LogisticGroup>${NESTING}_1.6m</LogisticGroup>
  <PhysicalGroup>Min_Silky Satin &amp; Co_1.6m_POPO&lt;7&gt;&amp;&apos;x&quot;</PhysicalGroup>
  <Documents>
    <Document>
      <Path>${path.join(FOLDER, "art_one.tif")}</Path>
      <Name>art_one</Name>
      <Copies>1</Copies>
      <DocumentId>art_one</DocumentId>
      <Width>1420</Width>
      <Height>1250</Height>
      <Material>Silky Satin &amp; Co</Material>
      <MaterialType>Polyesters</MaterialType>
      <OrderId>PO&lt;7&gt;&amp;&apos;x&quot;</OrderId>
      <PrintTypeCode>LM</PrintTypeCode>
      <IsVelvet>false</IsVelvet>
      <IsLinen>false</IsLinen>
      <IsBlossom>false</IsBlossom>
    </Document>
    <Document>
      <Path>${path.join(FOLDER, "art&lt;two&gt;.tif")}</Path>
      <Name>art&lt;two&gt;</Name>
      <Copies>1</Copies>
      <DocumentId>art&lt;two&gt;</DocumentId>
      <Width>1420</Width>
      <Height>334</Height>
      <Material>Silky Satin &amp; Co</Material>
      <MaterialType>Polyesters</MaterialType>
      <OrderId>PO&lt;7&gt;&amp;&apos;x&quot;</OrderId>
      <PrintTypeCode>LM</PrintTypeCode>
      <IsVelvet>false</IsVelvet>
      <IsLinen>false</IsLinen>
      <IsBlossom>false</IsBlossom>
    </Document>
  </Documents>
</RipFlowJob>`;

describe("buildCustomOrderXML (custom-order XML baseline, ETAP 2d-1)", () => {
  it("renders the full job byte for byte: only found files, escaped values, metres to 0.1", () => {
    const xml = buildCustomOrderXML(group, "CUSTOM_ORDER_PO_7___x__20260924_abcd1234", {
      customOrderFolderPath: FOLDER,
      nestingId: NESTING,
    });
    expect(xml).toBe(expected);
  });

  it("an order with no found file still renders the frame, with 0.0 m and no documents", () => {
    const xml = buildCustomOrderXML(
      { poNumber: "P1", materialName: "M", printer: "YUMI", files: [{ fileName: "a", found: false, metersToprint: 2 }] },
      "B1",
      { customOrderFolderPath: FOLDER, nestingId: NESTING },
    );
    expect(xml).toContain(`<LogisticGroup>${NESTING}_0.0m</LogisticGroup>`);
    expect(xml).toContain("  <Documents>\n\n  </Documents>");
    expect(xml).not.toContain("<Document>");
  });
});
