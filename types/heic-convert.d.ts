declare module "heic-convert" {
  export default function convert(options: {
    readonly buffer: Uint8Array;
    readonly format: "JPEG" | "PNG";
    readonly quality?: number;
  }): Promise<Uint8Array>;
}
