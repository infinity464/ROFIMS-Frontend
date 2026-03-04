import {
    Component,
    Input,
    forwardRef,
    ViewChild,
    HostListener,
    ViewEncapsulation,
    OnDestroy,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Editor, EditorModule } from 'primeng/editor';
import Quill from 'quill';

// Register custom fonts once at module load time
const Font = Quill.import('formats/font') as any;
Font.whitelist = [
    'arial', 'times-new-roman', 'georgia', 'verdana', 'courier-new',
    'trebuchet-ms', 'tahoma', 'impact', 'comic-sans', 'palatino', 'garamond',
];
Quill.register(Font, true);

type ResizeTarget =
    | { kind: 'col';   cell:  HTMLTableCellElement;  table: HTMLTableElement }
    | { kind: 'table'; table: HTMLTableElement };

@Component({
    selector: 'app-rich-editor',
    standalone: true,
    imports: [CommonModule, EditorModule, FormsModule],
    templateUrl: './rich-editor.html',
    styleUrl: './rich-editor.scss',
    encapsulation: ViewEncapsulation.None,
    providers: [
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => RichEditorComponent),
            multi: true,
        },
    ],
})
export class RichEditorComponent implements ControlValueAccessor, OnDestroy {
    @Input() height = '220px';
    @Input() placeholder = 'Write here...';
    /** 'full' = all toolbar options; 'minimal' = bold/italic/underline/strike/clean only */
    @Input() toolbar: 'full' | 'minimal' = 'full';
    @Input() hideTable = false;

    @ViewChild(Editor) private editorRef!: Editor;

    _value   = '';
    disabled = false;

    // ── Table picker ────────────────────────────────────────────────────
    showTablePicker = false;
    hoveredRow = 0;
    hoveredCol = 0;
    readonly pickerRows = [1, 2, 3, 4, 5, 6];
    readonly pickerCols = [1, 2, 3, 4, 5, 6];
    customRows = 3;
    customCols = 3;

    // ── Context menu ────────────────────────────────────────────────────
    showContextMenu = false;
    contextMenuX    = 0;
    contextMenuY    = 0;
    private _ctxCell: HTMLTableCellElement | null = null;

    // ── Resize state ────────────────────────────────────────────────────
    private _resizeKind: 'col' | 'table' | null = null;
    private _resizeStartX = 0;
    private _resizeStartW = 0;
    private _resizeColIdx = -1;
    private _resizeTable: HTMLTableElement | null = null;

    private readonly _docMove = (e: MouseEvent) => this._onDocMouseMove(e);
    private readonly _docUp   = ()               => this._onDocMouseUp();

    private onChange:  (val: string) => void = () => {};
    private onTouched: () => void            = () => {};

    // ── ControlValueAccessor ────────────────────────────────────────────
    writeValue(val: string)                     { this._value = val ?? ''; }
    registerOnChange(fn: (val: string) => void) { this.onChange = fn; }
    registerOnTouched(fn: () => void)           { this.onTouched = fn; }
    setDisabledState(d: boolean)                { this.disabled = d; }

    onEditorChange(event: any) {
        const html = event.htmlValue ?? '';
        this._value = html;
        this.onChange(html);
        this.onTouched();
    }

    onEditorInit(event: any) {
        const quill = event.editor ?? this.editorRef?.['quill'];
        if (!quill) return;
        const root: HTMLElement = quill.root;
        root.addEventListener('contextmenu', this._onContextMenu.bind(this));
        root.addEventListener('mousemove',   this._onEditorMouseMove.bind(this));
        root.addEventListener('mousedown',   this._onEditorMouseDown.bind(this));
        document.addEventListener('mousemove', this._docMove);
        document.addEventListener('mouseup',   this._docUp);
    }

    ngOnDestroy() {
        document.removeEventListener('mousemove', this._docMove);
        document.removeEventListener('mouseup',   this._docUp);
    }

    // ── Table picker ────────────────────────────────────────────────────
    toggleTablePicker(event: Event) {
        event.stopPropagation();
        this.showTablePicker = !this.showTablePicker;
        if (!this.showTablePicker) { this.hoveredRow = 0; this.hoveredCol = 0; }
    }

    hoverCell(r: number, c: number) { this.hoveredRow = r; this.hoveredCol = c; }

