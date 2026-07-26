export const MARKDOWN_PREVIEW_CONFIGURATION_ID =
  'mermaid-preview-offline-markdown-configuration';

export interface MarkdownItRendererLike {
  render(...args: unknown[]): string;
}

export interface MarkdownItLike {
  renderer: MarkdownItRendererLike;
}

export interface MarkdownItExtension {
  extendMarkdownIt(markdownIt: MarkdownItLike): MarkdownItLike;
}

export function createMarkdownItExtension(
  rememberResizedHeight: () => boolean,
): MarkdownItExtension {
  return {
    extendMarkdownIt(markdownIt: MarkdownItLike): MarkdownItLike {
      const render = markdownIt.renderer.render.bind(markdownIt.renderer);
      markdownIt.renderer.render = (...args: unknown[]): string => {
        return `${markdownPreviewConfigurationMarkup(rememberResizedHeight())}\n${render(
          ...args,
        )}`;
      };
      return markdownIt;
    },
  };
}

export function markdownPreviewConfigurationMarkup(
  rememberResizedHeight: boolean,
): string {
  const configuration = escapeHtmlAttribute(
    JSON.stringify({ rememberResizedHeight }),
  );
  return `<span id="${MARKDOWN_PREVIEW_CONFIGURATION_ID}" aria-hidden="true" data-configuration="${configuration}"></span>`;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/"/gu, '&quot;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;');
}
