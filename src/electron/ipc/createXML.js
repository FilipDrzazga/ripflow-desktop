import { getRootPath } from "../helpers/getRootPath";
import path from "path";
import fs from "fs";

const STAGES = {
  INIT: "init",
  VALIDATE: "validate",
  BUILD_XML: "build_xml",
  WRITE_XML: "write_xml",
  DONE: "done",
};

const toXMLError = (error, stage) => {
  return {
    code: error.code || "UNKNOWN_ERROR",
    message: error.message || "An unknown error occurred.",
    stage: error.stage || stage || "unknown",
    type: error.type || "Error",
  };
};

const buildPFJobXML = (batch, createdBatchId) => {
  const ROOT_PATH = getRootPath();
  const PRINTED_ROOT_PATH = path.resolve(ROOT_PATH, "PRINTED");
  const BASE_FINAL_PATH = path.join(PRINTED_ROOT_PATH, createdBatchId.batchId);

  const xml = `
    <Job>
        <NestingGroup>TEXTILE_MAIN</NestingGroup>

        <UserData>
            <Item Key="BatchId" Value="${createdBatchId.batchId}" />
            <Item Key="Printer" Value="${batch[0]?.printer || ""}" />
            <Item Key="Source" Value="RipFlow" />
        </UserData>

        <Documents>
            ${batch
              .map((item) => {
                const sourcePath = path.resolve(item?.file?.fullPath || "");
                const fileName = path.basename(sourcePath);
                const finalPath = path.join(BASE_FINAL_PATH, fileName);
                return `<Document>
            <Path>${finalPath}</Path>
            <Name>${item?.file?.name}</Name>
            <Copies>${item.qty}</Copies>
            <DocumentId>${item.artworkId}</DocumentId>
                <UserData>
                    <Item Key="MaterialType" Value="${item.materialType}" />
                    <Item Key="OrderId" Value="${item.orderId}" />
                    <Item Key="PrintType" Value="${item.printType}" />
                    <Item Key="Printer" Value="${item.printer}" />
                    <Item Key="Size" Value="${item.variant}" />
                    <Item Key="OriginalSourcePath" Value="${sourcePath}" />
                </UserData>
            </Document>`;
              })
              .join("")}
        </Documents>
    </Job>`;
  return xml;
};

