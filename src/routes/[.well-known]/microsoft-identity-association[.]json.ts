// Proof for Microsoft that nimbea.app belongs to the Outlook calendar app registration (its publisher
// domain on the consent screen). The application id is public; no secret here.
import { createFileRoute } from "@tanstack/react-router";

const OUTLOOK_APPLICATION_ID = "140754d0-5ae5-4364-a10b-5071ce31f84c";

export const Route = createFileRoute("/.well-known/microsoft-identity-association.json")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify({ associatedApplications: [{ applicationId: OUTLOOK_APPLICATION_ID }] }), {
          headers: { "Content-Type": "application/json" },
        }),
    },
  },
});
