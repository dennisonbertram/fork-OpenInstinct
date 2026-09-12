import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { NextConfig } from "next";
import { withEve } from "eve/next";
import { z } from "zod";

interface BuildIdentityMetadata {
  readonly evePatchDeclaration: string;
  readonly evePatchSha256: string;
  readonly eveVersion: string;
  readonly lockSha256: string;
}

export const buildIdentityMetadata = readBuildIdentityMetadata();
export const buildIdentityEnvironment = {
  OPENINSTINCT_BUILD_EVE_PATCH_DECLARATION:
    buildIdentityMetadata.evePatchDeclaration,
  OPENINSTINCT_BUILD_EVE_PATCH_SHA256: buildIdentityMetadata.evePatchSha256,
  OPENINSTINCT_BUILD_EVE_VERSION: buildIdentityMetadata.eveVersion,
  OPENINSTINCT_BUILD_LOCK_SHA256: buildIdentityMetadata.lockSha256,
};

const nextConfig: NextConfig = {
  // These are non-secret source-build inputs. Next replaces configured env
  // values while building; the target probe therefore does not read checkout
  // files after deployment.
  env: buildIdentityEnvironment,
};

export default withEve(nextConfig);

function readBuildIdentityMetadata(): BuildIdentityMetadata {
  const workspace = readFileSync(
    new URL("./pnpm-workspace.yaml", import.meta.url),
    "utf8"
  );
  const declaration = /^\s{2}(eve@[^\s:]+):\s+(patches\/[^\s]+)\s*$/m.exec(
    workspace
  );
  if (!declaration?.[1] || !declaration[2]) {
    throw new Error("Expected Eve patchedDependencies declaration.");
  }

  const evePackage = z
    .object({ version: z.string().regex(/^\d+\.\d+\.\d+$/) })
    .parse(
      JSON.parse(
        readFileSync(
          new URL("./node_modules/eve/package.json", import.meta.url),
          "utf8"
        )
      )
    );

  return {
    evePatchDeclaration: declaration[1],
    evePatchSha256: sha256File(declaration[2]),
    eveVersion: evePackage.version,
    lockSha256: sha256File("pnpm-lock.yaml"),
  };
}

function sha256File(relativePath: string) {
  return createHash("sha256")
    .update(readFileSync(new URL(`./${relativePath}`, import.meta.url)))
    .digest("hex");
}
