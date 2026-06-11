import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

// BLUEPRINT MIRROR API
// Mirrors blueprint images horizontally, vertically, or both.
// The flip only affects the image pixels; any text/labels rendered
// separately on the client are NOT affected — only the base image is flipped.
// INPUT : multipart/form-data with:
//   - files[]     : one or more PNG/JPEG/WEBP files
//   - direction   : "horizontal" | "vertical" | "both"
// OUTPUT: JSON array of { name, dataUrl } — base64-encoded PNGs

export async function POST(request: NextRequest) {
	try {
		const formData = await request.formData();
		const direction = (formData.get("direction") as string) ?? "horizontal";
		const files = formData.getAll("files") as File[];

		if (!files || files.length === 0) {
			return NextResponse.json({ error: "No files provided" }, { status: 400 });
		}

		if (!["horizontal", "vertical", "both"].includes(direction)) {
			return NextResponse.json(
				{ error: "Invalid direction. Use horizontal, vertical, or both." },
				{ status: 400 }
			);
		}

		const results: { name: string; dataUrl: string; width: number; height: number }[] = [];

		for (const file of files) {
			const buffer = Buffer.from(await file.arrayBuffer());

			let pipeline = sharp(buffer);

			// sharp.flip()  → vertical flip (flip over the horizontal axis = upside-down)
			// sharp.flop()  → horizontal flip (mirror left-right)
			if (direction === "horizontal") {
				pipeline = pipeline.flop();
			} else if (direction === "vertical") {
				pipeline = pipeline.flip();
			} else {
				// both
				pipeline = pipeline.flop().flip();
			}

			const { data, info } = await pipeline
				.png()
				.toBuffer({ resolveWithObject: true });

			const base64 = data.toString("base64");
			results.push({
				name: file.name,
				dataUrl: `data:image/png;base64,${base64}`,
				width: info.width,
				height: info.height,
			});
		}

		return NextResponse.json({ results });
	} catch (error) {
		console.error("[/api/blueprint-mirror] Error:", error);
		return NextResponse.json({ error: "Failed to process images" }, { status: 500 });
	}
}
