import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, interval, Subscription } from 'rxjs';
import { environment } from '@/Core/Environments/environment';
import { SystemMetrics } from '@/models/system-metrics.model';
import { HubConnection, HubConnectionBuilder, HubConnectionState } from '@microsoft/signalr';

export type ConnectionState = 'Live' | 'Reconnecting' | 'Polling' | 'Disconnected';

@Injectable({
    providedIn: 'root'
})
export class MetricsService {
    private hubConnection: HubConnection | null = null;
    private pollingSubscription: Subscription | null = null;

    private metricsSubject = new BehaviorSubject<SystemMetrics | null>(null);
    public metrics$ = this.metricsSubject.asObservable();

    private connectionStateSubject = new BehaviorSubject<ConnectionState>('Disconnected');
    public connectionState$ = this.connectionStateSubject.asObservable();

    private apiUrl = environment.apis.core.replace(/\/api\/?$/, '');
    private metricsApi = `${environment.apis.core}/Metrics`;

    // Ref-count of active consumers (e.g. the system-monitoring page). The hub/poll
    // is only alive while something is actually watching, so we don't hold an always-on
    // SignalR socket + 5s poll for the whole session — which also kept the backend's
    // metrics broadcaster (and its per-tick system sampling) running 24/7.
    private refCount = 0;
    // Set while we intentionally tear down, so the hub's onclose handler does not
    // immediately spin the polling fallback back up.
    private stopping = false;

    constructor(private http: HttpClient) {
        this.initializeHubConnection();
    }

    /** Call from a consuming component's ngOnInit. Opens the connection on first acquire. */
    acquire(): void {
        if (this.refCount++ === 0) {
            this.startConnection();
        }
    }

    /** Call from a consuming component's ngOnDestroy. Tears down on last release. */
    release(): void {
        if (--this.refCount <= 0) {
            this.refCount = 0;
            this.disconnect();
        }
    }

    private initializeHubConnection(): void {
        this.hubConnection = new HubConnectionBuilder()
            .withUrl(`${this.apiUrl}/hubs/metrics`)
            .withAutomaticReconnect([0, 1000, 3000, 5000, 10000])
            .build();

        this.hubConnection.on('ReceiveMetrics', (metrics: SystemMetrics) => {
            this.metricsSubject.next(metrics);
        });

        this.hubConnection.onreconnecting(() => {
            this.connectionStateSubject.next('Reconnecting');
        });

        this.hubConnection.onreconnected(() => {
            this.connectionStateSubject.next('Live');
            this.stopPolling();
        });

        this.hubConnection.onclose(() => {
            this.connectionStateSubject.next('Disconnected');
            if (!this.stopping) {
                this.startPollingFallback();
            }
        });
    }

    private startConnection(): void {
        if (!this.hubConnection) return;
        this.stopping = false;

        this.hubConnection
            .start()
            .then(() => {
                this.connectionStateSubject.next('Live');
                this.stopPolling();
            })
            .catch(() => {
                this.startPollingFallback();
            });
    }

    private startPollingFallback(): void {
        if (this.pollingSubscription) return;
        this.connectionStateSubject.next('Polling');
        this.fetchMetricsOnce();
        this.pollingSubscription = interval(5000).subscribe(() => {
            this.fetchMetricsOnce();
        });
    }

    private fetchMetricsOnce(): void {
        this.http.get<SystemMetrics>(this.metricsApi).subscribe({
            next: (metrics) => this.metricsSubject.next(metrics),
            error: () => {}
        });
    }

    private stopPolling(): void {
        if (this.pollingSubscription) {
            this.pollingSubscription.unsubscribe();
            this.pollingSubscription = null;
        }
    }

    disconnect(): void {
        this.stopping = true;
        this.stopPolling();
        if (this.hubConnection && this.hubConnection.state !== HubConnectionState.Disconnected) {
            this.hubConnection.stop();
        }
        this.connectionStateSubject.next('Disconnected');
    }
}
