## Bitespeed Identify Service

Node.js + Express + Prisma (SQLite) implementation of the `/identify` endpoint for consolidating customer contacts, as described in the Bitespeed/FluxKart problem.

### How it works

- **Database model**: `Contact` table with fields `id`, `email`, `phoneNumber`, `linkedId`, `linkPrecedence` (`"primary"` or `"secondary"`), timestamps, and soft-delete `deletedAt`.
- **Linking logic**:
  - Contacts are linked if they share an `email` or `phoneNumber`.
  - The **oldest** contact in a linked group is the **primary**; all others are **secondary** and point to it via `linkedId`.
  - If a request connects two different primaries (same `email`/`phoneNumber` pair seen before), the newer primary is demoted to secondary and all its secondaries are re-linked to the oldest primary.
  - If a request brings **new information** (new email or phone) that still matches an existing contact by the other field, a new **secondary** row is created and linked to the primary.

### Tech stack

- Node.js (CommonJS)
- Express
- Prisma ORM 7.x
- SQLite (file `dev.db`)

### Setup

From the project root (`d:\\assign`):

```bash
npm install
```

Prisma is already initialized and the initial migration is applied. If you ever need to recreate the database from scratch:

```bash
rm dev.db              # or delete the file manually on Windows
npx prisma migrate dev --name init
```

### Run the service

```bash
npm run dev
```

The server starts on `http://localhost:3000`.

### `/identify` endpoint

- **Method**: `POST`
- **URL**: `/identify`
- **Body**:

```json
{
  "email": "optional-string-or-null",
  "phoneNumber": "optional-string-or-null"
}
```

At least one of `email` or `phoneNumber` must be non-null/non-empty.

### Response format

On success (`200 OK`), the response has the shape:

```json
{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["primary@example.com", "other@example.com"],
    "phoneNumbers": ["123456", "789000"],
    "secondaryContactIds": [23, 24]
  }
}
```

> Note: The field name `primaryContatctId` intentionally preserves the original typo from the problem statement for compatibility.

### Example flows

1. **First-time customer**

Request:

```json
{
  "email": "lorraine@hillvalley.edu",
  "phoneNumber": "123456"
}
```

Result:

- A new **primary** `Contact` row is created with that email and phone.
- `emails` and `phoneNumbers` each contain a single value.
- `secondaryContactIds` is an empty array.

2. **Same phone, new email → secondary contact**

Second request:

```json
{
  "email": "mcfly@hillvalley.edu",
  "phoneNumber": "123456"
}
```

Result:

- A new **secondary** row is created.
- Response consolidates:
  - `primaryContatctId`: the id of the oldest contact.
  - `emails`: `["lorraine@hillvalley.edu", "mcfly@hillvalley.edu"]`
  - `phoneNumbers`: `["123456"]`
  - `secondaryContactIds`: `[<id-of-secondary>]`

3. **Merging two primaries**

If you already had:

- `george@hillvalley.edu` + `919191` (primary A)
- `biffsucks@hillvalley.edu` + `717171` (primary B)

Then you call:

```json
{
  "email": "george@hillvalley.edu",
  "phoneNumber": "717171"
}
```

The older primary becomes the canonical primary, the newer one becomes secondary, and future responses for any overlapping email/phone in this group will always point to the **oldest** primary and return the union of all emails/phones, with secondary IDs listed.

