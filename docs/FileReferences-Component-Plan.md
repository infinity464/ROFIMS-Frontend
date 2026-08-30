# Using File References Component on Forms (Supporting Documents)

Supporting documents are stored as a **FilesReferences** column (JSON) on the entity table—**no extra table** needed. Use the shared `FileInformation` upload/download API and the `app-file-references-form` component.

---

## 1. Backend (per form/entity)

- **Add column**  
  Add a `FilesReferences` column (e.g. `NVARCHAR(MAX)`) to the table that backs the form (e.g. `SomeInfo`).

- **Update model**  
  Add `FilesReferences` (string, nullable) to the corresponding C# entity (e.g. `SomeInfo.cs`).

- **SQL script**  
  Add a small migration to add the column if it doesn’t exist (same idea as `PersonalInfo_FilesReferences.sql`):

  ```sql
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SomeInfo') AND name = 'FilesReferences')
  BEGIN
      ALTER TABLE [dbo].[SomeInfo] ADD [FilesReferences] NVARCHAR(MAX) NULL;
  END
  GO
  ```

- **Save/load**  
  No extra API: use existing **FileInformation** Upload/Download. The entity’s save/update and get-by-id should read/write `FilesReferences` (they do once the property is on the model).

---

## 2. Frontend – service (if new entity)

- **API methods**  
  For the new entity, add (or reuse) methods to:
  - Get by id (returns entity including `FilesReferences`).
  - Save (insert).
  - Update (update).

- **File APIs**  
  Keep using the same upload and download helpers (e.g. `uploadEmployeeFile` / `downloadFile` + `triggerFileDownload` from `EmpService`). If the form is under a different feature, call the same file API from that service or expose one shared file upload/download service.

---

## 3. Frontend – component (form that will have files)

- **Imports**  
  Import `FileReferencesFormComponent`, `FileRowData`, and (if needed) `forkJoin`.

- **State**  
  - `fileRows: FileRowData[] = []`
  - `@ViewChild('fileReferencesForm') fileReferencesForm` so you can call `getExistingFileReferences()` and `getFilesToUpload()` on save.

- **Load**  
  When loading the entity (e.g. by id), parse `entity.FilesReferences` (or `entity.filesReferences`):
  - If string: `JSON.parse` → array of `{ FileId, fileName }`.
  - Map to: `fileRows = refs.map(r => ({ displayName: r.fileName ?? '', file: null, fileId: r.FileId }))`.
  - If no data or not an array: `fileRows = []`.

- **Reset**  
  When form resets or “new record”: set `fileRows = []`.

- **Save**  
  - `existingRefs = fileReferencesForm.getExistingFileReferences()`
  - `filesToUpload = fileReferencesForm.getFilesToUpload()`
  - If any `filesToUpload`: `forkJoin(upload each with your upload API)` → get `fileId`/`fileName` per file → merge with `existingRefs` → `filesReferencesJson = JSON.stringify(allRefs)`.
  - If none: `filesReferencesJson = existingRefs.length ? JSON.stringify(existingRefs) : null`.
  - Include `FilesReferences: filesReferencesJson` (or your backend property name) in the save/update payload.

- **Download**  
  Implement `onDownloadFile(payload: { fileId: number; fileName: string })`: call your download API with `payload.fileId`, then trigger browser download with `payload.fileName` (same pattern as `emp-personal-info`).

---

## 4. Frontend – template

Add the file references block (e.g. after the main form, before submit):

```html
<app-file-references-form
  #fileReferencesForm
  [fileRows]="fileRows"
  [isViewMode]="isReadonly"
  title="Supporting Documents"
  (fileRowsChange)="onFileRowsChange($event)"
  (onDownloadFile)="onDownloadFile($event)">
</app-file-references-form>
```

- **Handlers**  
  - `onFileRowsChange($event)` → `this.fileRows = $event` (or keep in sync with child).
  - `onDownloadFile($event)` → call download API then trigger file save (same as `emp-personal-info`).

---

## Summary

- **Backend:** One `FilesReferences` column per entity; no separate supporting-document table.
- **Frontend:** One shared `app-file-references-form` + same FileInformation upload/download; each form wires load/save/download as above.
