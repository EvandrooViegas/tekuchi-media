"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Upload, AlertCircle, CheckCircle2, XCircle, Loader2 } from "lucide-react";

type ValidationResult = {
	apartment: string;
	imageFile: string;
	exists: boolean;
};

type ProcessingResult = {
	success: boolean;
	totalApartments: number;
	totalImages: number;
	warnings: string[];
	downloadUrl?: string;
};

export default function ApartmentOrganizer() {
	const [csvFile, setCsvFile] = useState<File | null>(null);
	const [imageFiles, setImageFiles] = useState<File[]>([]);
	const [isProcessing, setIsProcessing] = useState(false);
	const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
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
			const files = Array.from(e.dataTransfer.files).filter(f => {
				const ext = f.name.split(".").pop()?.toLowerCase();
				return ext === "jpg" || ext === "jpeg" || ext === "png";
			});

			if (files.length !== Array.from(e.dataTransfer.files).length) {
				toast.error("Some files were filtered out (only JPG/PNG allowed)");
			}

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
			const files = Array.from(e.target.files).filter(f => {
				const ext = f.name.split(".").pop()?.toLowerCase();
				return ext === "jpg" || ext === "jpeg" || ext === "png";
			});

			if (files.length !== Array.from(e.target.files).length) {
				toast.error("Some files were filtered out (only JPG/PNG allowed)");
			}

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

			const response = await fetch("/api/apartment-organizer/process", {
				method: "POST",
				body: formData,
			});

			const result = await response.json();

			if (!response.ok) {
				toast.error(result.error || "Processing failed");
				return;
			}

			setValidationResults(result.validationResults || []);
			setProcessingResult(result);

			if (result.warnings.length > 0) {
				toast.warning(`Processing completed with ${result.warnings.length} warnings`);
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
			a.download = "apartments.zip";
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
		}
	};

	return (
		<div className="min-h-screen bg-slate-100 p-4 md:p-8">
			<div className="max-w-6xl mx-auto space-y-6">
				<div>
					<h1 className="text-3xl font-bold text-slate-900">Apartment Image Organizer</h1>
					<p className="text-slate-600 mt-2">Upload CSV with apartment-to-image mappings and organize images</p>
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
										<p>apartment_number, image_file</p>
										<p className="text-xs mt-2 text-slate-500">Example: 1, 7 (copies image 7 to apartment_1/)</p>
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
									<CardTitle>2. Upload Images</CardTitle>
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
										<p className="text-sm font-medium text-slate-600">Drag images here or click to select (JPG/PNG)</p>
										<input
											ref={imageInputRef}
											type="file"
											multiple
											accept=".jpg,.jpeg,.png"
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
											"Validate & Process"
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
										<p className="text-sm text-slate-600">Total Apartments</p>
										<p className="text-2xl font-bold text-blue-600">{processingResult.totalApartments}</p>
									</div>
									<div className="p-3 bg-purple-50 rounded border border-purple-200">
										<p className="text-sm text-slate-600">Total Images</p>
										<p className="text-2xl font-bold text-purple-600">{processingResult.totalImages}</p>
									</div>
									<div className="p-3 bg-orange-50 rounded border border-orange-200">
										<p className="text-sm text-slate-600">Warnings</p>
										<p className="text-2xl font-bold text-orange-600">{processingResult.warnings.length}</p>
									</div>
								</div>

								{processingResult.warnings.length > 0 && (
									<div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
										<p className="font-semibold text-sm text-orange-900 mb-3 flex items-center">
											<AlertCircle className="w-4 h-4 mr-2" />
											Issues Found
										</p>
										<ul className="space-y-2">
											{processingResult.warnings.map((warning, idx) => (
												<li key={idx} className="text-sm text-orange-800 flex items-start">
													<span className="text-orange-600 mr-2">•</span>
													<span>{warning}</span>
												</li>
											))}
										</ul>
									</div>
								)}

								{!processingResult.success && (
									<div className="p-4 bg-red-50 border border-red-200 rounded-lg">
										<p className="font-semibold text-sm text-red-900 flex items-center">
											<XCircle className="w-4 h-4 mr-2" />
											Processing failed due to errors. Please fix the issues above.
										</p>
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
										setValidationResults([]);
										setProcessingResult(null);
									}}
								>
									Start Over
								</Button>
							</CardContent>
						</Card>

						{/* Validation Details */}
						{validationResults.length > 0 && (
							<Card>
								<CardHeader>
									<CardTitle className="text-base">Validation Details</CardTitle>
								</CardHeader>
								<CardContent>
									<ScrollArea className="h-96">
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead>Apartment</TableHead>
													<TableHead>Image File</TableHead>
													<TableHead>Status</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{validationResults.map((result, idx) => (
													<TableRow key={idx} className={result.exists ? "" : "bg-red-50"}>
														<TableCell className="font-medium">{result.apartment}</TableCell>
														<TableCell>{result.imageFile}</TableCell>
														<TableCell>
															{result.exists ? (
																<Badge className="bg-emerald-500 text-xs">Found</Badge>
															) : (
																<Badge variant="destructive" className="text-xs">Missing</Badge>
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
