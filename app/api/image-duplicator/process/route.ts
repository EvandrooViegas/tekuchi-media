import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

type CsvRow = {
	originalId: string;
	copyId: string;
};

type DuplicationResult = {
	originalId: string;
	copyId: string;
	originalFile: string;
	status: "success" | "missing" | "error";
	error?: string;
};

async function parseCSV(content: string): Promise<CsvRow[]> {
	const lines = content.trim().split("\n");
	return lines
		.map(line => {
			const [originalId, copyId] = line.split(",").map(s => s.trim());
			return { originalId, copyId };
		})
		.filter(row => row.originalId && row.copyId);
}

async function createZipFromFolder(folderPath: string): Promise<Buffer> {
	const { default: archiver } = await import("archiver");
	const fs = await import("fs/promises");
	return new Promise((resolve, reject) => {
		const archive = archiver("zip", { zlib: { level: 9 } });
		const chunks: Buffer[] = [];

		archive.on("data", (chunk: Buffer) => chunks.push(chunk));
		archive.on("end", () => resolve(Buffer.concat(chunks)));
		archive.on("error", reject);

		// Add only image files, exclude CSV
		const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".heic", ".heif"];
		archive.glob("**/*", {
			cwd: folderPath,
			ignore: ["**/*.csv"],
			filter: (filepath: string) => {
				const ext = filepath.toLowerCase().substring(filepath.lastIndexOf("."));
				return imageExtensions.includes(ext);
			},
		} as any);

		archive.finalize();
	});
}

export async function POST(request: NextRequest) {
	try {
		const formData = await request.formData();
		const csvFile = formData.get("csv") as File;

		if (!csvFile) {
			return NextResponse.json({ error: "CSV file is required" }, { status: 400 });
		}

		const csvContent = await csvFile.text();
		const csvRows = await parseCSV(csvContent);

		if (csvRows.length === 0) {
			return NextResponse.json({ error: "CSV file is empty or invalid" }, { status: 400 });
		}

		// Collect all uploaded images by filename (case-insensitive)
		const uploadedImages = new Map<string, { buffer: Buffer; extension: string; originalName: string }>();
		let fileIndex = 0;

		while (true) {
			const imageFile = formData.get(`image_${fileIndex}`) as File | null;
			if (!imageFile) break;

			const buffer = await imageFile.arrayBuffer();
			const ext = imageFile.name.split(".").pop()?.toLowerCase() || "";
			const nameParts = imageFile.name.split(".");
			const baseName = nameParts.length > 1 ? nameParts.slice(0, -1).join(".") : imageFile.name;

			uploadedImages.set(baseName.toLowerCase(), {
				buffer: Buffer.from(buffer),
				extension: ext,
				originalName: imageFile.name,
			});
			fileIndex++;
		}

		if (uploadedImages.size === 0) {
			return NextResponse.json({ error: "No images uploaded" }, { status: 400 });
		}

		// Create output folder
		const tempDir = path.join(process.cwd(), "public", "temp", `duplicated_${Date.now()}`);
		await mkdir(tempDir, { recursive: true });

		// First, save all original images
		const savedOriginals = new Set<string>();
		for (const [baseName, imageData] of uploadedImages) {
			try {
				const ext = imageData.extension ? `.${imageData.extension}` : "";
				const outputFileName = `${imageData.originalName}`;
				const outputPath = path.join(tempDir, outputFileName);

				await writeFile(outputPath, imageData.buffer);
				savedOriginals.add(baseName.toLowerCase());
			} catch (error) {
				console.error(`Failed to save original image ${imageData.originalName}:`, error);
			}
		}

		// Process each CSV row
		const results: DuplicationResult[] = [];
		let successCount = 0;
		let failCount = 0;

		for (const row of csvRows) {
			const originalLower = row.originalId.toLowerCase();
			const imageData = uploadedImages.get(originalLower);

			if (!imageData) {
				results.push({
					originalId: row.originalId,
					copyId: row.copyId,
					originalFile: `${row.originalId}.*`,
					status: "missing",
					error: "Original image file not found",
				});
				failCount++;
				continue;
			}

			try {
				const ext = imageData.extension ? `.${imageData.extension}` : "";
				const outputFileName = `${row.copyId}${ext}`;
				const outputPath = path.join(tempDir, outputFileName);

				await writeFile(outputPath, imageData.buffer);

				results.push({
					originalId: row.originalId,
					copyId: row.copyId,
					originalFile: imageData.originalName,
					status: "success",
				});
				successCount++;
			} catch (error) {
				results.push({
					originalId: row.originalId,
					copyId: row.copyId,
					originalFile: imageData.originalName,
					status: "error",
					error: error instanceof Error ? error.message : "Unknown error",
				});
				failCount++;
			}
		}

		// Create ZIP (with whatever files exist, even if some are missing)
		const zipBuffer = await createZipFromFolder(tempDir);

		// Create data URL for download
		const base64 = zipBuffer.toString("base64");
		const downloadUrl = `data:application/zip;base64,${base64}`;

		return NextResponse.json({
			success: successCount > 0,
			totalMappings: csvRows.length,
			successfulCopies: successCount,
			failedCopies: failCount,
			results,
			downloadUrl,
		});
	} catch (error) {
		console.error("Processing error:", error);
		return NextResponse.json(
			{ error: "Failed to process files" },
			{ status: 500 }
		);
	}
}
