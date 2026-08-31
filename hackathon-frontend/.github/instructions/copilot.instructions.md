# Project Coding Standards

## Code Quality

- Review across five axes: correctness, readability, architecture, security, performance
- No secrets in code or version control

## Implementation

- Build in small, verifiable increments
- Each increment: implement → verify → commit
- Never mix formatting changes with behavior changes
- Run `npm run build` to verify changes compile before committing

## Boundaries

- Always: Validate user input, verify the build succeeds
- Ask first: Database schema changes, new dependencies
- Never: Commit secrets, skip verification

# RTK — Token-Optimized CLI

**rtk** is a CLI proxy that filters and compresses command outputs, saving 60-90% tokens.

## Rule

Always prefix shell commands with `rtk`:

```bash
# Instead of:              Use:
git status                 rtk git status
git log -10                rtk git log -10
cargo test                 rtk cargo test
docker ps                  rtk docker ps
kubectl get pods           rtk kubectl pods
```

## Meta commands (use directly)

```bash
rtk gain              # Token savings dashboard
rtk gain --history    # Per-command savings history
rtk discover          # Find missed rtk opportunities
rtk proxy <cmd>       # Run raw (no filtering) but track usage
```
