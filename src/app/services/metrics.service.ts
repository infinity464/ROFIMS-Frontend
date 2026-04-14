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

    constructor(private http: HttpClient) {
        this.initializeHubConnection();
        this.startConnection();
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
            this.startPollingFallback();
        });
    }

    private startConnection(): void {
        if (!this.hubConnection) return;

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
        this.stopPolling();
        if (this.hubConnection && this.hubConnection.state === HubConnectionState.Connected) {
            this.hubConnection.stop();
        }
    }
}
