import type { UiMessage } from "../state/store.js";

export function UserBubble({ message }: { message: UiMessage }) {
	return (
		<div className="flex">
			<div className="max-w-[85%] px-4 py-2.5 bg-oc-user-bg border border-oc-user-border rounded-oc text-sm leading-normal text-oc-fg whitespace-pre-wrap break-words">
				{message.text}
				{message.images && message.images.length > 0 ? (
					<div className="flex flex-wrap gap-2 mt-2">
						{message.images.map((image, index) => (
							<div className="w-16 h-16 overflow-hidden rounded-md border border-oc-border" key={`${message.id}-${index.toString()}`}>
								<img
									alt="attached"
									src={`data:${image.mimeType};base64,${image.data}`}
									className="w-full h-full object-cover"
								/>
							</div>
						))}
					</div>
				) : null}
			</div>
		</div>
	);
}