    insertTable(rows: number, cols: number) {
        const quill: any = this.editorRef?.['quill'];
        if (!quill || rows < 1 || cols < 1) return;

        const colPct  = Math.floor(100 / cols);
        const tdStyle =
            `border-top:1px solid #bbb;border-right:1px solid #bbb;` +
            `border-bottom:1px solid #bbb;border-left:1px solid #bbb;` +
            `padding:5px 10px;min-width:40px;width:${colPct}%;`;

        let html =
            `<table class="re-ns-table" style="border-collapse:collapse;width:100%;` +
            `margin:6px auto;table-layout:fixed;"><tbody>`;
        for (let r = 0; r < rows; r++) {
            html += '<tr>';
            for (let c = 0; c < cols; c++) html += `<td style="${tdStyle}">&nbsp;</td>`;
            html += '</tr>';
        }
        html += '</tbody></table><p><br></p>';

        const range = quill.getSelection(true);
        quill.clipboard.dangerouslyPasteHTML(range ? range.index : quill.getLength(), html);
        this.showTablePicker = false;
        this.hoveredRow = 0;
        this.hoveredCol = 0;
    }

    @HostListener('document:click')
    onDocClick() { this.showTablePicker = false; this.showContextMenu = false; }

    // ── Context menu ────────────────────────────────────────────────────
    private _onContextMenu(e: MouseEvent) {
        const cell = (e.target as Element).closest('td, th') as HTMLTableCellElement | null;
        if (!cell) return;
        e.preventDefault();
        e.stopPropagation();
        this._ctxCell        = cell;
        this.contextMenuX    = Math.min(e.clientX, window.innerWidth  - 190);
        this.contextMenuY    = Math.min(e.clientY, window.innerHeight - 280);
        this.showContextMenu = true;
        this.showTablePicker = false;
    }

    closeCtxMenu() { this.showContextMenu = false; this._ctxCell = null; }

    ctxInsertRowAbove() {
        const row = this._ctxCell?.closest('tr');
        if (!row) return;
        row.parentElement!.insertBefore(this._makeRow(row.cells.length), row);
        this._sync(); this.closeCtxMenu();
    }

    ctxInsertRowBelow() {
        const row = this._ctxCell?.closest('tr');
        if (!row) return;
        row.parentElement!.insertBefore(this._makeRow(row.cells.length), row.nextSibling);
        this._sync(); this.closeCtxMenu();
    }

    ctxInsertColLeft() {
        const cell = this._ctxCell; if (!cell) return;
        const idx = cell.cellIndex;
        Array.from((cell.closest('table') as HTMLTableElement).rows)
            .forEach(row => row.insertBefore(this._makeTd(), row.cells[idx]));
        this._sync(); this.closeCtxMenu();
    }

    ctxInsertColRight() {
        const cell = this._ctxCell; if (!cell) return;
        const idx = cell.cellIndex;
        Array.from((cell.closest('table') as HTMLTableElement).rows).forEach(row => {
            const ref = row.cells[idx + 1];
            ref ? row.insertBefore(this._makeTd(), ref) : row.appendChild(this._makeTd());
        });
        this._sync(); this.closeCtxMenu();
    }

    ctxDeleteRow() {
        const row = this._ctxCell?.closest('tr') as HTMLTableRowElement | null; if (!row) return;
        const table = row.closest('table')!;
        row.remove();
        if (table.rows.length === 0) table.remove();
        this._sync(); this.closeCtxMenu();
    }

    ctxDeleteCol() {
        const cell = this._ctxCell; if (!cell) return;
        const table = cell.closest('table') as HTMLTableElement;
        const idx   = cell.cellIndex;
        Array.from(table.rows).forEach(row => { if (row.cells[idx]) row.deleteCell(idx); });
        if ((table.rows[0]?.cells.length ?? 0) === 0) table.remove();
        this._sync(); this.closeCtxMenu();
    }

    ctxDeleteTable() {
        const table = this._ctxCell?.closest('table'); if (!table) return;
        table.remove(); this._sync(); this.closeCtxMenu();
    }

    // ── Unified resize detection ─────────────────────────────────────────
    /**
     * Returns what should happen when the user starts dragging at position e:
     *  - 'table'  → mouse is within 8 px of the table's outer RIGHT border  → resize whole table
     *  - 'col'    → mouse is within 6 px of any INNER column border          → resize that column
     *  - null     → no resize action
     */
    private _getTarget(e: MouseEvent): ResizeTarget | null {
        const table = (e.target as Element).closest('table') as HTMLTableElement | null;
        if (!table) return null;

        const tableRect = table.getBoundingClientRect();

        // ── Outer right border → full-table resize ──────────────────────
        if (e.clientX >= tableRect.right - 8) {
            return { kind: 'table', table };
        }

        // ── Inner column border → column resize ─────────────────────────
        const cell = (e.target as Element).closest('td, th') as HTMLTableCellElement | null;
        if (!cell) return null;
        const cellRect = cell.getBoundingClientRect();
        if (e.clientX >= cellRect.right - 6) {
            return { kind: 'col', cell, table };
        }

        return null;
    }

