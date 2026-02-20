# Posting Module Requirements (Pages 43–58)

Summary from **ROFIMS-Requirements-v4-December-16-2025.pdf** for **New Posting Order** and **Inter-Posting Order** under Office Management.

---

## 1. Pending List for Joining (Page 43)

- **Sub-sections:** Pending List for Joining – New Posting | Pending List for Joining – Inter Posting  
- After posting workflow is complete but **before** members are joined to the unit, they appear in this list.
- Only the concerned Battalion/Unit user can see their posted members.
- **By Force Join:** Each row has a **Join** action. On click, open form:
  - **RAB ID**, **Service ID** (text)
  - **Name, Rank, Corps, Trade** (auto load, read-only)
  - **Posting From** (auto from Posting Order, not editable)
  - **Posted To** (auto from Posting Order, not editable)
  - **Joining Date** (date picker)
  - **CC/MO/Article 47 No** (text)
  - **Upload CC/MO/Article 47** (file upload)

---

## 2. New Posting Order (Pages 45–51)

**Source of members:** List of **Supernumerary Post** (from Data Entry 1.b).

### 2.1 (a) Create Draft New Posting List (Page 45)

- Show all members from **List of Supernumerary Post** with filters:
  - Search by **Service ID**, **RAB ID**
  - Short by: **Mother Organization**, **Rank**, **Corps**, **Trade**, **Date From/To**
  - **Show List** to apply filters.
- **Table columns:** Ser, Service ID, Rank, Corps, Trade, Name, Mother Unit, Date of Join in RAB, **Action**.
- **Action:** “Send to Draft Posting List” (per row or bulk). One or more members can be sent in one command.
- **Conditions:**
  - Only users with access to an Employee Type see that type in the list.
  - Once sent to Draft Posting List, in Supernumerary list show “Posting in Process” and disable the action.
  - Same “Posting in Process” if viewed from profile’s Draft New Posting List.

### 2.2 (b) Add Draft New Posting Note-Sheet (Page 46)

- Data source: **Draft New Posting List** (all members in that list).
- **Date**, **Draft Posting List No** (Select Date | Auto Generated / Manual).
- **Add All** | **Add to Note Sheet** (per member).
- **Conditions:**
  - Adding a member to the note-sheet removes them from Draft Posting List.
  - Adding to note-sheet shows “Note-Sheet in Process” in Supernumerary list and disables action.

### 2.3 (c) Generate New Posting Note-Sheet (Page 47)

- **Draft Posting List No** (dropdown)
- **Note-Sheet Text Type:** Bangla/English (auto select)
- **Select Date** (date picker)
- **Reference Number** (auto select / manual)
- **Subject** (auto / manual)
- **Main Text** (paragraph)
- **Prepared by** (auto = login user)
- **Select Initiator** (dropdown)
- **Select Recommender(s)** (one or more)
- **Select Final Approver** (dropdown)
- **Upload Supporting Document** (file)
- **Options:** (1) System Generated Note-Sheet (Approved by System), (2) Manually Note-Sheet  
- **Generate Note Sheet** button.

### 2.4 Draft New Posting Note-Sheet → Finalized (Pages 48–49)

- **Draft:** Initiator prints note-sheet. On **Submit**, it goes to **Pending for Finalized** list. All approval steps are done manually.
- **Finalize:** From the printed copy, for **New Posting** a **dropdown per person** to **select Unit**. **Submit**.
  - **Warning** if selected unit is member’s **home district** (e.g. “?? Awab¯’ RAB Unit”).
  - Before submit: can **remove** or **add** members.
- **Submit for Finalized** generates **Finalized Draft New Posting Note-Sheet**.

### 2.5 Finalized → Approval → Posting Order (Page 49)

- Initiator prints Finalized Note-Sheet. On **Submit**, it goes to **Pending for Approval**.
- Approval flow (Initiator → Approver) is **manual**. On **Final Submit**:
  - Generate **Final Posting Order / Force Order** in the given layout.
  - Send **notification** to the concerned unit’s user account.
  - Members appear in **Pending List for Posting** until joining. After joining at the unit, they are included in that unit’s roster; **Profile, Posting Information, and all lists** auto-update.

### 2.6 Posting Order / Force Order (Page 50)

- **Print** by **Unit** (filter/sort by New Posting unit).
- **Cancellation / Amendment (Page 50–51):**
  - **Before** joining at the posted unit: posting can be **cancelled or amended**. If cancelled, those members go back to **Supernumerary Post List**. Any amendment must follow the full note-sheet workflow again.
  - **After** joining at the unit: **cannot** cancel from this order; use **Inter Posting** for further change.
  - For **new** Force/Posting Order, a standard **footnote** is required (e.g. “RAB … Order No … Dt … through … So-and-so has been relieved for posting to RAB-15 (Section-35)”). Can be **Auto or Manual**; prefer the simpler option.

---

## 3. Inter-Posting Order (Pages 52–58)

**Source of members:** **Presently Serving Members** (already in RAB units).

### 3.1 (a) Create Draft Inter Posting List (Page 52)

