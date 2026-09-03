const markdownListItemPattern = /^\s*(?:[-+*]|\d+[.)])\s+/u;

/**
 * Splits a Linq reply into separate iMessage/SMS bubbles.
 *
 * Paragraphs (blocks separated by a blank line) become separate bubbles.
 * A block whose every line is a markdown list item keeps one bubble per
 * item. Inside any other block, a single line break is joined with a
 * space rather than left as a literal "\n": Linq's markdown renderer
 * drops a markdown hard line break entirely (verified against
 * `@linqapp/chat-sdk-adapter`'s `renderDecoratedPostable`, which produces
 * no separator at all for a hard break), so a plain space is the only
 * verified-safe separator.
 */
export function splitLinqReply(message: string): string[] {
  return message
    .trim()
    .split(/\r?\n[\t ]*\r?\n/u)
    .flatMap((block) => {
      const lines = block.split(/\r?\n/u);
      return lines.every((line) => markdownListItemPattern.test(line))
        ? lines
        : lines.join(" ");
    })
    .map((part) => part.trim())
    .filter(Boolean);
}
