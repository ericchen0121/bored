import { ImageResponse } from "next/og";
import { loadOgFonts } from "@/lib/og-assets";

/** Brand mark: cream "b" + amber "." in Fraunces, on site dark. */
export async function brandMarkIcon(size: number, fontSize: number) {
  const fonts = await loadOgFonts();
  const fraunces = fonts.filter((f) => f.name === "Fraunces");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0c1218",
          color: "#f2ebe0",
          fontFamily: "Fraunces",
          fontSize,
          fontWeight: 700,
          letterSpacing: "-0.05em",
          lineHeight: 1,
          paddingBottom: Math.round(size * 0.04),
        }}
      >
        <span>b</span>
        <span style={{ color: "#e8a54b" }}>.</span>
      </div>
    ),
    {
      width: size,
      height: size,
      fonts: fraunces,
    },
  );
}