- Show **Presently Serving Members** with search/filter:
  - **Search by:** RAB ID, Service ID, NID, Name (Bangla/English), Present RAB Unit, Rank, Corps/Trade.
  - **Search by RAB Duration:** From – To (year).
  - **Search by Home District**, **Wife Home District**, **Appointment**, **Dynamic/AI Search**.
- **Table columns:** Ser, Service ID, Rank, Corps, Trade, Name, RAB Unit, Joining Date in RAB, Home District (and optionally Reliever Svc ID, Status, Action).
- **Action:** “Send to Inter Posting List”. One or more members in one command.
- **Conditions:**
  - If a member is already in Draft Inter Posting List or in an Inter Posting Note-Sheet, do **not** add again; show **“Already in Inter Posting List”** or **“Already in Inter Posting Note-Sheet”**.

### 3.2 (b) Add Draft Inter Posting Note-Sheet (Page 53)

- Data source: **Draft Inter Posting List**.
- **Date**, **Draft Inter Posting List No** (Select Date | Auto Generated / Manual).
- **Add All** | **Add** (per member).
- Table may include **Reliever Svc ID**, **Status**, **Action**.
- Adding a member to the note-sheet **removes** them from Draft Inter Posting List.

### 3.3 (c) Generate Inter Posting Note-Sheet (Page 54)

- Same structure as New Posting:
  - **Draft Inter Posting List No**, **Note-Sheet Text Type**, **Select Date**, **Reference Number**, **Subject**, **Main Text**, **Prepared by**, **Initiator**, **Recommender(s)**, **Final Approver**, **Upload Supporting Document**.
  - **System Generated** or **Manually**.
  - **Generate Note Sheet**.

### 3.4 Draft Inter Posting Note-Sheet → Finalized (Pages 55–56)

- Same idea as New Posting: **Draft** → print, submit to **Pending for Finalized**.
- **Finalize:** Per person **Unit** dropdown; **Submit**. **Warning** if selected unit is **home district**.
  - Before submit: can **remove** or **add** members.
- **Submit for Finalized** generates **Finalized Draft Inter Posting Note-Sheet**.

### 3.5 Finalized → Approval → Posting Order (Page 56)

- **Submit** → **Pending for Approval**. Manual approval (Initiator → Approver).
- **Final Submit:**
  - Generate **Final Posting Order / Force Order**.
  - **Notification** to concerned unit user.
  - **Before** joining at new unit: posting can be **cancelled/amended** (same footnote and workflow as New Posting).
  - **After** joining: **no** cancellation from this order.
  - Members stay in **Pending List for Posting** until joining; after joining, **unit roster, Profile, Posting Information, and all lists** auto-update.

### 3.6 Posting Order / Force Order (Pages 57–58)

- **Print** by **Unit** (filter/sort by transfer unit).
- **Cancellation (Page 58):**
  - Open the **Force Order / Posting Order** by **Order No**.
  - **Select** members whose posting is to be **cancelled**; perform cancellation. Cancelled members go back to **previous unit list**.
  - Amendment of posting (e.g. change unit) must follow the **full note-sheet workflow** again.
  - Same **footnote** rule (Auto/Manual) as in New Posting.

---

## 4. Data / UI Summary

| Feature                    | New Posting Order              | Inter-Posting Order                 |
|---------------------------|---------------------------------|-------------------------------------|
| **Source list**            | Supernumerary Post              | Presently Serving Members           |
| **Draft list**             | Draft New Posting List          | Draft Inter Posting List            |
| **Note-sheet**             | Draft New Posting Note-Sheet    | Draft Inter Posting Note-Sheet      |
| **Finalized note-sheet**   | Finalized Draft New Posting     | Finalized Draft Inter Posting       |
| **After approval**         | Posting Order / Force Order     | Posting Order / Force Order         |
| **Pending list**           | Pending List for Joining (New)  | Pending List for Joining (Inter)    |
| **Join form**              | Same (RAB ID, Service ID, From/To Unit, Joining Date, CC/MO/Article 47) | Same |
| **Cancel before join**    | Yes → back to Supernumerary     | Yes → back to previous unit        |
| **Cancel after join**     | No; use Inter Posting           | No                                  |

---

## 5. Suggested Frontend Routes / Screens

- **Pending List for Joining** (tabs or sub-routes: New Posting | Inter Posting) + **Join** form (dialog or page).
- **New Posting Order**
  - Create Draft New Posting List
  - Add Draft New Posting Note-Sheet
  - Generate New Posting Note-Sheet (similar to existing NoteSheet generate)
  - List: Draft / Pending Finalized / Pending Approval / Approved (Posting Order)
- **Inter-Posting Order**
  - Create Draft Inter Posting List
  - Add Draft Inter Posting Note-Sheet
  - Generate Inter Posting Note-Sheet
  - List: Draft / Pending Finalized / Pending Approval / Approved (Posting Order)
- **Posting Order / Force Order** view and **print by unit**; **cancel/amend** by Order No (with above rules).

This document is the single reference for implementing the Posting module (New Posting Order and Inter-Posting Order) in ROFIMS frontend and backend.
