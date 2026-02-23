import { Plus, Square, X } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { cn } from "../lib/utils.js";
import type { ImageContent } from "../protocol/types.js";
import { ICON_BTN, isTouchDevice, readFileAsBase64, warn } from "../utils/helpers.js";

export function PromptInput({
	prompt,
	streaming,
	connected,
	hasContent,
	pendingImages,
	onPromptChange,
	onSend,
	onAbort,
	onAddImages,
	onRemoveImage,
	onError,
}: {
	prompt: string;
	streaming: boolean;
	connected: boolean;
	hasContent: boolean;
	pendingImages: ImageContent[];
	onPromptChange: (value: string) => void;
	onSend: () => void;
	onAbort: () => void;
	onAddImages: (images: ImageContent[]) => void;
	onRemoveImage: (index: number) => void;
	onError: (message: string) => void;
}) {
	const promptRef = useRef<HTMLTextAreaElement | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		if (!promptRef.current) return;
		promptRef.current.style.height = "auto";
		promptRef.current.style.height = `${Math.min(promptRef.current.scrollHeight, 200)}px`;
	}, [prompt]);

	const onPromptKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (event.key === "Enter" && (event.metaKey || (!event.shiftKey && !isTouchDevice()))) {
				event.preventDefault();
				onSend();
			}
		},
		[onSend],
	);

	const onAttachImage = useCallback(() => {
		fileInputRef.current?.click();
	}, []);

	const onFileSelected = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
		const files = event.currentTarget.files;
		if (!files || files.length === 0) return;

		const newImages: ImageContent[] = [];
		for (const file of Array.from(files)) {
			if (!file.type.startsWith("image/")) {
				warn("skipping non-image file:", file.name, file.type);
				continue;
			}
			if (file.size > 20 * 1024 * 1024) {
				onError(`Image too large (max 20 MB): ${file.name}`);
				continue;
			}
			try {
				const base64 = await readFileAsBase64(file);
				newImages.push({ type: "image", data: base64, mimeType: file.type });
			} catch (readError) {
				const messageText = readError instanceof Error ? readError.message : String(readError);
				onError(`Failed to read image: ${messageText}`);
			}
		}

		if (newImages.length > 0) {
			onAddImages(newImages);
		}
		event.currentTarget.value = "";
	}, [onAddImages, onError]);

	return (
		<div className="border border-oc-border rounded-oc bg-oc-card overflow-hidden relative">
			<input
				accept="image/*"
				className="hidden"
				id="image-attachments"
				multiple
				name="imageAttachments"
				onChange={(event) => {
					void onFileSelected(event);
				}}
				ref={fileInputRef}
				type="file"
			/>

			{pendingImages.length > 0 ? (
				<div className="flex flex-wrap gap-2 px-4 pt-3">
					{pendingImages.map((image, index) => (
						<div className="relative w-12 h-12 overflow-hidden rounded-md border border-oc-border" key={`${index.toString()}-${image.mimeType}`}>
							<img
								alt="pending"
								src={`data:${image.mimeType};base64,${image.data}`}
								className="w-full h-full object-cover"
							/>
							<button
								className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer"
								onClick={() => onRemoveImage(index)}
								type="button"
							>
								<X size={10} />
							</button>
						</div>
					))}
				</div>
			) : null}

			<textarea
				className="block w-full min-h-[44px] max-h-[200px] pt-3 px-4 pb-1 bg-transparent outline-none resize-none text-[15px] leading-normal text-oc-fg placeholder:text-oc-fg-faint disabled:opacity-50 disabled:cursor-not-allowed"
				disabled={streaming || !connected}
				onChange={(event) => onPromptChange(event.currentTarget.value)}
				onKeyDown={onPromptKeyDown}
				placeholder={hasContent ? "Ask anything..." : 'Ask anything... "Help me write a migration script"'}
				ref={promptRef}
				rows={1}
				value={prompt}
			/>

			{streaming ? (
				<div className="absolute top-2 right-2 z-[1]">
					<button
						className="inline-flex items-center gap-1.5 py-1.5 px-3 border border-oc-border rounded-lg bg-oc-card text-[13px] font-medium text-oc-fg cursor-pointer"
						onClick={onAbort}
						type="button"
					>
						Stop
						<span className="text-[11px] py-px px-[5px] bg-oc-muted-bg rounded text-oc-fg-muted font-semibold">ESC</span>
					</button>
				</div>
			) : null}

			<div className="flex items-center justify-end px-2 pt-1 pb-2 gap-1">
				<div className="flex items-center gap-1">
					<button
						className={ICON_BTN}
						disabled={streaming || !connected}
						onClick={onAttachImage}
						type="button"
						aria-label="Attach image"
					>
						<Plus size={18} />
					</button>
					{streaming ? (
						<button
							className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-lg bg-oc-primary text-white cursor-pointer shrink-0"
							onClick={onAbort}
							type="button"
						>
							<Square size={14} />
						</button>
					) : (
						<button
							className={cn(
								"inline-flex items-center justify-center w-[34px] h-[34px] rounded-lg text-white cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-default",
								prompt.trim() || pendingImages.length > 0 ? "bg-oc-primary" : "bg-oc-fg-faint",
							)}
							disabled={!connected || (!prompt.trim() && pendingImages.length === 0)}
							onClick={onSend}
							type="button"
							aria-label="Send"
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
								<line x1="12" y1="19" x2="12" y2="5" />
								<polyline points="5 12 12 5 19 12" />
							</svg>
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
