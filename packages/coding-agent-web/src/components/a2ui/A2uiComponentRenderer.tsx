import { useA2ui } from "./A2uiContext.js";
import { A2uiButton } from "./catalog/Button.js";
import { A2uiCard } from "./catalog/Card.js";
import { A2uiCheckBox } from "./catalog/CheckBox.js";
import { A2uiColumn } from "./catalog/Column.js";
import { A2uiDateTimeInput } from "./catalog/DateTimeInput.js";
import { A2uiDivider } from "./catalog/Divider.js";
import { A2uiIcon } from "./catalog/Icon.js";
import { A2uiImage } from "./catalog/Image.js";
import { A2uiList } from "./catalog/List.js";
import { A2uiModal } from "./catalog/Modal.js";
import { A2uiMultipleChoice } from "./catalog/MultipleChoice.js";
import { A2uiRow } from "./catalog/Row.js";
import { A2uiSlider } from "./catalog/Slider.js";
import { A2uiTabs } from "./catalog/Tabs.js";
import { A2uiText } from "./catalog/Text.js";
import { A2uiTextField } from "./catalog/TextField.js";
import type { A2uiComponentDef } from "./types.js";

export function A2uiComponentRenderer({ componentId }: { componentId: string }) {
	const { components } = useA2ui();
	const comp = components.get(componentId);
	if (!comp) return null;

	return renderComponent(comp);
}

function renderComponent(comp: A2uiComponentDef) {
	switch (comp.component) {
		case "Text":
			return <A2uiText def={comp} />;
		case "Button":
			return <A2uiButton def={comp} />;
		case "Card":
			return <A2uiCard def={comp} />;
		case "Row":
			return <A2uiRow def={comp} />;
		case "Column":
			return <A2uiColumn def={comp} />;
		case "List":
			return <A2uiList def={comp} />;
		case "TextField":
			return <A2uiTextField def={comp} />;
		case "CheckBox":
			return <A2uiCheckBox def={comp} />;
		case "Image":
			return <A2uiImage def={comp} />;
		case "Tabs":
			return <A2uiTabs def={comp} />;
		case "Modal":
			return <A2uiModal def={comp} />;
		case "Slider":
			return <A2uiSlider def={comp} />;
		case "Icon":
			return <A2uiIcon def={comp} />;
		case "Divider":
			return <A2uiDivider def={comp} />;
		case "DateTimeInput":
			return <A2uiDateTimeInput def={comp} />;
		case "MultipleChoice":
			return <A2uiMultipleChoice def={comp} />;
		default:
			return null;
	}
}
