"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Upload, AlertCircle, CheckCircle2, XCircle, Loader2 } from "lucide-react";

type DuplicationResult = {
	originalId: string;
	copyId: string;
	originalFile: string;
	status: "success" | "missing" | "error";
	error?: string;
};

type ProcessingResult = {
	success: boolean;
	totalMappings: number;
	successfulCopies: number;
	failedCopies: number;
	results: DuplicationResult[];
	downloadUrl?: string;
};

export default function ImageDuplicator() {
	const [csvFile, setCsvFile] = useState<File | null>(null);
	const [imageFiles, setImageFiles] = useState<File[]>([]);
	const [isProcessing, setIsProcessing] = useState(false);
	const [processingResult, setProcessingResult] = useState<ProcessingResult | null>(null);
	const [isDraggingCsv, setIsDraggingCsv] = useState(false);
	const [isDraggingImages, setIsDraggingImages] = useState(false);

	const csvInputRef = useRef<HTMLInputElement>(null);
	const imageInputRef = useRef<HTMLInputElement>(null);

	const handleCsvDrop = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDraggingCsv(false);
		if (e.dataTransfer.files?.[0]) {
			const file = e.dataTransfer.files[0];
			if (file.name.endsWith(".csv")) {
				setCsvFile(file);
				toast.success("CSV file selected");
			} else {
				toast.error("Please drop a valid CSV file");
			}
		}
	};

	const handleImagesDrop = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDraggingImages(false);
		if (e.dataTransfer.files) {
			const files = Array.from(e.dataTransfer.files);
			setImageFiles(prev => [...prev, ...files]);
			toast.success(`Added ${files.length} image(s)`);
		}
	};

	const handleCsvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files?.[0]) {
			const file = e.target.files[0];
			if (file.name.endsWith(".csv")) {
				setCsvFile(file);
				toast.success("CSV file selected");
			} else {
				toast.error("Please select a valid CSV file");
			}
		}
	};

	const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files) {
			const files = Array.from(e.target.files);
			setImageFiles(prev => [...prev, ...files]);
			toast.success(`Added ${files.length} image(s)`);
		}
	};

	const removeImage = (index: number) => {
		setImageFiles(prev => prev.filter((_, i) => i !== index));
	};

	const validateAndProcess = async () => {
		if (!csvFile || imageFiles.length === 0) {
			toast.error("Please upload both CSV and at least one image");
			return;
		}

		setIsProcessing(true);

		try {
			const formData = new FormData();
			formData.append("csv", csvFile);
			imageFiles.forEach((file, index) => {
				formData.append(`image_${index}`, file);
			});

			const response = await fetch("/api/image-duplicator/process", {
				method: "POST",
				body: formData,
			});

			const result = await response.json();

			if (!response.ok) {
				toast.error(result.error || "Processing failed");
				return;
			}

			setProcessingResult(result);

			if (result.failedCopies > 0) {
				toast.warning(`Processing completed with ${result.failedCopies} failures`);
			} else {
				toast.success("Processing completed successfully!");
			}
		} catch (error) {
			toast.error("Failed to process files");
			console.error(error);
		} finally {
			setIsProcessing(false);
		}
	};

	const downloadResult = () => {
		if (processingResult?.downloadUrl) {
			const a = document.createElement("a");
			a.href = processingResult.downloadUrl;
			a.download = "duplicated-images.zip";
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
		}
	};

	return (
		<div className="min-h-screen bg-slate-100 p-4 md:p-8">
			<div className="max-w-6xl mx-auto space-y-6">
				<div>
					<h1 className="text-3xl font-bold text-slate-900">Image Duplicator</h1>
					<p className="text-slate-600 mt-2">Upload CSV with image duplication mappings and create copies</p>
				</div>

				{!processingResult ? (
					<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
						{/* Upload Section */}
						<div className="lg:col-span-2 space-y-6">
							{/* CSV Upload */}
							<Card>
								<CardHeader>
									<CardTitle>1. Upload CSV File</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="text-sm text-slate-600 bg-slate-50 p-3 rounded border border-slate-200">
										<p className="font-semibold mb-2">Format:</p>
										<p>original_id, copy_id</p>
										<p className="text-xs mt-2 text-slate-500">Example:<br />1,7<br />2,4<br />3,5<br />3,6</p>
										<p className="text-xs mt-2 text-slate-500">This will create 7.ext, 4.ext, 5.ext, 6.ext as copies of the original files, preserving the extension</p>
									</div>

									<div
										onDragOver={(e) => { e.preventDefault(); setIsDraggingCsv(true); }}
										onDragLeave={() => setIsDraggingCsv(false)}
										onDrop={handleCsvDrop}
										onClick={() => csvInputRef.current?.click()}
										className={`h-32 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors ${
											isDraggingCsv ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:bg-slate-50"
										}`}
									>
										<Upload className="text-slate-400 mb-2" />
										<p className="text-sm font-medium text-slate-600">{csvFile ? csvFile.name : "Drag CSV here or click to select"}</p>
										<input
											ref={csvInputRef}
											type="file"
											accept=".csv"
											className="hidden"
											onChange={handleCsvChange}
										/>
									</div>
								</CardContent>
							</Card>

							{/* Image Upload */}
							<Card>
								<CardHeader>
									<CardTitle>2. Upload Original Images</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									<div
										onDragOver={(e) => { e.preventDefault(); setIsDraggingImages(true); }}
										onDragLeave={() => setIsDraggingImages(false)}
										onDrop={handleImagesDrop}
										onClick={() => imageInputRef.current?.click()}
										className={`h-32 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors ${
											isDraggingImages ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:bg-slate-50"
										}`}
									>
										<Upload className="text-slate-400 mb-2" />
										<p className="text-sm font-medium text-slate-600">Drag images here or click to select (any format)</p>
										<input
											ref={imageInputRef}
											type="file"
											multiple
											className="hidden"
											onChange={handleImageChange}
										/>
									</div>

									{imageFiles.length > 0 && (
										<ScrollArea className="h-40 border rounded-md p-2 bg-white">
											<div className="space-y-2">
												{imageFiles.map((file, idx) => (
													<div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm">
														<span className="truncate">{file.name}</span>
														<Button
															variant="ghost"
															size="sm"
															onClick={() => removeImage(idx)}
														>
															Remove
														</Button>
													</div>
												))}
											</div>
										</ScrollArea>
									)}

									<p className="text-xs text-slate-500">
										{imageFiles.length} image(s) selected
									</p>
								</CardContent>
							</Card>

							{/* Process Button */}
							<Card>
								<CardContent className="pt-6">
									<Button
										size="lg"
										className="w-full bg-blue-600 hover:bg-blue-700"
										onClick={validateAndProcess}
										disabled={isProcessing || !csvFile || imageFiles.length === 0}
									>
										{isProcessing ? (
											<>
												<Loader2 className="mr-2 animate-spin" />
												Processing...
											</>
										) : (
											"Process & Duplicate Images"
										)}
									</Button>
								</CardContent>
							</Card>
						</div>

						{/* Summary */}
						<Card>
							<CardHeader>
								<CardTitle className="text-sm">Summary</CardTitle>
							</CardHeader>
							<CardContent className="space-y-3 text-sm">
								<div>
									<p className="text-slate-600">CSV File</p>
									<p className="font-semibold text-slate-900">{csvFile?.name || "Not selected"}</p>
								</div>
								<div>
									<p className="text-slate-600">Images</p>
									<p className="font-semibold text-slate-900">{imageFiles.length} file(s)</p>
								</div>
								<div className="pt-3 border-t">
									<p className="text-slate-600 text-xs">Ready to process</p>
									{csvFile && imageFiles.length > 0 ? (
										<Badge className="bg-emerald-500 mt-2">Ready</Badge>
									) : (
										<Badge variant="secondary" className="mt-2">Incomplete</Badge>
									)}
								</div>
							</CardContent>
						</Card>
					</div>
				) : (
					/* Results Section */
					<div className="space-y-6">
						<Card>
							<CardHeader>
								<CardTitle>Processing Complete</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="grid grid-cols-3 gap-4">
									<div className="p-3 bg-blue-50 rounded border border-blue-200">
										<p className="text-sm text-slate-600">Total Mappings</p>
										<p className="text-2xl font-bold text-blue-600">{processingResult.totalMappings}</p>
									</div>
									<div className="p-3 bg-emerald-50 rounded border border-emerald-200">
										<p className="text-sm text-slate-600">Successful</p>
										<p className="text-2xl font-bold text-emerald-600">{processingResult.successfulCopies}</p>
									</div>
									<div className="p-3 bg-red-50 rounded border border-red-200">
										<p className="text-sm text-slate-600">Failed</p>
										<p className="text-2xl font-bold text-red-600">{processingResult.failedCopies}</p>
									</div>
								</div>

								{processingResult.failedCopies > 0 && (
									<div className="p-4 bg-red-50 border border-red-200 rounded-lg">
										<p className="font-semibold text-sm text-red-900 mb-3 flex items-center">
											<AlertCircle className="w-4 h-4 mr-2" />
											Failed Copies
										</p>
										<ul className="space-y-2">
											{processingResult.results
												.filter(r => r.status !== "success")
												.map((result, idx) => (
													<li key={idx} className="text-sm text-red-800">
														<span className="text-red-600 mr-2">•</span>
														{result.originalId} → {result.copyId}: {result.error}
													</li>
												))}
										</ul>
									</div>
								)}

								{processingResult.success && (
									<Button
										size="lg"
										className="w-full bg-emerald-600 hover:bg-emerald-700"
										onClick={downloadResult}
									>
										<CheckCircle2 className="w-4 h-4 mr-2" />
										Download Results (ZIP)
									</Button>
								)}

								<Button
									variant="outline"
									className="w-full"
									onClick={() => {
										setCsvFile(null);
										setImageFiles([]);
										setProcessingResult(null);
									}}
								>
									Start Over
								</Button>
							</CardContent>
						</Card>

						{/* Results Table */}
						{processingResult.results.length > 0 && (
							<Card>
								<CardHeader>
									<CardTitle className="text-base">Duplication Results</CardTitle>
								</CardHeader>
								<CardContent>
									<ScrollArea className="h-96">
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead>Original ID</TableHead>
													<TableHead>Copy ID</TableHead>
													<TableHead>Original File</TableHead>
													<TableHead>Status</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{processingResult.results.map((result, idx) => (
													<TableRow key={idx} className={result.status === "success" ? "" : "bg-red-50"}>
														<TableCell className="font-medium">{result.originalId}</TableCell>
														<TableCell className="font-medium">{result.copyId}</TableCell>
														<TableCell className="text-sm">{result.originalFile}</TableCell>
														<TableCell>
															{result.status === "success" ? (
																<Badge className="bg-emerald-500 text-xs">Success</Badge>
															) : result.status === "missing" ? (
																<Badge variant="destructive" className="text-xs">Missing</Badge>
															) : (
																<Badge variant="destructive" className="text-xs">Error</Badge>
															)}
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</ScrollArea>
								</CardContent>
							</Card>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
