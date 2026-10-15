import type { MermaidErrorDetails } from './mermaidError';
import {
  highlightedSource,
  indentSource,
  newlineSource,
  sourceCompletions,
  SOURCE_HIGHLIGHT_LIMIT,
  type SourceCompletions,
  type SourceEdit,
} from './sourceEditor';

interface SourceEditorElements {
  input: HTMLTextAreaElement;
  highlight: HTMLElement;
  lines: HTMLElement;
  completions: HTMLElement;
  diagnostic: HTMLButtonElement;
  hint: HTMLElement;
}

/** Keeps the native textarea responsible for selection, IME, clipboard and undo. */
export class SourceEditorController {
  private source = '';
  private diagnostic: MermaidErrorDetails | undefined;
  private completions: SourceCompletions | undefined;
  private selectedCompletion = 0;
  private composing = false;
  private releaseTab = false;

  public constructor(private readonly elements: SourceEditorElements) {
    const { input, completions, diagnostic } = elements;
    input.addEventListener('input', (event) => {
      this.sync();
      if (!this.composing && event instanceof InputEvent && event.inputType === 'insertText') {
        this.showCompletions(false);
      }
    });
    input.addEventListener('scroll', () => this.syncScroll());
    input.addEventListener('keydown', (event) => this.keydown(event));
    input.addEventListener('click', () => this.closeCompletions());
    input.addEventListener('blur', () => this.closeCompletions());
    input.addEventListener('compositionstart', () => {
      this.composing = true;
      this.closeCompletions();
    });
    input.addEventListener('compositionend', () => {
      this.composing = false;
      this.sync();
    });
    completions.addEventListener('mousedown', (event) => event.preventDefault());
    completions.addEventListener('click', (event) => {
      const option = (event.target as Element | null)?.closest<HTMLElement>('[data-completion-index]');
      if (!option) return;
      this.selectedCompletion = Number(option.dataset.completionIndex);
      this.acceptCompletion();
    });
    diagnostic.addEventListener('click', () => this.revealDiagnostic());
    new ResizeObserver(() => this.syncScroll()).observe(input);
    this.sync();
  }

  public sync(): void {
    const { input, highlight } = this.elements;
    if (input.value !== this.source) {
      this.source = input.value;
      this.diagnostic = undefined;
      this.closeCompletions();
    }
    const enabled = this.source.length <= SOURCE_HIGHLIGHT_LIMIT;
    input.classList.toggle('source-editor__input--highlighted', enabled);
    highlight.hidden = !enabled;
    highlight.innerHTML = enabled ? highlightedSource(this.source, this.diagnostic?.line) : '';
    this.elements.lines.innerHTML = this.source.split('\n').map((_, index) =>
      `<span${index + 1 === this.diagnostic?.line ? ' class="source-editor__line-number--error"' : ''}>${index + 1}</span>`,
    ).join('\n');
    this.updateDiagnostic();
    this.syncScroll();
  }

  public setDiagnostic(details?: MermaidErrorDetails): void {
    this.diagnostic = details;
    this.sync();
  }

  public syncScroll(): void {
    const { input, highlight, lines } = this.elements;
    // Match the textarea content box exactly, including scrollbar space.
    highlight.style.width = `${input.clientWidth}px`;
    highlight.style.height = `${input.clientHeight}px`;
    lines.style.height = `${input.clientHeight}px`;
    highlight.scrollTop = input.scrollTop;
    highlight.scrollLeft = input.scrollLeft;
    lines.scrollTop = input.scrollTop;
  }

  public revealDiagnostic(): void {
    const line = this.diagnostic?.line;
    if (!line) return;
    const { input } = this.elements;
    const lines = input.value.split('\n');
    const index = Math.min(line - 1, lines.length - 1);
    const start = lines.slice(0, index).reduce((offset, value) => offset + value.length + 1, 0);
    const end = start + (lines[index]?.length ?? 0);
    const column = Math.min(Math.max((this.diagnostic?.column ?? 1) - 1, 0), end - start);
    input.focus({ preventScroll: true });
    input.setSelectionRange(start + column, this.diagnostic?.column ? Math.min(start + column + 1, end) : end);
    const style = getComputedStyle(input);
    const lineHeight = Number.parseFloat(style.lineHeight) || 20;
    input.scrollTop = Math.max(0, index * lineHeight - input.clientHeight / 2);
    input.scrollLeft = 0;
    this.closeCompletions();
    this.syncScroll();
  }

