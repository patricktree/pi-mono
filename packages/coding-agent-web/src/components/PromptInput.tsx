import { css, cx } from "@linaria/core";
import { ImagePlus, Square, X } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import type { InputMode } from "./BottomToolbar.js";
import type { ImageContent } from "../protocol/types.js";
import { iconBtn, isTouchDevice, readFileAsBase64, warn } from "../utils/helpers.js";

const inputWrapper = css`
	border: 1px solid var(--color-oc-border);
	border-radius: var(--radius-oc);
	background-color: var(--color-oc-card);
	overflow: hidden;
	position: relative;
`;

const hiddenInput = css`
	display: none;
`;

const imagePreviewRow = css`
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	padding: 12px 16px 0;
`;

const imageThumb = css`
	position: relative;
	width: 48px;
	height: 48px;
	overflow: hidden;
	border-radius: 0.375rem;
	border: 1px solid var(--color-oc-border);
`;

const imageThumbImg = css`
	width: 100%;
	height: 100%;
	object-fit: cover;
`;

const removeImageBtn = css`
	position: absolute;
	top: 2px;
	right: 2px;
	width: 16px;
	height: 16px;
	border-radius: 9999px;
	background-color: rgba(0, 0, 0, 0.6);
	color: white;
	display: flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
`;

const textareaStyle = css`
	display: block;
	width: 100%;
	min-height: 44px;
	max-height: 200px;
	padding: 12px 16px 4px;
	background-color: transparent;
	outline: none;
	resize: none;
	font-size: 15px;
	line-height: normal;
	color: var(--color-oc-fg);
	border: none;
	&::placeholder {
		color: var(--color-oc-fg-faint);
	}
	&:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
`;

const bottomRow = css`
	display: flex;
	align-items: center;
	justify-content: flex-end;
	padding: 4px 8px 8px;
	gap: 4px;
`;

const actionGroup = css`
	display: flex;
	align-items: center;
	gap: 4px;
`;

const squareBtn = css`
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 34px;
	height: 34px;
	border-radius: 0.5rem;
	background-color: var(--color-oc-primary);
	color: white;
	cursor: pointer;
	flex-shrink: 0;
`;

const sendBtn = css`
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 34px;
	height: 34px;
	border-radius: 0.5rem;
	color: white;
	cursor: pointer;
	flex-shrink: 0;
	&:disabled {
		opacity: 0.4;
		cursor: default;
	}
`;

const sendBtnActive = css`
	background-color: var(--color-oc-primary);
`;

const sendBtnInactive = css`
	background-color: var(--color-oc-fg-faint);
`;

export function PromptInput({
	mode,
	prompt,
	streaming,
	connected,
	hasContent,
	pendingImages,
	onPromptChange,
	onModeChange,
	onSend,
	onAbort,
	onAddImages,
	onRemoveImage,
	onError,
}: {
	mode: InputMode;
	prompt: string;
	streaming: boolean;
	connected: boolean;
	hasContent: boolean;
	pendingImages: ImageContent[];
	onPromptChange: (value: string) => void;
	onModeChange: (mode: InputMode) => void;
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

	const handleChange = useCallback(
		(text: string) => {
			onPromptChange(text);
			// Auto-switch to shell mode when typing "!" at start, back to prompt when removed
			const isBash = text.trimStart().startsWith("!");
			if (isBash && mode === "prompt") {
				onModeChange("shell");
			} else if (!isBash && mode === "shell") {
				onModeChange("prompt");
			}
		},
		[mode, onModeChange, onPromptChange],
	);

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

	const hasPromptContent = prompt.trim() || pendingImages.length > 0;

	return (
		<div className={inputWrapper}>
			<input
				accept="image/*"
				className={hiddenInput}
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
				<div className={imagePreviewRow}>
					{pendingImages.map((image, index) => (
						<div className={imageThumb} key={`${index.toString()}-${image.mimeType}`}>
							<img
								alt="pending"
								src={`data:${image.mimeType};base64,${image.data}`}
								className={imageThumbImg}
							/>
							<button
								className={removeImageBtn}
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
				className={textareaStyle}
				disabled={!connected}
				onChange={(event) => handleChange(event.currentTarget.value)}
				onKeyDown={onPromptKeyDown}
				placeholder={
					mode === "shell"
						? "Enter shell command..."
						: streaming
							? "Send a steering message..."
							: hasContent
								? "Ask anything..."
								: 'Ask anything... "Help me write a migration script"'
				}
				ref={promptRef}
				rows={1}
				value={prompt}
			/>

			{mode === "prompt" ? (
				<div className={bottomRow}>
					<div className={actionGroup}>
						<button
							className={iconBtn}
							disabled={!connected}
							onClick={onAttachImage}
							type="button"
							aria-label="Attach image"
						>
							<ImagePlus size={18} />
						</button>
						{streaming ? (
							<button
								className={squareBtn}
								onClick={onAbort}
								type="button"
							>
								<Square size={14} />
							</button>
						) : null}
						<button
							className={cx(sendBtn, hasPromptContent ? sendBtnActive : sendBtnInactive)}
							disabled={!connected || !hasPromptContent}
							onClick={onSend}
							type="button"
							aria-label="Send"
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
								<line x1="12" y1="19" x2="12" y2="5" />
								<polyline points="5 12 12 5 19 12" />
							</svg>
						</button>
					</div>
				</div>
			) : null}
		</div>
	);
}
