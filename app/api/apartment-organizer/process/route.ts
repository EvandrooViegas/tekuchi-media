import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

type CsvRow = {
	apartment: string;
	imageFile: string;
};

type ValidationResult = {
	apartment: string;
	imageFile: string;
	exists: boolean;
};

async function parseCSV(content: string): Promise<CsvRow[]> {
	const lines = content.trim().split("\n");
	return lines.map(line => {
		const [apartment, imageFile] = line.split(",").map(s => s.trim());
		return { apartment, imageFile };
	}).filter(row => row.apartment && row.imageFile);
}

async function createZipFromFolder(folderPath: string): Promise<Buffer> {
	const { default: archiver } = await import("archiver");
	return new Promise((resolve, reject) => {
		const archive = archiver("zip", { zlib: { level: 9 } });
		const chunks: Buffer[] = [];

		archive.on("data", (chunk: Buffer) => chunks.push(chunk));
		archive.on("end", () => resolve(Buffer.concat(chunks)));
		archive.on("error", reject);

		archive.directory(folderPath, "apartments");
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
		const uploadedImages = new Map<string, Buffer>();
		let fileIndex = 0;

		while (true) {
			const imageFile = formData.get(`image_${fileIndex}`) as File | null;
			if (!imageFile) break;

			const buffer = await imageFile.arrayBuffer();
			uploadedImages.set(imageFile.name.toLowerCase(), {
				name: imageFile.name,
				buffer: Buffer.from(buffer),
			} as any);
			fileIndex++;
		}

		if (uploadedImages.size === 0) {
			return NextResponse.json({ error: "No images uploaded" }, { status: 400 });
		}

		// Validate CSV against uploaded images
		const validationResults: ValidationResult[] = [];
		const warnings: string[] = [];

		for (const row of csvRows) {
			const imageLower = row.imageFile.toLowerCase();
			const exists = uploadedImages.has(imageLower);

			validationResults.push({
				apartment: row.apartment,
				imageFile: row.imageFile,
				exists,
			});

			if (!exists) {
				warnings.push(`Apartment ${row.apartment}: Image "${row.imageFile}" not found in uploads`);
			}
		}

		// Check if we have any critical errors (missing images)
		const hasErrors = validationResults.some(r => !r.exists);

		if (hasErrors) {
			return NextResponse.json({
				success: false,
				validationResults,
				warnings,
				totalApartments: new Set(csvRows.map(r => r.apartment)).size,
				totalImages: validationResults.length,
			});
		}

		// Create output folder structure
		const tempDir = path.join(process.cwd(), "public", "temp", `apartments_${Date.now()}`);
		await mkdir(tempDir, { recursive: true });

		// Group by apartment
		const apartmentMap = new Map<string, Set<string>>();
		for (const row of csvRows) {
			if (!apartmentMap.has(row.apartment)) {
				apartmentMap.set(row.apartment, new Set());
			}
			apartmentMap.get(row.apartment)!.add(row.imageFile.toLowerCase());
		}

		// Copy images to apartment folders
		for (const [apartment, imageNames] of apartmentMap) {
			const apartmentDir = path.join(tempDir, `apartment_${apartment}`);
			await mkdir(apartmentDir, { recursive: true });

			for (const imageName of imageNames) {
				const imageData = uploadedImages.get(imageName);
				if (!imageData) continue;

				const destPath = path.join(apartmentDir, imageData.name);
				await writeFile(destPath, imageData.buffer);
			}
		}

		// Create ZIP
		const zipBuffer = await createZipFromFolder(tempDir);

		// Create data URL for download
		const base64 = zipBuffer.toString("base64");
		const downloadUrl = `data:application/zip;base64,${base64}`;

		return NextResponse.json({
			success: !hasErrors,
			validationResults,
			warnings,
			totalApartments: apartmentMap.size,
			totalImages: validationResults.length,
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
