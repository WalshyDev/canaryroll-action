import * as core from '@actions/core';
import { CanaryRollClient } from './client.js';
import type { Deployment } from './client.js';

const TERMINAL_STATUSES = new Set(['completed', 'rolled_back', 'failed']);

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatStepProgress(deployment: Deployment): string {
	const steps = deployment.stepsSnapshot;
	if (!steps?.length) return `step ${deployment.currentStep}`;
	const current = steps[deployment.currentStep];
	return `step ${deployment.currentStep + 1}/${steps.length} (${current?.percentage ?? '?'}%)`;
}

async function run(): Promise<void> {
	try {
		const apiUrl = core.getInput('api-url') || 'https://canaryroll.com';
		const apiToken = core.getInput('api-token', { required: true });
		const teamId = core.getInput('team-id', { required: true });
		const workerId = core.getInput('worker-id', { required: true });
		const versionId = core.getInput('version-id', { required: true });
		const plan = core.getInput('plan');
		const autoAdvance = core.getInput('auto-advance') !== 'false';
		const name = core.getInput('name');
		const ticketUrl = core.getInput('ticket-url');
		const autoStart = core.getInput('auto-start') === 'true';
		const wait = core.getInput('wait') === 'true';
		const waitTimeout = parseInt(core.getInput('wait-timeout') || '1800', 10);
		const pollInterval = parseInt(core.getInput('poll-interval') || '15', 10);

		core.setSecret(apiToken);

		const client = new CanaryRollClient(apiUrl, apiToken, teamId);

		// 1. Create deployment
		core.info('Creating deployment...');
		const deployment = await client.createDeployment(workerId, {
			versionId,
			...(plan ? { planId: plan } : {}),
			autoAdvance,
			...(name ? { name } : {}),
			...(ticketUrl ? { ticketUrl } : {}),
		});

		const releaseUrl = `${apiUrl}/teams/${teamId}/deployments/${deployment.id}`;
		core.info(`Release created: ${deployment.id}`);
		core.info(`Release URL: ${releaseUrl}`);
		core.setOutput('release-id', deployment.id);
		core.setOutput('release-url', releaseUrl);

		if (!autoStart) {
			core.info('Deployment created in pending status. Start it from the CanaryRoll dashboard or set auto-start: true.');
			core.setOutput('status', 'pending');
			return;
		}

		// 2. Run preflight checks
		core.info('Running preflight checks...');
		const preflight = await client.runPreflight(deployment.id);

		for (const check of preflight.checks) {
			const icon = check.passed ? '\u2713' : '\u2717';
			core.info(`  ${icon} ${check.name}${check.message ? `: ${check.message}` : ''}`);
		}

		if (!preflight.passed) {
			core.setFailed('Preflight checks failed. Deployment was not started.');
			core.setOutput('status', 'pending');
			return;
		}

		// 3. Start deployment
		core.info('Starting deployment...');
		let current = await client.startDeployment(deployment.id);
		core.info(`Deployment started at ${formatStepProgress(current)}`);

		// 4. Wait for completion if requested
		if (!wait) {
			core.info('Deployment started successfully. Not waiting for completion (wait=false).');
			core.setOutput('status', current.status);
			return;
		}

		core.warning('Waiting for deployment completion. This keeps the runner active and will count towards your GitHub Actions usage. Consider using CanaryRoll notifications (Slack, Discord, Google Chat) instead.');
		core.info(`Waiting for deployment to complete (timeout: ${waitTimeout}s, poll: ${pollInterval}s)...`);
		const deadline = Date.now() + waitTimeout * 1000;
		let lastStep = current.currentStep;
		let lastStatus = current.status;

		while (!TERMINAL_STATUSES.has(current.status)) {
			if (Date.now() > deadline) {
				core.setFailed(`Deployment did not complete within ${waitTimeout}s timeout. Current status: ${current.status}`);
				core.setOutput('status', current.status);
				return;
			}

			await sleep(pollInterval * 1000);
			current = await client.getDeployment(deployment.id);

			// Log step/status changes
			if (current.currentStep !== lastStep || current.status !== lastStatus) {
				if (current.status === 'paused') {
					core.warning(`Deployment paused at ${formatStepProgress(current)}`);
				} else if (!TERMINAL_STATUSES.has(current.status)) {
					core.info(`Deployment progressed to ${formatStepProgress(current)} [${current.status}]`);
				}
				lastStep = current.currentStep;
				lastStatus = current.status;
			}
		}

		// 5. Report final status
		core.setOutput('status', current.status);

		switch (current.status) {
			case 'completed':
				core.info('Deployment completed successfully!');
				break;
			case 'rolled_back':
				core.setFailed('Deployment was rolled back.');
				break;
			case 'failed':
				core.setFailed('Deployment failed.');
				break;
		}
	} catch (error) {
		if (error instanceof Error) {
			core.setFailed(error.message);
		} else {
			core.setFailed('An unexpected error occurred');
		}
	}
}

run();