  private updateDiagnostic(): void {
    const { diagnostic, hint, input } = this.elements;
    diagnostic.hidden = !this.diagnostic;
    hint.hidden = !!this.diagnostic;
    input.setAttribute('aria-invalid', String(!!this.diagnostic));
    if (this.diagnostic) {
      const location = this.diagnostic.line ? `Line ${this.diagnostic.line}${this.diagnostic.column ? `:${this.diagnostic.column}` : ''}` : 'Syntax error';
      diagnostic.textContent = `${location} · ${this.diagnostic.message.split('\n')[0] ?? 'Check Mermaid syntax'}`;
      diagnostic.title = this.diagnostic.message;
      diagnostic.disabled = !this.diagnostic.line;
    } else {
      diagnostic.textContent = '';
      diagnostic.title = '';
    }
  }

  private keydown(event: KeyboardEvent): void {
    if (this.composing || event.isComposing) return;
    const { input } = this.elements;
    if (event.key === 'Escape') {
      this.closeCompletions();
      this.releaseTab = true;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.key === 'Tab' && this.releaseTab) {
      this.releaseTab = false;
      // Leave native focus traversal intact; the host handler must also skip Tab.
      event.stopImmediatePropagation();
      return;
    }
    this.releaseTab = false;
    if ((event.ctrlKey || event.metaKey) && event.code === 'Space') {
      event.preventDefault();
      event.stopPropagation();
      this.showCompletions(true);
      return;
    }
    if (event.key === 'F8' && this.diagnostic?.line) {
      event.preventDefault();
      this.revealDiagnostic();
      return;
    }
    if (this.completions?.items.length && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        this.selectedCompletion = (this.selectedCompletion + direction + this.completions.items.length) % this.completions.items.length;
        this.renderCompletions();
        return;
      }
      if (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey)) {
        event.preventDefault();
        this.acceptCompletion();
        return;
      }
    }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
      this.closeCompletions();
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Tab') {
      event.preventDefault();
      this.edit(indentSource(input.value, input.selectionStart, input.selectionEnd, event.shiftKey));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.edit(newlineSource(input.value, input.selectionStart, input.selectionEnd));
    }
  }

  private edit(edit: SourceEdit): void {
    const { input } = this.elements;
    this.closeCompletions();
    input.focus({ preventScroll: true });
    input.setSelectionRange(edit.start, edit.end);
    // Chromium's native insertText preserves the textarea undo stack. The fallback
    // covers hosts without this editing command and still uses normal input events.
    if (!document.execCommand('insertText', false, edit.text)) {
      input.setRangeText(edit.text, edit.start, edit.end, 'end');
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' }));
    }
    input.setSelectionRange(edit.selectionStart, edit.selectionEnd);
    this.closeCompletions();
    this.syncScroll();
  }

  private showCompletions(explicit: boolean): void {
    const { input } = this.elements;
    if (input.selectionStart !== input.selectionEnd) return this.closeCompletions();
    this.completions = sourceCompletions(input.value, input.selectionStart, explicit);
    this.selectedCompletion = 0;
    this.renderCompletions();
  }

  private renderCompletions(): void {
    const { input, completions } = this.elements;
    completions.replaceChildren();
    const items = this.completions?.items ?? [];
    completions.hidden = items.length === 0;
    input.setAttribute('aria-expanded', String(items.length > 0));
    if (!items.length) {
      input.removeAttribute('aria-activedescendant');
      return;
    }
    items.forEach((item, index) => {
      const option = document.createElement('div');
      option.id = `source-completion-${index}`;
      option.dataset.completionIndex = String(index);
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(index === this.selectedCompletion));
      const label = document.createElement('strong');
      label.textContent = item.label;
      const detail = document.createElement('span');
      detail.textContent = item.detail;
      option.append(label, detail);
      completions.append(option);
      if (index === this.selectedCompletion) input.setAttribute('aria-activedescendant', option.id);
    });
    completions.children[this.selectedCompletion]?.scrollIntoView({ block: 'nearest' });
  }

  private acceptCompletion(): void {
    const completion = this.completions;
    const item = completion?.items[this.selectedCompletion];
    if (!completion || !item) return;
    this.edit({ start: completion.start, end: completion.end, text: item.label,
      selectionStart: completion.start + item.label.length, selectionEnd: completion.start + item.label.length });
  }

  private closeCompletions(): void {
    this.completions = undefined;
    this.elements.completions.hidden = true;
    this.elements.input.setAttribute('aria-expanded', 'false');
    this.elements.input.removeAttribute('aria-activedescendant');
  }
}
