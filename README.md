# CanaryRoll Deploy Action

GitHub Action for triggering gradual deployments via [CanaryRoll](https://canaryroll.com).

Creates a deployment and runs preflight checks. By default the deployment is left in `pending` status for you to start from the CanaryRoll dashboard — set `auto-start: true` to start it immediately.

## Usage

### Basic — create a pending deployment

```yaml
- uses: canaryroll/action@v1
  with:
    api-token: ${{ secrets.CANARYROLL_TOKEN }}
    team-id: my-team
    worker-id: ${{ vars.CANARYROLL_WORKER_ID }}
    version-id: ${{ steps.deploy.outputs.version-id }}
```

The deployment is created and ready to start. You'll be notified via your configured notification channels (Slack, Discord, Google Chat) and can start the rollout from the dashboard.

### Auto-start the rollout

```yaml
- uses: canaryroll/action@v1
  with:
    api-token: ${{ secrets.CANARYROLL_TOKEN }}
    team-id: my-team
    worker-id: ${{ vars.CANARYROLL_WORKER_ID }}
    version-id: ${{ steps.deploy.outputs.version-id }}
    auto-start: 'true'
```

### With Wrangler versions upload

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Upload new version
        id: deploy
        run: |
          OUTPUT=$(npx wrangler versions upload 2>&1)
          VERSION_ID=$(echo "$OUTPUT" | grep -oP 'Version ID:\s*\K[a-f0-9-]+')
          echo "version-id=$VERSION_ID" >> "$GITHUB_OUTPUT"
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}

      - name: Gradual rollout
        uses: canaryroll/action@v1
        with:
          api-token: ${{ secrets.CANARYROLL_TOKEN }}
          team-id: my-team
          worker-id: ${{ vars.CANARYROLL_WORKER_ID }}
          version-id: ${{ steps.deploy.outputs.version-id }}
          name: ${{ github.sha }}
          ticket-url: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api-token` | Yes | | API token (`crt_*` team token or `cru_*` user token) |
| `team-id` | Yes | | Team ID or slug |
| `worker-id` | Yes | | Worker ID registered in CanaryRoll |
| `version-id` | Yes | | Cloudflare Worker version ID to deploy |
| `plan` | No | Worker default | Rollout plan ID or slug |
| `auto-advance` | No | `true` | Auto-advance through rollout steps |
| `auto-start` | No | `false` | Start the deployment immediately after creation |
| `name` | No | | Release name |
| `ticket-url` | No | | Associated ticket/issue URL |
| `wait` | No | `false` | Wait for deployment to complete (see warning below) |
| `wait-timeout` | No | `1800` | Max seconds to wait (only with `wait: true`) |
| `poll-interval` | No | `15` | Seconds between status polls (only with `wait: true`) |

## Outputs

| Output | Description |
|--------|-------------|
| `release-id` | Created release ID |
| `release-url` | Dashboard URL for the release |
| `status` | Release status |

## Notifications

Rather than keeping a GitHub Actions runner alive waiting for your rollout to finish, set up notifications in CanaryRoll. You can receive deployment updates via:

- **Slack**
- **Discord**
- **Google Chat**

Configure notification channels in the CanaryRoll dashboard under **Team Settings > Notifications**. You'll get notified on deployment creation, step advances, completion, and rollbacks.

## Authentication

Use either a **team API token** (`crt_*`) or a **user API token** (`cru_*`). Team tokens are recommended for CI as they are scoped to a single team and can be given the `deploy` role.

Create one in CanaryRoll under **Team Settings > API Tokens**.

Store it as a GitHub Actions secret (e.g. `CANARYROLL_TOKEN`).

## Waiting for completion

> **Warning:** Using `wait: true` keeps the GitHub Actions runner active for the entire duration of the rollout. Depending on your rollout plan, this could be minutes to hours. This will count against your GitHub Actions usage and may increase your bill. We strongly recommend using [notifications](#notifications) instead.

```yaml
- uses: canaryroll/action@v1
  id: rollout
  with:
    api-token: ${{ secrets.CANARYROLL_TOKEN }}
    team-id: my-team
    worker-id: ${{ vars.CANARYROLL_WORKER_ID }}
    version-id: ${{ steps.deploy.outputs.version-id }}
    auto-start: 'true'
    wait: 'true'
    wait-timeout: '3600'

- run: echo "Release ${{ steps.rollout.outputs.release-id }} finished with status ${{ steps.rollout.outputs.status }}"
```

## Development

```bash
npm install
npm run build    # Compile with ncc
npm run typecheck
```
