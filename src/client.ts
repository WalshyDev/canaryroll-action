export interface Deployment {
	id: string;
	workerId: string;
	teamId: string;
	planId: string;
	cfVersionId: string;
	cfPreviousVersionId: string | null;
	status: 'pending' | 'in_progress' | 'paused' | 'completed' | 'rolled_back' | 'failed';
	currentStep: number;
	autoAdvance: boolean;
	name: string | null;
	ticketUrl: string | null;
	stepsSnapshot: Array<{ percentage: number; waitSeconds: number }>;
	startedAt: string | null;
	completedAt: string | null;
	createdAt: string;
}

export interface DeploymentEvent {
	id: string;
	deploymentId: string;
	eventType: string;
	stepIndex: number | null;
	percentage: number | null;
	details: Record<string, unknown> | null;
	createdAt: string;
}

export interface PreflightResult {
	passed: boolean;
	checks: Array<{
		name: string;
		passed: boolean;
		message?: string;
	}>;
}

export interface CreateDeploymentParams {
	versionId: string;
	planId?: string;
	autoAdvance?: boolean;
	name?: string;
	ticketUrl?: string;
}

export interface CfAccessCredentials {
	clientId: string;
	clientSecret: string;
}

export class CanaryRollClient {
	private baseUrl: string;
	private token: string;
	private teamId: string;
	private cfAccess?: CfAccessCredentials;

	constructor(baseUrl: string, token: string, teamId: string, cfAccess?: CfAccessCredentials) {
		this.baseUrl = baseUrl.replace(/\/+$/, '');
		this.token = token;
		this.teamId = teamId;
		this.cfAccess = cfAccess;
	}

	private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
		const url = `${this.baseUrl}/api/teams/${this.teamId}${path}`;
		const accessHeaders: Record<string, string> = {};
		if (this.cfAccess) {
			accessHeaders['CF-Access-Client-Id'] = this.cfAccess.clientId;
			accessHeaders['CF-Access-Client-Secret'] = this.cfAccess.clientSecret;
		}
		const res = await fetch(url, {
			...options,
			headers: {
				Authorization: `Bearer ${this.token}`,
				'Content-Type': 'application/json',
				...accessHeaders,
				...options.headers,
			},
		});

		if (!res.ok) {
			let message = `HTTP ${res.status}`;
			try {
				const body = (await res.json()) as { message?: string; error?: string };
				message = body.message || body.error || message;
			} catch {
				// ignore parse errors
			}
			throw new Error(`CanaryRoll API error: ${message} (${res.status})`);
		}

		return res.json() as Promise<T>;
	}

	async createDeployment(workerId: string, params: CreateDeploymentParams): Promise<Deployment> {
		return this.request<Deployment>(`/deployments/workers/${workerId}/deployments`, {
			method: 'POST',
			body: JSON.stringify(params),
		});
	}

	async runPreflight(deploymentId: string): Promise<PreflightResult> {
		return this.request<PreflightResult>(`/deployments/${deploymentId}/preflight`);
	}

	async startDeployment(deploymentId: string): Promise<Deployment> {
		return this.request<Deployment>(`/deployments/${deploymentId}/start`, {
			method: 'POST',
		});
	}

	async getDeployment(deploymentId: string): Promise<Deployment> {
		return this.request<Deployment>(`/deployments/${deploymentId}`);
	}

	async getDeploymentEvents(deploymentId: string): Promise<DeploymentEvent[]> {
		return this.request<DeploymentEvent[]>(`/deployments/${deploymentId}/events`);
	}
}