    private _onEditorMouseMove(e: MouseEvent) {
        if (this._resizeKind) return;                   // mid-drag, skip

        const quill: any = this.editorRef?.['quill'];
        if (!quill) return;
        const root = quill.root as HTMLElement;

        const hit = this._getTarget(e);
        root.style.cursor = hit?.kind === 'table' ? 'ew-resize'
                          : hit?.kind === 'col'   ? 'col-resize'
                          : '';
    }

    private _onEditorMouseDown(e: MouseEvent) {
        const hit = this._getTarget(e);
        if (!hit) return;
        e.preventDefault();

        // Disable Quill during drag so MutationObserver can't fight our style changes
        const quill: any = this.editorRef?.['quill'];
        if (quill) quill.disable();

        this._resizeStartX = e.clientX;
        this._resizeTable  = hit.table;

        if (hit.kind === 'table') {
            this._resizeKind   = 'table';
            // Convert width:100% → exact pixels so drag delta works correctly
            this._resizeStartW = hit.table.offsetWidth;
            hit.table.style.width       = this._resizeStartW + 'px';
            hit.table.style.tableLayout = 'fixed';
            // Keep table centered so it shrinks symmetrically from both sides
            hit.table.style.marginLeft  = 'auto';
            hit.table.style.marginRight = 'auto';
            document.body.style.cursor  = 'ew-resize';
        } else {
            this._resizeKind   = 'col';
            this._resizeStartW = hit.cell.offsetWidth;
            this._resizeColIdx = hit.cell.cellIndex;
            document.body.style.cursor = 'col-resize';
        }
    }

    private _onDocMouseMove(e: MouseEvent) {
        if (!this._resizeKind || !this._resizeTable) return;
        const diff = e.clientX - this._resizeStartX;

        if (this._resizeKind === 'table') {
            const newW = Math.max(80, this._resizeStartW + diff);
            this._resizeTable.style.width = newW + 'px';
        } else {
            const newW = Math.max(40, this._resizeStartW + diff);
            Array.from(this._resizeTable.rows).forEach(row => {
                const c = row.cells[this._resizeColIdx] as HTMLTableCellElement | undefined;
                if (c) c.style.width = newW + 'px';
            });
        }
    }

    private _onDocMouseUp() {
        if (!this._resizeKind) return;
        this._resizeKind   = null;
        this._resizeTable  = null;
        this._resizeColIdx = -1;
        document.body.style.cursor = '';

        const quill: any = this.editorRef?.['quill'];
        if (!quill) return;

        // Capture the HTML NOW — before re-enabling Quill.
        // quill.enable() causes the MutationObserver to flush, which
        // re-normalises the table and strips our inline width/margin changes.
        const html = quill.root.innerHTML;

        if (!this.disabled) quill.enable();

        // Emit the captured HTML directly — do NOT call quill.update()
        // so Quill never gets a chance to re-normalise and reset the table.
        this._value = html;
        this.onChange(html);
    }

    // ── DOM helpers ─────────────────────────────────────────────────────
    private _makeRow(cols: number): HTMLTableRowElement {
        const tr = document.createElement('tr');
        for (let i = 0; i < cols; i++) tr.appendChild(this._makeTd());
        return tr;
    }

    private _makeTd(): HTMLTableCellElement {
        const td = document.createElement('td');
        td.style.cssText =
            'border-top:1px solid #bbb;border-right:1px solid #bbb;' +
            'border-bottom:1px solid #bbb;border-left:1px solid #bbb;' +
            'padding:5px 10px;min-width:40px;';
        td.innerHTML = '&nbsp;';
        return td;
    }

    private _sync() {
        const quill: any = this.editorRef?.['quill'];
        if (!quill) return;
        // Read directly from the live DOM.
        // Calling quill.update() first would re-normalise the table and
        // strip any inline width / margin changes we just made.
        const html = quill.root.innerHTML;
        this._value = html;
        this.onChange(html);
    }
}
