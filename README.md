# RipFlow

## 🚀 Overview

**RipFlow** is a desktop application built with **Electron + React** designed to automate and manage the print workflow in a production environment using **PrintFactory**.

The goal of the application is to reduce manual work, standardize file handling, and streamline the entire pipeline from incoming files to final printed output.

---

## 🧠 What problem does it solve?

In a typical print workflow:

- Files arrive in different formats and naming conventions
- Operators manually sort, rename, and move files
- Batch creation and preparation take time
- Errors happen due to inconsistent processes

**RipFlow automates this entire process.**

---

## ⚙️ Core Features (MVP)

- 📥 **Inbox scanning**
  Automatically detects new files in the INBOX folder

- 🧩 **Product type detection**
  Identifies product types (e.g. LM, SAMPLE, FQ, CUSHION) based on file names

- 📦 **Batch creation**
  Groups files into structured batches ready for production

- 🔀 **File routing**
  Moves files into appropriate folders (PRODUCTIZE → READY → BATCH)

- 📊 **Workflow tracking**
  Keeps track of file status across the pipeline

---

## 🔄 Workflow

```
INBOX → PRODUCTIZE → READY → BATCH → NESTED → PRINTED
```

### Steps:

1. **INBOX**
   New files are detected

2. **PRODUCTIZE**
   Files are classified and organized

3. **READY**
   Files are grouped into batches

4. **BATCH**
   Batch metadata is created (manifest, summary)

5. **NESTED**
   Files are prepared for printing (PrintFactory)

6. **PRINTED**
   Completed jobs are archived

---

## 🏗️ Tech Stack

- **Electron** – desktop environment
- **React (Vite)** – UI layer
- **Node.js (fs)** – file system operations
- **PrintFactory API** _(planned integration)_

---

## 📁 Project Structure

```
src/
  ui/          # React frontend
  electron/    # Electron main process + IPC
```

---

## 🧩 Key Concepts

- **File-based workflow** – system operates directly on folders
- **Naming-driven logic** – metadata extracted from file names
- **Non-destructive processing** – original files are never modified
- **Automation-first approach** – minimal manual interaction

---

## ⚠️ Known Challenges

- Inconsistent file naming conventions
- Material detection edge cases
- Handling large batches efficiently

---

## 🔮 Future Plans

- Integration with **PrintFactory Cloud API**
- UI for managing materials and settings
- Real-time production tracking
- Error handling and recovery system
- Multi-user synchronization

---

## 💡 Vision

RipFlow aims to become a **central control system for print production**, combining:

- automation
- visibility
- consistency

into a single, reliable workflow tool.

---

## 👨‍💻 Author

Built as a custom solution for optimizing real-world print production workflows.
