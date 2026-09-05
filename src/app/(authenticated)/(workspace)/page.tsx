import {
  BotIcon,
  CloudIcon,
  ImageIcon,
  MailIcon,
  StoreIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  getTokenResponse,
  NoValidTokenError,
  UserAuthorizationRequiredError,
} from "@vercel/connect";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { getGatewayModel } from "@/db/services/settings";
import { env } from "@/env";
import { googleWorkspaceTokenParams } from "@/lib/google-workspace";
import { requireRequestScope } from "@/lib/request-scope";
import { squareTokenParams } from "@/lib/square";
import { GoogleWorkspaceAction } from "./_components/google-workspace-action";
import { ChannelsSection } from "./_components/channels-section";
import { ModelSelector } from "./_components/model-selector";
import { SquareAction } from "./_components/square-action";

export default async function Page({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const google = params.google;
  const square = params.square;
  const scope = await requireRequestScope();
  const [googleWorkspace, squareConnection, gatewayModel] = await Promise.all([
    readGoogleWorkspaceConnection(scope.userId),
    readSquareConnection(scope.userId),
    getGatewayModel(scope),
  ]);
  const browserReady = true;
  const imageStorageReady = Boolean(
    env.BLOB_STORE_ID ?? env.BLOB_READ_WRITE_TOKEN
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="sr-only">Workspace</h1>

      {google === "unavailable" ? (
        <Alert>
          <MailIcon />
          <AlertTitle>Google Workspace unavailable</AlertTitle>
          <AlertDescription>
            This deployment does not have a working Google OAuth connector yet.
          </AlertDescription>
        </Alert>
      ) : null}

      {square === "unavailable" ? (
        <Alert>
          <StoreIcon />
          <AlertTitle>Square unavailable</AlertTitle>
          <AlertDescription>
            This deployment does not have a working Square OAuth connector yet.
          </AlertDescription>
        </Alert>
      ) : null}

      <ChannelsSection
        browserReady={browserReady}
        linqConfigured={env.LINQ_CONNECTOR !== undefined}
        linqPhoneNumber={env.LINQ_PHONE_NUMBER}
      />
      <ConnectionsSection google={googleWorkspace} square={squareConnection} />

      <details className="space-y-3">
        <summary className="type-section-title cursor-pointer underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
          Setup details
        </summary>
        <div className="space-y-6 rounded-xl border border-border/50 p-4 sm:p-5">
          <p className="type-caption text-muted-foreground">
            Deployment admins can attach the Google and Square OAuth connectors
            in Vercel Connect. Then connect your account here.
          </p>
          <WorkspaceSection
            headingId="connectors-heading"
            title="Infrastructure"
          >
            <div className="divide-y divide-border/50 border-y border-border/50">
              <ConnectorRow
                action={<Badge variant="success">Connected</Badge>}
                description="Run isolated browsers in your Kernel account."
                icon={<CloudIcon />}
                label="Kernel browser"
              />
              <ConnectorRow
                action={
                  <Badge variant={imageStorageReady ? "success" : "secondary"}>
                    {imageStorageReady ? "Connected" : "Setup required"}
                  </Badge>
                }
                description={
                  imageStorageReady
                    ? "Store browser images in a private Vercel Blob store."
                    : "Connect a private Vercel Blob store to share browser images."
                }
                icon={<ImageIcon />}
                label="Vercel Blob"
              />
            </div>
          </WorkspaceSection>
        </div>
      </details>

      <WorkspaceSection headingId="model-heading" title="Model">
        <div className="border-y border-border/50">
          <ConnectorRow
            action={<ModelSelector modelId={gatewayModel} />}
            description={gatewayModel}
            icon={<BotIcon />}
            label="AI Gateway model"
          />
        </div>
      </WorkspaceSection>
    </div>
  );
}

function ConnectionsSection({
  google,
  square,
}: {
  readonly google?: GoogleWorkspaceConnection;
  readonly square?: SquareConnection;
}) {
  const googleState = google?.state;
  const googleDescription =
    googleState === "connected"
      ? (google?.accountLabel ?? "Gmail, Calendar, and Contacts connected.")
      : googleState === "unavailable"
        ? "Gmail, Calendar, and Contacts."
        : "Gmail, Calendar, and Contacts through your Google account.";

  const squareState = square?.state;
  const squareDescription =
    squareState === "connected"
      ? "Square account connected."
      : squareState === "unavailable"
        ? "Locations, items, customers, and orders."
        : "Locations, items, customers, and orders from your Square account.";

  return (
    <WorkspaceSection headingId="connections-heading" title="Connections">
      <div className="divide-y divide-border/50 border-y border-border/50">
        <ConnectorRow
          action={<GoogleWorkspaceAction state={googleState} />}
          description={googleDescription}
          icon={<MailIcon />}
          label="Google Workspace"
        />
        <ConnectorRow
          action={<SquareAction state={squareState} />}
          description={squareDescription}
          icon={<StoreIcon />}
          label="Square"
        />
      </div>
    </WorkspaceSection>
  );
}

interface GoogleWorkspaceConnection {
  readonly accountLabel: string | null;
  readonly state: "connected" | "disconnected" | "unavailable";
}

async function readGoogleWorkspaceConnection(
  userId: string
): Promise<GoogleWorkspaceConnection> {
  try {
    const response = await getTokenResponse(
      env.GOOGLE_CONNECTOR_UID,
      googleWorkspaceTokenParams(userId),
      { forceRefresh: true }
    );
    const claims = z
      .object({ email: z.string().optional() })
      .safeParse(response.claims);
    return {
      accountLabel:
        response.name ?? (claims.success ? (claims.data.email ?? null) : null),
      state: "connected",
    };
  } catch (error) {
    if (
      error instanceof UserAuthorizationRequiredError ||
      error instanceof NoValidTokenError
    ) {
      return { accountLabel: null, state: "disconnected" };
    }
    return { accountLabel: null, state: "unavailable" };
  }
}

interface SquareConnection {
  readonly state: "connected" | "disconnected" | "unavailable";
}

async function readSquareConnection(userId: string): Promise<SquareConnection> {
  if (!env.SQUARE_CONNECTOR_UID) {
    return { state: "unavailable" };
  }
  try {
    await getTokenResponse(
      env.SQUARE_CONNECTOR_UID,
      squareTokenParams(userId),
      {
        forceRefresh: true,
      }
    );
    return { state: "connected" };
  } catch (error) {
    if (
      error instanceof UserAuthorizationRequiredError ||
      error instanceof NoValidTokenError
    ) {
      return { state: "disconnected" };
    }
    return { state: "unavailable" };
  }
}

function WorkspaceSection({
  children,
  headingId,
  title,
}: {
  readonly children: ReactNode;
  readonly headingId: string;
  readonly title: string;
}) {
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 className="type-section-title" id={headingId}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function ConnectorRow({
  action,
  description,
  icon,
  label,
}: {
  readonly action: ReactNode;
  readonly description: string;
  readonly icon: ReactNode;
  readonly label: string;
}) {
  return (
    <div className="flex items-center gap-3 py-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50 text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="type-label">{label}</p>
        <p className="type-caption text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
