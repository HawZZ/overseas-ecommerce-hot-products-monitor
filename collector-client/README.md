# Shopee Taiwan CDP Collector

Runs only on a user's macOS with Node 20 and a visible, dedicated Chrome profile. It observes public `search_items` responses produced by that profile and uploads normalized product fields to the local monitor API.

## Setup

```bash
cd collector-client
npm install
node collector.mjs init --api https://your-tunnel.example
```

Complete language, login, or platform verification manually in the opened Chrome window. In the monitor's `风险/API` page, create a pairing code, then run:

```bash
node collector.mjs pair --code twc_...
node collector.mjs run
node collector.mjs install-launchd
```

`launchd` runs once every 12 hours. Before pairing or uploading, the client reads the current public Pages `config.json` and checks the new Tunnel health, so a temporary Tunnel rotation does not require editing the Mac config. `uninstall-launchd` revokes only the local schedule; revoke the client from the dashboard to invalidate its token.

The client binds Chrome remote debugging to `127.0.0.1`, keeps the scoped token in `~/.config/shopee-tw-cdp-collector/config.json` (0600), and never stores dashboard credentials, cookies, request headers, or raw responses. It stops rather than bypassing verification, rate limiting, or response changes.
