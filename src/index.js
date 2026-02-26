const express = require("express");
const { PrismaClient } = require("@prisma/client");
require("dotenv").config();

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

const app = express();
app.use(express.json());

app.post("/identify", async (req, res) => {
  const { email, phoneNumber } = req.body || {};

  if (!email && !phoneNumber) {
    return res
      .status(400)
      .json({ error: "Either email or phoneNumber must be provided" });
  }

  try {
    let responsePayload;

    await prisma.$transaction(async (tx) => {
      const whereClauses = [];
      if (email) whereClauses.push({ email });
      if (phoneNumber) whereClauses.push({ phoneNumber });

      const existingContacts =
        whereClauses.length === 0
          ? []
          : await tx.contact.findMany({
              where: { OR: whereClauses },
              orderBy: { createdAt: "asc" },
            });

      let primaryContact;

      if (existingContacts.length === 0) {
        primaryContact = await tx.contact.create({
          data: {
            email: email || null,
            phoneNumber: phoneNumber || null,
            linkPrecedence: "primary",
          },
        });
      } else {
        const primaryCandidates = existingContacts.filter(
          (c) => c.linkPrecedence === "primary" && c.linkedId === null
        );

        if (primaryCandidates.length === 0) {
          primaryContact = existingContacts[0];
        } else {
          primaryCandidates.sort(
            (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
          );
          primaryContact = primaryCandidates[0];

          const otherPrimaries = primaryCandidates.slice(1);
          for (const other of otherPrimaries) {
            if (other.id === primaryContact.id) continue;

            await tx.contact.update({
              where: { id: other.id },
              data: {
                linkPrecedence: "secondary",
                linkedId: primaryContact.id,
              },
            });

            await tx.contact.updateMany({
              where: { linkedId: other.id },
              data: { linkedId: primaryContact.id },
            });
          }
        }

        const existingEmails = new Set(
          existingContacts.map((c) => c.email).filter(Boolean)
        );
        const existingPhones = new Set(
          existingContacts.map((c) => c.phoneNumber).filter(Boolean)
        );

        const hasNewEmail = email && !existingEmails.has(email);
        const hasNewPhone = phoneNumber && !existingPhones.has(phoneNumber);

        if (hasNewEmail || hasNewPhone) {
          await tx.contact.create({
            data: {
              email: email || null,
              phoneNumber: phoneNumber || null,
              linkPrecedence: "secondary",
              linkedId: primaryContact.id,
            },
          });
        }
      }

      const allContacts = await tx.contact.findMany({
        where: {
          OR: [{ id: primaryContact.id }, { linkedId: primaryContact.id }],
        },
        orderBy: { id: "asc" },
      });

      const emails = [];
      const emailSet = new Set();
      const phoneNumbers = [];
      const phoneSet = new Set();

      if (primaryContact.email && !emailSet.has(primaryContact.email)) {
        emails.push(primaryContact.email);
        emailSet.add(primaryContact.email);
      }
      if (
        primaryContact.phoneNumber &&
        !phoneSet.has(primaryContact.phoneNumber)
      ) {
        phoneNumbers.push(primaryContact.phoneNumber);
        phoneSet.add(primaryContact.phoneNumber);
      }

      for (const contact of allContacts) {
        if (contact.id === primaryContact.id) continue;
        if (contact.email && !emailSet.has(contact.email)) {
          emails.push(contact.email);
          emailSet.add(contact.email);
        }
        if (contact.phoneNumber && !phoneSet.has(contact.phoneNumber)) {
          phoneNumbers.push(contact.phoneNumber);
          phoneSet.add(contact.phoneNumber);
        }
      }

      const secondaryContactIds = allContacts
        .filter((c) => c.id !== primaryContact.id)
        .map((c) => c.id)
        .sort((a, b) => a - b);

      responsePayload = {
        contact: {
          primaryContatctId: primaryContact.id,
          emails,
          phoneNumbers,
          secondaryContactIds,
        },
      };
    });

    return res.status(200).json(responsePayload);
  } catch (err) {
    console.error("Error in /identify:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

