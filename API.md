# API reference

Generated from `openapi.json`. Request and response fields are described in that contract.

| Method | HTTP | Description |
| --- | --- | --- |
| `createSignup` | `POST /signup` | Create an account |
| `checkSlugAvailability` | `GET /signup/check-slug` | Check if an account slug is available |
| `getAccount` | `GET /account` | Get account stats |
| `deleteAccount` | `DELETE /account` | Delete account permanently |
| `sendWelcomeEmail` | `POST /account/welcome` | Send the welcome email |
| `setPostVerifyTarget` | `POST /account/post-verify-target` | Resolve post-verification target |
| `listApiKeys` | `GET /api-keys` | List API keys |
| `createApiKey` | `POST /api-keys` | Create an API key |
| `revokeApiKey` | `DELETE /api-keys/{id}` | Revoke an API key |
| `listMailboxes` | `GET /mailboxes` | List mailboxes |
| `createMailbox` | `POST /mailboxes` | Create a mailbox |
| `getMailbox` | `GET /mailboxes/{id}` | Get a mailbox |
| `updateMailbox` | `PATCH /mailboxes/{id}` | Update a mailbox |
| `deleteMailbox` | `DELETE /mailboxes/{id}` | Delete a mailbox |
| `listMessages` | `GET /mailboxes/{id}/messages` | List messages in a mailbox |
| `sendMessage` | `POST /mailboxes/{id}/messages` | Send an email from a mailbox |
| `getMessage` | `GET /mailboxes/{id}/messages/{msgId}` | Get a message |
| `listThreads` | `GET /mailboxes/{id}/threads` | List threads in a mailbox |
| `getThread` | `GET /mailboxes/{id}/threads/{tid}` | Get a thread with its messages |
| `uploadAttachment` | `POST /attachments` | Upload an attachment |
| `downloadAttachment` | `GET /attachments/{id}` | Get an attachment download URL |
| `deleteAttachment` | `DELETE /attachments/{id}` | Delete an attachment |
| `listDomains` | `GET /domains` | List custom domains |
| `createDomain` | `POST /domains` | Add a custom domain |
| `getDomain` | `GET /domains/{id}` | Get a domain and its DNS records |
| `deleteDomain` | `DELETE /domains/{id}` | Delete a domain |
| `verifyDomain` | `POST /domains/{id}/verify` | Trigger domain verification |
| `listWebhooks` | `GET /webhooks` | List webhooks |
| `createWebhook` | `POST /webhooks` | Create a webhook |
| `getWebhook` | `GET /webhooks/{id}` | Get a webhook |
| `updateWebhook` | `PATCH /webhooks/{id}` | Update a webhook |
| `deleteWebhook` | `DELETE /webhooks/{id}` | Delete a webhook |
| `listWebhookDeliveries` | `GET /webhooks/{id}/deliveries` | List webhook deliveries |
| `streamEvents` | `GET /events` | Stream inbox events over SSE |
| `listSuppressions` | `GET /suppressions` | List suppressed addresses |
| `createSuppression` | `POST /suppressions` | Suppress an address |
| `deleteSuppression` | `DELETE /suppressions/{id}` | Remove a suppression entry |
| `createUpgradeCheckout` | `POST /billing/upgrade` | Start a plan upgrade |
| `resendVerificationEmail` | `POST /auth/resend-verification` | Resend the email verification link |
| `submitSupportTicket` | `POST /support` | Contact support |
