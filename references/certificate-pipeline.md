# Ed25519 Certificate Pipeline

## Key Generation
- Generate Ed25519 key pair once per profile
- Private key: `~/.config/project-john/ed25519_private.pem` (chmod 0400)
- Public key: `~/.config/project-john/ed25519_public.pem`

## Certificate Signing Pipeline
1. **Build payload** (the "what" that gets signed):
   ```json
   {
     "ticket_type": "string",
     "ticket_id": "string",
     "score": number,
     "criteria_met": {"criterion_id": number},
     "rubric_hash": "sha256 hex"
   }
   ```
2. **Canonical JSON**: `json.dumps(payload, sort_keys=True, separators=(",", ":"))`
3. **Sign**: Ed25519 signature of payload bytes
4. **Store**: Save signed payload + signature to `certificates/<ticket_type>/<ticket_id>.json`
5. **Verification URL**: `/verify/{ticket_type}/{ticket_id}`

## Verification
```python
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

pub_key = Ed25519PublicKey.from_pem(open("ed25519_public.pem").read().encode())
payload = {...}
signature = base64.b64decode(signature_b64)
payload_bytes = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
pub_key.verify(signature, payload_bytes)  # Returns True if valid
```

## Certificate Format
```json
{
  "id": "uuid",
  "userId": "uuid",
  "labId": "uuid",
  "verificationId": "uuid",
  "earnedCriteria": "all_steps|majority|custom",
  "signedPayload": {
    "signature": "base64_encoded",
    "issuedAt": "ISO8601",
    "expiresAt": "ISO8601"
  },
  "expiryDate": "ISO8601",
  "createdAt": "ISO8601"
}
```

## Workflow
1. Certificate earned when scoring criteria met
2. Pipeline signs and stores certificate
3. Verification URL generated for public verification
4. Verification endpoint validates Ed25519 signature
5. Certificate revocation handled separately (out of scope)