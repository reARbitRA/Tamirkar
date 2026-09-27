# Security policy

## Supported versions

Only the latest commit on `main` and an explicitly tagged production release are supported. Do not report vulnerabilities through public GitHub issues.

## Reporting a vulnerability

Email **security@oosta.app** with a concise reproduction, impact assessment, and a safe contact method. If that mailbox has not been configured yet, contact the repository owner privately through GitHub and write `SECURITY: private report` in the subject.

We aim to acknowledge reports within **3 business days**, provide an initial assessment within **10 business days**, and coordinate a fix before disclosure. Please do not access, alter, exfiltrate, or delete user data; do not send SMS or payment requests to real users while testing.

## Secrets and operational incidents

If a server credential is exposed: revoke it at the provider, rotate the deployed secret, invalidate affected sessions if appropriate, preserve logs, and open a private incident record. Never add the replacement secret to Git or an Android build.
