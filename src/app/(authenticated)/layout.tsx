import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import joryWordmark from "../../../docs/design/assets/jory-wordmark-color.svg";
import joryAvatar from "../../../docs/design/assets/jory-avatar_clay.webp";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { requireRequestScope, UnauthenticatedError } from "@/lib/request-scope";
import { isAdmin } from "@/lib/admin";
import { TRPCProvider } from "@/trpc/client";
import { AuthenticatedAccountControl } from "./_components/account-control";
import {
  AuthenticatedMobileHeader,
  AuthenticatedNavigation,
} from "./_components/authenticated-navigation";

export default async function AuthenticatedLayout({
  children,
}: LayoutProps<"/">) {
  try {
    await requireRequestScope();
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/sign-in");
    throw error;
  }
  const admin = await isAdmin();

  return (
    <TRPCProvider>
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  aria-label="Jory"
                  size="lg"
                  className="items-center gap-3 py-1.5"
                  render={<Link href="/" />}
                >
                  <Image
                    src={joryAvatar}
                    alt=""
                    width={36}
                    height={36}
                    className="size-9 shrink-0 rounded-full bg-muted object-contain p-0.5"
                  />
                  {/* Next intentionally types SVG imports as `any`; this is the reviewed local wordmark. */}
                  {/* oxlint-disable-next-line typescript/no-unsafe-assignment */}
                  <Image src={joryWordmark} alt="" className="h-6 w-auto" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent>
            <AuthenticatedNavigation isAdmin={admin} />
          </SidebarContent>
          <SidebarFooter>
            <AuthenticatedAccountControl />
          </SidebarFooter>
        </Sidebar>
        <SidebarInset className="h-svh overflow-y-auto">
          <AuthenticatedMobileHeader isAdmin={admin} />
          {children}
        </SidebarInset>
      </SidebarProvider>
    </TRPCProvider>
  );
}
