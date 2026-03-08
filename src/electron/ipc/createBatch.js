import fs from "fs";
import path from "path";
import { createBatchIds } from "../helpers/createBatchIds.js";
import { getRootPath } from "../helpers/getRootPath.js";

export const createBatch = async (batch) => {
  /*
  ==========================================
  SECTION A — RESULT OBJECT / STATE
  ==========================================

  - przygotuj obiekt result który funkcja zwróci
  - success
  - errors
  - warnings
  - movedFiles
  - skippedFiles
  - rollbackPerformed

  - przygotuj zmienne pomocnicze:
      lockHandle
      copiedFiles
      deletedSourceFiles
      createdDirectories
  */

  const STAGES = {
    INIT: "init",
    VALIDATE: "validate",
    LOCK_CHECK: "lock_check",
    LOCK: "lock",
    DESTINATION_STRUCTURE: "destination_structure",
    CREATE_TEMP: "create_temp",
    COPY: "copy",
    VERIFY: "verify",
    DELETE_SOURCE: "delete_source",
    COMMIT: "commit",
    DONE: "done",
  };
  const result = {
    success: false,
    errors: [],
    movedFiles: [],
    skippedFiles: [],
    rollbackPerformed: false,
    batchId: null,
  };

  let stage = STAGES.INIT;

  let lockHandle = null;
  // let copiedFiles = false;
  // let deletedSourceFiles = false;
  // let createdDirectories = false;

  /*
  ==========================================
  SECTION B — INPUT VALIDATION
  ==========================================

  Sprawdź:
  - czy batchInput istnieje
  - czy batchInput jest arrayem
  - czy batchInput nie jest pusty

  Przykłady wymaganych pól:
  - batchId
  - sourceFiles / sourceFolders
  - printedRoot
  - targetSubfolder

  Możliwe błędy:
  - ERR_INVALID_ARG_TYPE
  - EINVAL
  */

  stage = STAGES.VALIDATE;
  if (!batch || batch.length === 0 || !Array.isArray(batch)) {
    throw Object.assign(new Error("Invalid batch input: Batch must be a non-empty array."), {
      code: "ERR_INVALID_ARG_TYPE",
      stage,
      type: "Error",
      title: "Invalid batch input",
      message: "Batch input must be a non-empty array.",
    });
    // moze napisac ogolny error handling i mapowanie errorow w osobnej funkcji zeby nie duplikowac kodu?
  }

  /*
  ==========================================
  SECTION C — PATH NORMALIZATION
  ==========================================

  - użyj path.resolve / path.normalize
  - upewnij się że wszystkie ścieżki są absolutne
  - zabezpiecz się przed path traversal (../)

  Wylicz wszystkie ścieżki które będą potrzebne:

  - printedRootPath
  - batchFolderPath
  - tempBatchFolderPath
  - targetSubfolderPath
  - lockPath
  - manifestPath

  Możliwe błędy:
  - ENAMETOOLONG
  - EINVAL
  */

  const ROOT_PATH = getRootPath();
  const SOURCE_FOLDER_PATHS = [...new Set(batch.map((item) => path.resolve(item.file.dir)))];
  const PRINTED_ROOT_PATH = path.join(ROOT_PATH, "PRINTED");
  const BATCH_FOLDER_PATH = path.join(
    PRINTED_ROOT_PATH,
    createBatchIds(batch).mainFolder,
    createBatchIds(batch).subFolder,
  );

  try {
    stage = STAGES.VALIDATE;
    /*
    ==========================================
    SECTION D — SOURCE FILE VALIDATION
    ==========================================

    Sprawdź:
    - czy każdy source file istnieje
    - czy jest plikiem (nie folderem)
    - czy nie jest 0 bytes (opcjonalnie)

    Możliwe błędy:
    - ENOENT
    - ENOTDIR
    - EISDIR
    */

    stage = STAGES.VALIDATE;

    for (const item of batch) {
      const sourcePath = path.resolve(item.file.fullPath);

      let stat;

      try {
        stat = await fs.stat(sourcePath);
      } catch (err) {
        if (err.code === "ENOENT") {
          throw Object.assign(new Error(`Source file does not exist: ${sourcePath}`), {
            code: "ENOENT",
            stage,
            type: "Error",
            title: "Invalid source file",
            message: `Source file does not exist: ${sourcePath}`,
          });
        }

        throw err;
      }

      if (!stat.isFile()) {
        throw Object.assign(new Error(`Source path is not a file: ${sourcePath}`), {
          code: "EISDIR",
          stage,
          type: "Error",
          title: "Invalid source file",
          message: `Source path is not a file: ${sourcePath}`,
        });
      }
    }

    /*
    ==========================================
    SECTION E — LOCK CHECK
    ==========================================

    Sprawdź:
    - czy w folderach źródłowych nie ma już .lock
    - czy w folderze docelowym nie ma .lock

    Jeżeli lock istnieje:
    - przerwij operację

    Możliwe błędy / sytuacje:
    - EEXIST
    */
    stage = STAGES.LOCK_CHECK;
    for (const folderPath of SOURCE_FOLDER_PATHS) {
      let lock = false;
      const lockPath = path.join(folderPath, ".lock");

      try {
        lock = await fs.promises.access(lockPath, fs.constants.F_OK);
        if (lock) {
          lock = true;
          throw Object.assign(new Error(`Lock file exists in source folder: ${folderPath}`), {
            code: "EEXIST",
            stage,
            type: "Error",
            title: "Source folder locked",
            message: `Lock file exists in source folder: ${folderPath}`,
          });
        }
      } catch (err) {
        if (err.code === "ENOENT") {
          lock = false;
          continue;
        }
        throw err;
      }
    }

    /*
    ==========================================
    SECTION F — ACQUIRE LOCK (ATOMIC)
    ==========================================

    Spróbuj stworzyć lock:

    fs.open(lockPath, "wx")

    Jeżeli już istnieje:
    - EEXIST

    Opcjonalnie zapisz w locku:
    - pid
    - batchId
    - timestamp

    Możliwe błędy:
    - EEXIST
    - EACCES
    - EPERM
    */
    stage = STAGES.LOCK;
    for (const folderPath of SOURCE_FOLDER_PATHS) {
      const lockPath = path.join(folderPath, ".lock");
      try {
        lockHandle = await fs.promises.open(lockPath, "wx");
        await lockHandle.write(
          JSON.stringify({
            pid: process.pid,
            batchId: createBatchIds(batch).mainFolder,
            timestamp: new Date().toISOString(),
          }),
        );
        // lockHandle = handle; // moze trzeba bedzie trzymac wszystkie uchwyty do lockow zeby je potem zamknac?
      } catch (err) {
        if (err.code === "EEXIST") {
          throw Object.assign(new Error(`Lock file already exists: ${lockPath}`), {
            code: "EEXIST",
            stage,
            type: "Error",
            title: "Source folder locked",
            message: `Lock file already exists: ${lockPath}`,
          });
        }
        throw err;
      }
    }

    /*
    ==========================================
    SECTION G — DESTINATION STRUCTURE
    ==========================================

    Sprawdź czy printedRoot istnieje
    jeśli nie -> mkdir

    Sprawdź czy batch folder istnieje
    jeśli tak -> zdecyduj co zrobić:
      - fail
      - prefix
      - nowy batchId

    Możliwe błędy:
    - ENOENT
    - EACCES
    - EPERM
    - EROFS
    - ENOSPC
    */
    stage = STAGES.DESTINATION_STRUCTURE;
    await fs.promises.mkdir(PRINTED_ROOT_PATH, { recursive: true });
    try {
      await fs.promises.access(BATCH_FOLDER_PATH, fs.constants.F_OK);
    } catch (err) {
      if (err.code === "ENOENT") {
        await fs.promises.mkdir(BATCH_FOLDER_PATH, { recursive: true });
      }
      if (err.code === "EEXIST") {
        const dirname = path.dirname(PRINTED_ROOT_PATH);
        const basename = path.basename(BATCH_FOLDER_PATH);
        const newBatchFolderPath = path.join(dirname, `${basename}_${crypto.randomUUID()}`);
        await fs.promises.mkdir(newBatchFolderPath, { recursive: true });
        return;
      }
      if (err.code === "EROFS") {
        throw Object.assign(new Error(`Destination is read-only: ${BATCH_FOLDER_PATH}`), {
          code: "EROFS",
          stage,
          type: "Error",
          title: "Destination is read-only",
          message: `Destination is read-only: ${BATCH_FOLDER_PATH}`,
        });
      }
      if (err.code === "ENOSPC") {
        throw Object.assign(new Error(`No space left on device to create batch folder: ${BATCH_FOLDER_PATH}`), {
          code: "ENOSPC",
          stage,
          type: "Error",
          title: "No space left on device",
          message: `No space left on device to create batch folder: ${BATCH_FOLDER_PATH}`,
        });
      }
      if (err.code === "EACCES" || err.code === "EPERM") {
        throw Object.assign(new Error(`Permission denied to create batch folder: ${BATCH_FOLDER_PATH}`), {
          code: err.code,
          stage,
          type: "Error",
          title: "Permission denied",
          message: `Permission denied to create batch folder: ${BATCH_FOLDER_PATH}`,
        });
      }
      throw err;
    }
    /*
    ==========================================
    SECTION H — CREATE TEMP STAGING FOLDER
    ==========================================

    Utwórz:

    _TEMP_<batchId>

    To jest staging area

    Utwórz subfoldery które będą potrzebne
    np:
    - LM
    - SAMPLE
    - FQ
    - CUSHION

    Możliwe błędy:
    - ENOENT
    - EACCES
    - EPERM
    - ENOSPC
    */
    /*
    ==========================================
    SECTION I — FILE NAME COLLISION CHECK
    ==========================================

    Sprawdź czy pliki z różnych folderów
    nie mają takich samych nazw.

    Jeśli konflikt:
    - fail fast
    - lub zmień nazwę

    Możliwe błędy / sytuacje:
    - EEXIST
    */
    /*
    ==========================================
    SECTION J — COPY FILES TO TEMP
    ==========================================

    Kopiuj pliki do temp folderu.

    NIE usuwaj jeszcze source.

    Po każdej kopii:
    - zapisz w copiedFiles

    Możliwe błędy:
    - ENOENT
    - EACCES
    - EPERM
    - EBUSY
    - ENOSPC
    - EMFILE
    - ENFILE
    */
    /*
    ==========================================
    SECTION K — VERIFY COPIED FILES
    ==========================================

    Zweryfikuj każdy plik:

    stat(source)
    stat(temp)

    Porównaj size

    Jeśli mismatch:
    - przerwij operację

    Możliwe błędy:
    - ENOENT
    - EACCES
    - EPERM
    */
    /*
    ==========================================
    SECTION L — DELETE SOURCE FILES
    ==========================================

    Dopiero teraz usuń source files.

    Po każdym usunięciu:
    - zapisz w deletedSourceFiles

    Możliwe błędy:
    - ENOENT
    - EACCES
    - EPERM
    - EBUSY
    */
    /*
    ==========================================
    SECTION M — COMMIT BATCH
    ==========================================

    Zamień:

    _TEMP_<batchId>

    na finalny batch folder

    lub przenieś pliki z temp.

    Opcjonalnie zapisz manifest.json

    Możliwe błędy:
    - EXDEV
    - ENOENT
    - EPERM
    - EBUSY
    */
  } catch (error) {
    /*
    ==========================================
    SECTION N — ERROR HANDLING
    ==========================================

    Zapisz:
    - error.code
    - error.message
    - etap operacji

    mapuj błędy na czytelne komunikaty
    */
    /*
    ==========================================
    SECTION O — ROLLBACK
    ==========================================

    Jeśli coś poszło nie tak:

    - usuń copiedFiles z temp
    - usuń temp folder
    - NIE usuwaj nic więcej jeśli nie masz pewności

    Możliwe błędy:
    - ENOENT
    - ENOTEMPTY
    - EPERM
    - EBUSY
    */
  } finally {
    /*
    ==========================================
    SECTION P — RELEASE LOCK
    ==========================================

    - zamknij lockHandle
    - usuń .lock file

    ignoruj ENOENT jeśli lock nie istnieje

    Możliwe błędy:
    - EBADF
    - EPERM
    - EACCES
    */
  }
};
