import Link from "next/link";

export default function NotFound() {
  return (
    <section
      aria-labelledby="not-found-heading"
      className="flex min-h-svh items-center justify-center bg-background px-4 text-foreground"
    >
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <h1 className="type-product-title" id="not-found-heading">
          404
        </h1>
        <p className="type-supporting-body text-muted-foreground">
          This page could not be found.
        </p>
        <Link
          className="type-label text-information underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
          href="/"
        >
          Return to workspace
        </Link>
      </div>
    </section>
  );
}
