export interface DriveMetric {
    name: string;
    totalGB: number;
    freeGB: number;
    usedPercent: number;
}

export interface SystemMetrics {
    cpuUsagePercent: number;
    cpuCoreCount: number;
    ramUsedPercent: number;
    ramUsedGB: number;
    ramTotalGB: number;
    drives: DriveMetric[];
    timestamp: string;
}
