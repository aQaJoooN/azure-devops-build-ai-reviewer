import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js";

/**
 * Render markdown content to sanitized HTML with syntax highlighting
 * Uses marked for markdown parsing, highlight.js for code syntax highlighting,
 * and DOMPurify for XSS prevention
 * @param markdown - Markdown content to render
 * @returns Sanitized HTML string
 */
export function renderMarkdown(markdown: string): string {
  try {
    // Configure marked with custom renderer for syntax highlighting
    const renderer = new marked.Renderer();
    
    // Override code block rendering to add syntax highlighting
    renderer.code = function(code: string, language: string | undefined) {
      if (language && hljs.getLanguage(language)) {
        try {
          const highlighted = hljs.highlight(code, { language }).value;
          return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
        } catch (err) {
          console.warn(`Failed to highlight code block with language ${language}:`, err);
        }
      }
      
      // Auto-detect language if not specified or highlighting failed
      try {
        const highlighted = hljs.highlightAuto(code).value;
        return `<pre><code class="hljs">${highlighted}</code></pre>`;
      } catch (err) {
        console.warn('Failed to auto-highlight code block:', err);
        return `<pre><code>${escapeHtml(code)}</code></pre>`;
      }
    };

    // Configure marked options
    marked.setOptions({
      gfm: true, // GitHub Flavored Markdown
      breaks: true, // Convert \n to <br>
      renderer: renderer,
    });

    // Parse markdown to HTML
    const rawHtml = marked.parse(markdown);

    // Sanitize HTML to prevent XSS attacks
    const cleanHtml = DOMPurify.sanitize(rawHtml as string, {
      ALLOWED_TAGS: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'p', 'br', 'hr',
        'ul', 'ol', 'li',
        'strong', 'em', 'code', 'pre',
        'a', 'img',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'blockquote',
        'span', 'div',
      ],
      ALLOWED_ATTR: [
        'href', 'title', 'src', 'alt',
        'class', 'id',
      ],
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    });

    return cleanHtml;
  } catch (error) {
    console.error("Error rendering markdown:", error);
    // Return escaped plain text as fallback
    return escapeHtml(markdown);
  }
}

/**
 * Escape HTML special characters
 * Used as fallback when markdown parsing fails
 * @param text - Text to escape
 * @returns Escaped text
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
