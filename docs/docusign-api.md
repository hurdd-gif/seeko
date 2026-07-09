# DocuSign API signing

SEEKO external signing now uses DocuSign by default. The local
`external_signing_invites` row stays as the dashboard ledger, while DocuSign
owns the signing ceremony and emails the signer.

## Environment

Set these in `.env.local` and Render:

```bash
SIGNING_PROVIDER=docusign
DOCUSIGN_INTEGRATION_KEY=
DOCUSIGN_USER_ID=
DOCUSIGN_ACCOUNT_ID=
DOCUSIGN_PRIVATE_KEY=
DOCUSIGN_AUTH_BASE_URI=account-d.docusign.com
DOCUSIGN_REST_BASE_URI=https://demo.docusign.net/restapi
DOCUSIGN_CONNECT_HMAC_SECRET=
```

For production DocuSign, switch `DOCUSIGN_AUTH_BASE_URI` and
`DOCUSIGN_REST_BASE_URI` to the production account values.

`DOCUSIGN_PRIVATE_KEY` may be pasted with escaped newlines (`\n`); the runtime
normalizes it before signing the JWT.

## Connect webhook

Create a DocuSign Connect configuration that posts JSON envelope events to:

```text
https://<app-host>/api/external-signing/docusign-connect
```

Enable an HMAC secret and set the same value as `DOCUSIGN_CONNECT_HMAC_SECRET`.
The webhook stores the completed DocuSign PDF at:

```text
agreements/external/{invite_id}/agreement.pdf
```

## Rollback

Set this to temporarily use the previous internal SEEKO signing flow:

```bash
SIGNING_PROVIDER=internal
```
