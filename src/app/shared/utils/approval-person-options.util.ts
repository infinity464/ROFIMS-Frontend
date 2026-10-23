/**
 * Single source of truth for the "Approval Person" dropdown options.
 *
 * The eligible approvers are the identity users that (a) map to an EmployeeInfo and
 * (b) have a real appointment set. Both the GENERATE screens and the EDIT (preview)
 * screens must show the SAME list, so this logic lives here instead of being copied
 * per component — a note-sheet/order edited later offers exactly the approvers it
 * offered when it was generated.
 *
 * Input: the raw `getAllUsers()` list + the `getMappings()` list.
 * Output: `{ label, value }[]` sorted by label, value = EmployeeId.
 */
export function buildApprovalPersonOptions(userList: any[], mappingList: any[]): { label: string; value: number }[] {
    const users = Array.isArray(userList) ? userList : [];
    const mappings = Array.isArray(mappingList) ? mappingList : [];

    const userEmpMap = new Map<string, number>();
    for (const m of mappings) {
        const empId = m.employeeId ?? m.EmployeeId;
        const uid = m.userId ?? m.UserId;
        if (uid && typeof empId === 'number' && empId > 0) userEmpMap.set(uid, empId);
    }
    const pick = (o: any, ...keys: string[]): string | null => {
        for (const k of keys) { const v = o?.[k]; if (v != null && String(v).trim() !== '') return String(v); }
        return null;
    };
    const opts: { label: string; value: number }[] = [];
    for (const u of users) {
        const empId = userEmpMap.get(u.id);
        if (!empId) continue;
        const m = mappings.find((x: any) => (x.userId ?? x.UserId) === u.id);
        const appointment = pick(m, 'appointment', 'Appointment');
        const norm = (appointment ?? '').trim().toLowerCase();
        if (!norm || norm === 'n/a' || norm === 'na' || norm === 'not applicable') continue;
        const name = pick(m, 'employeeName', 'EmployeeName') || u.userName;
        const rank = pick(m, 'rank', 'Rank');
        const serviceId = pick(m, 'serviceId', 'ServiceId');
        const rabId = pick(m, 'rabID', 'rABID', 'rabid', 'RABID', 'RabID');
        let head = [rank, name].filter(Boolean).join(' ');
        if (appointment) head = head ? `${head} (${appointment})` : `(${appointment})`;
        opts.push({ label: [head, serviceId ? `SVC: ${serviceId}` : '', rabId ? `RAB: ${rabId}` : ''].filter(Boolean).join(' | '), value: empId });
    }
    return opts.sort((a, b) => a.label.localeCompare(b.label));
}
