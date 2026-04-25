import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ChartModule } from 'primeng/chart';
import { TagModule } from 'primeng/tag';
import { ProgressBarModule } from 'primeng/progressbar';
import { MetricsService, ConnectionState } from '@/services/metrics.service';
import { SystemMetrics } from '@/models/system-metrics.model';
import { Subscription } from 'rxjs';
import { UserMenuService } from '@/services/user-menu.service';

interface ThresholdConfig {
    green: number;
    amber: number;
}

@Component({
    selector: 'app-system-monitoring',
    standalone: true,
    imports: [CommonModule, ChartModule, TagModule, ProgressBarModule],
    templateUrl: './system-monitoring.html',
    styleUrl: './system-monitoring.scss'
})
export class SystemMonitoringComponent implements OnInit, OnDestroy {
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    metrics: SystemMetrics | null = null;
    connectionState: ConnectionState = 'Disconnected';

    cpuThreshold: ThresholdConfig = { green: 60, amber: 80 };
    ramThreshold: ThresholdConfig = { green: 60, amber: 80 };
    driveThresholdAmber = 80;
    driveThresholdRed = 90;

    historyChart: any = null;
    historyOptions: any = null;
    private cpuHistory: number[] = [];
    private ramHistory: number[] = [];
    private timeLabels: string[] = [];
    private maxHistory = 60;

    private metricsSub: Subscription | null = null;
    private connectionSub: Subscription | null = null;

    constructor(private metricsService: MetricsService, private _router: Router, private _userMenuService: UserMenuService) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.buildChartOptions();

        this.metricsSub = this.metricsService.metrics$.subscribe((m) => {
            if (!m) return;
            this.metrics = m;
            this.pushHistory(m);
        });

        this.connectionSub = this.metricsService.connectionState$.subscribe((s) => {
            this.connectionState = s;
        });
    }

    ngOnDestroy(): void {
        this.metricsSub?.unsubscribe();
        this.connectionSub?.unsubscribe();
    }

    getGaugeColor(value: number, threshold: ThresholdConfig): string {
        if (value >= threshold.amber) return '#ef4444';
        if (value >= threshold.green) return '#f59e0b';
        return '#22c55e';
    }

    getDriveColor(usedPercent: number): string {
        if (usedPercent >= this.driveThresholdRed) return '#ef4444';
        if (usedPercent >= this.driveThresholdAmber) return '#f59e0b';
        return '#22c55e';
    }

    isDriveCritical(usedPercent: number): boolean {
        return usedPercent >= this.driveThresholdRed;
    }

    isDriveWarning(usedPercent: number): boolean {
        return usedPercent >= this.driveThresholdAmber && usedPercent < this.driveThresholdRed;
    }

    getConnectionSeverity(): 'success' | 'warn' | 'danger' | 'info' {
        switch (this.connectionState) {
            case 'Live': return 'success';
            case 'Reconnecting': return 'warn';
            case 'Polling': return 'info';
            default: return 'danger';
        }
    }

    get cpuDashOffset(): number {
        return this.calcDashOffset(this.metrics?.cpuUsagePercent ?? 0);
    }

    get ramDashOffset(): number {
        return this.calcDashOffset(this.metrics?.ramUsedPercent ?? 0);
    }

    get overallStoragePercent(): number {
        if (!this.metrics || this.metrics.drives.length === 0) return 0;
        const totalSize = this.metrics.drives.reduce((s, d) => s + d.totalGB, 0);
        const totalFree = this.metrics.drives.reduce((s, d) => s + d.freeGB, 0);
        return totalSize > 0 ? ((totalSize - totalFree) / totalSize) * 100 : 0;
    }

    get storageDashOffset(): number {
        return this.calcDashOffset(this.overallStoragePercent);
    }

    get storageColor(): string {
        const pct = this.overallStoragePercent;
        if (pct >= this.driveThresholdRed) return '#ef4444';
        if (pct >= this.driveThresholdAmber) return '#f59e0b';
        return '#22c55e';
    }

    get totalStorageUsedGB(): number {
        if (!this.metrics) return 0;
        return this.metrics.drives.reduce((s, d) => s + (d.totalGB - d.freeGB), 0);
    }

    get totalStorageTotalGB(): number {
        if (!this.metrics) return 0;
        return this.metrics.drives.reduce((s, d) => s + d.totalGB, 0);
    }

    private calcDashOffset(percent: number): number {
        const circumference = 2 * Math.PI * 54;
        return circumference - (percent / 100) * circumference;
    }

    get gaugeCircumference(): number {
        return 2 * Math.PI * 54;
    }

    private pushHistory(m: SystemMetrics): void {
        const time = new Date(m.timestamp).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });

        this.cpuHistory.push(m.cpuUsagePercent);
        this.ramHistory.push(m.ramUsedPercent);
        this.timeLabels.push(time);

        if (this.cpuHistory.length > this.maxHistory) {
            this.cpuHistory.shift();
            this.ramHistory.shift();
            this.timeLabels.shift();
        }

        this.historyChart = {
            labels: [...this.timeLabels],
            datasets: [
                {
                    label: 'CPU %',
                    data: [...this.cpuHistory],
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    borderWidth: 2
                },
                {
                    label: 'RAM %',
                    data: [...this.ramHistory],
                    borderColor: '#06b6d4',
                    backgroundColor: 'rgba(6, 182, 212, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    borderWidth: 2
                }
            ]
        };
    }

    private buildChartOptions(): void {
        this.historyOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 300 },
            scales: {
                x: {
                    ticks: {
                        maxTicksLimit: 10,
                        font: { size: 10 }
                    },
                    grid: { display: false }
                },
                y: {
                    min: 0,
                    max: 100,
                    ticks: {
                        stepSize: 25,
                        callback: (v: number) => v + '%'
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'rectRounded',
                        padding: 16,
                        font: { size: 12 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx: any) => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%`
                    }
                }
            }
        };
    }
}
