/**
 * Naming rules shared by every file upload in the app.
 *
 * On disk the API stores each upload as `<display name>_<owner>_<guid>.<ext>`, e.g.
 * `Appointment Letter_12345_ab12..cd.pdf`. The owner tag produced here is the only part of that the
 * frontend controls. The display name itself is passed separately and is what file lists and
 * downloads show — the API never alters it.
 */

const NO_OWNER = 'NORABID';

/** Letters, digits and '-' only — anything else would be illegal or confusing in a file name. */
function sanitize(value: string | number | null | undefined): string {
    return value == null ? '' : String(value).trim().replace(/[^A-Za-z0-9-]/g, '');
}

/**
 * Owner tag for an upload: the member's RAB ID when known, otherwise `EMP<employeeId>`,
 * otherwise `NORABID` (chat attachments, notices and other uploads with no member context).
 */
export function buildUploadOwnerTag(rabId?: string | number | null, employeeId?: string | number | null): string {
    const rab = sanitize(rabId);
    if (rab) return rab;

    const emp = sanitize(employeeId);
    if (emp && emp !== '0') return `EMP${emp}`;

    return NO_OWNER;
}

/** `yyyyMMddHHmmss` in local time — used for names built on the client (e.g. the profile image). */
export function buildFileNameTimestamp(date: Date = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/**
 * Renames a profile image to `<owner>_<yyyyMMddHHmmss>.<ext>`, discarding the user's original file
 * name — profile images carry no user-typed label to preserve. The API uses this as the display
 * name and, since it already leads with the owner tag, stores it on disk as
 * `<owner>_<yyyyMMddHHmmss>_<guid>.<ext>` rather than repeating the tag.
 */
export function buildProfileImageFile(file: File, rabId?: string | number | null, employeeId?: string | number | null): File {
    const dot = file.name.lastIndexOf('.');
    const extension = dot > -1 ? file.name.substring(dot).toLowerCase() : '';
    const newName = `${buildUploadOwnerTag(rabId, employeeId)}_${buildFileNameTimestamp()}${extension}`;

    return new File([file], newName, { type: file.type, lastModified: file.lastModified });
}
