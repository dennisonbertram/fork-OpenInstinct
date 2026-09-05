import { MessageSquareIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { listBrowserTraces } from "@/db/services/browser-traces";
import { requireRequestScope } from "@/lib/request-scope";
import { TraceHistory } from "./_components/trace-history";

export default async function TasksPage() {
  const scope = await requireRequestScope();
  let initialError: string | undefined;
  let initialPage;
  try {
    initialPage = await listBrowserTraces(scope);
  } catch (error) {
    console.error("Unable to read browser traces", error);
    initialError = "Unable to read the browser task history.";
  }
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="type-page-title">Tasks</h1>
          <p className="type-supporting-body mt-2 text-muted-foreground">
            Browser tasks are the history of work Jory has run: each task&apos;s
            status, duration, and domains touched.
          </p>
        </div>
        <Button
          nativeButton={false}
          render={<Link href="/chat" />}
          variant="outline"
        >
          Open chat
          <MessageSquareIcon data-icon="inline-end" />
        </Button>
      </header>

      <TraceHistory initialError={initialError} initialPage={initialPage} />
    </div>
  );
}
