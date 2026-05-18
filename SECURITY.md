# Security policy

## Supported versions

EinVault is a self-hosted application with a single supported release line: the latest tagged version on `main`. Older versions do not receive backported fixes.

## Reporting a vulnerability

Please report suspected vulnerabilities privately via GitHub's "Report a vulnerability" form on the repository's Security tab (<https://github.com/davefatkin/EinVault/security/advisories/new>).

If you cannot use GitHub Security Advisories, email the maintainer at <security@einvault.com> with the subject prefix `[EinVault security]`.

Please include:

- A description of the issue and its impact
- Steps to reproduce, or a proof-of-concept
- The affected version (commit SHA or release tag)
- Any suggested remediation, if you have one

You can expect an initial acknowledgement within 7 days. Please do not file public issues, pull requests, or discussions for unpatched vulnerabilities.

## Scope

In scope:

- Authentication and session handling (local password, OIDC)
- Authorization and role enforcement (admin, member, caretaker)
- Data exposure between users and across companions
- Server-side request handling, file upload, and image processing
- Supply-chain integrity of published container images and dependencies

Out of scope:

- Vulnerabilities in self-hosted deployments caused by misconfiguration of the surrounding environment (reverse proxy, TLS, OS, container runtime)
- Issues that require a pre-existing administrator account to exploit
- Denial of service that depends on uncapped resource limits the operator is expected to set (`UPLOAD_MAX_MB`, `MAX_DAILY_PHOTOS`, request rate-limiting at the reverse proxy)

## Verifying releases

Published container images at `ghcr.io/davefatkin/einvault` carry both an SLSA build provenance attestation (signed via Sigstore) and an SPDX SBOM, generated automatically by the release workflow.

To verify a release before pulling it into production:

```bash
# Verify SLSA provenance using the GitHub CLI:
gh attestation verify oci://ghcr.io/davefatkin/einvault:vX.Y.Z \
    --repo davefatkin/EinVault

# Inspect the SBOM bundled with the image:
docker buildx imagetools inspect \
    ghcr.io/davefatkin/einvault:vX.Y.Z \
    --format '{{ json .SBOM }}'
```

Pin deployments to a specific digest rather than a floating tag so that what you verified is what you run:

```yaml
image: ghcr.io/davefatkin/einvault@sha256:<digest from the verified manifest>
```