async function submitBatchToPrintFactory(batch, createdBatchId) {
  const result = {
    success: false,
    errors: [],
    finalXmlPath: null,
    batchId: createdBatchId.batchId,
  };
  // errors będzie zbierać wszystkie problemy walidacyjne i runtime errors
  //
  // przykład kategorii:
  // - VALIDATION_ERROR
  // - XML_BUILD_ERROR
  // - FILE_WRITE_ERROR
  // - FILE_RENAME_ERROR
  // TODO: sprawdź, czy batch istnieje
  // jeśli batch jest undefined / null:
  // - dodaj błąd do errors
  // - zwróć { success: false, errors }
  let stage = STAGES.INIT;
  try {
    stage = STAGES.VALIDATE;
    if (!Array.isArray(batch) || batch.length === 0) {
      throw Object.assign(new Error("Batch must be a non-empty array."), {
        code: "ERR_INVALID_ARG_TYPE",
        stage,
        title: "Invalid batch input",
      });
    }
    if (
      !createdBatchId ||
      !createdBatchId.batchId ||
      typeof createdBatchId.batchId !== "string" ||
      createdBatchId === ""
    ) {
      throw Object.assign(new Error("Invalid batch ID."), {
        code: "ERR_INVALID_BATCH_ID",
        stage,
        title: "Invalid batch ID",
      });
    }

    const ROOT_PATH = getRootPath();
    const AUTOMATION_WORKFLOW_PATH = path.resolve(ROOT_PATH, "AUTOMATION_WORKFLOW");

    try {
      await fs.promises.access(AUTOMATION_WORKFLOW_PATH, fs.constants.W_OK);
    } catch (err) {
      if (err.code === "ENOENT") {
        await fs.promises.mkdir(AUTOMATION_WORKFLOW_PATH, { recursive: true });
      }
    }

    stage = STAGES.BUILD_XML;
    const xml = buildPFJobXML(batch, createdBatchId);

    if (typeof xml !== "string" || xml.trim() === "") {
      throw Object.assign(new Error("Generated XML is empty or invalid."), {
        code: "ERR_INVALID_XML",
        stage,
        title: "XML generation failed",
      });
    }
  } catch (err) {
    console.log(err);
  }
  // TODO: przygotuj bezpieczną nazwę pliku xml
  // np. na bazie batchId:
  // - job-${batchId}.xml
  //
  // pamiętaj:
  // batchId może mieć znaki, które warto oczyścić,
  // jeśli istnieje ryzyko slashy, spacji, dziwnych znaków itd.
  // TODO: wylicz pełne ścieżki:
  // - finalXmlPath
  // - tempXmlPath
  //
  // np.:
  // temp = path.join(hotfolderPath, `${safeFileName}.tmp`)
  // final = path.join(hotfolderPath, `${safeFileName}.xml`)
  // TODO: upewnij się, że folder hotfolderPath istnieje
  // jeśli nie:
  // - utwórz go albo zwróć błąd
  //
  // decyzja architektoniczna:
  // możesz automatycznie tworzyć folder
  // albo wymagać, żeby istniał wcześniej
  //
  // na start często wygodniej:
  // fs.mkdir(..., { recursive: true })
  // TODO: zapisz xml do pliku tymczasowego
  // użyj writeFile(tempXmlPath, xml, "utf8")
  //
  // jeśli zapis się nie uda:
  // - złap wyjątek
  // - zwróć FILE_WRITE_ERROR
  // TODO: po zapisie wykonaj rename temp -> final
  // to jest właściwy moment "publikacji" ticketu
  //
  // jeśli rename się nie uda:
  // - spróbuj ewentualnie usunąć temp file
  // - zwróć FILE_RENAME_ERROR
  // TODO: opcjonalnie zapisz log lokalny / manifest / audit entry
  // np. że batch został wysłany do PrintFactory
  // ale to jest dodatkowy etap, nie wymagany w MVP
  // TODO: zwróć success result
  // wynik powinien być spójny z resztą twojego API
  // np.:
  // {
  //   success: true,
  //   batchId,
  //   ticketPath: finalXmlPath,
  //   fileName: `${safeFileName}.xml`
  // }
}

// artworkId:"XWD8fa1167cc3f34fc28f9f0f38de8171be"
// createdAt: Mon Mar 09 2026 20:40:48 GMT+0000 (Greenwich Mean Time) {}
// customerName:"SCI Burgundy"
// detectedAt:"2026-03-09T20:45:42.510Z"
// diffDays:1
// errors:[]
// ff:true
// file:
//     dir:"C:\\SPPrintReadyArtwork\\Eco Chiffon"
//     ext:"pdf"
//     fullPath:"C:\\SPPrintReadyArtwork\\Eco Chiffon\\ON311443_SCI_Burgundy_1of10_Eco Chiffon_1x_Linear Meter - 1m increments_XWD8fa1167cc3f34fc28f9f0f38de8171be_FF.pdf"
//     name:"ON311443_SCI_Burgundy_1of10_Eco Chiffon_1x_Linear Meter - 1m increments_XWD8fa1167cc3f34fc28f9f0f38de8171be_FF.pdf"
// [[Prototype]]:Object
// id:"Eco Chiffon_ON311443_SCI_Burgundy_1of10_Eco Chiffon_1x_Linear Meter - 1m increments_XWD8fa1167cc3f34fc28f9f0f38de8171be_FF.pdf"
// internalId:null
// material:"Eco Chiffon"
// materialType:"Polyesters"
// orderId:"ON311443"
// printGroup:"Eco Chiffon"
// printType:"Linear Meter"
// printTypeCode:"LM"
// printer:"YUMI"
// productName:null
// qty:1
// size:null
// status:"READY"
// tokens:(9) ['ON311443', 'SCI', 'Burgundy', '1of10', 'Eco Chiffon', '1x', 'Linear Meter - 1m increments', 'XWD8fa1167cc3f34fc28f9f0f38de8171be', 'FF']
// variant:"1m increments"
// warnings:[]
// x:1
// xOfY:"1of10"
// y:10
