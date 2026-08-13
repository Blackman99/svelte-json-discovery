// Tiny tokenizer for the docs' curated code snippets (svelte / ts / bash).
// Produces token arrays rendered as text — no innerHTML involved.

export interface CodeToken { text: string; cls?: string }

const rules: [RegExp, string | null][] = [
    [/^(?:\/\/[^\n]*|<!--[\s\S]*?-->)/, 'cmt'],
    [/^(?:"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)/, 'str'],
    [/^\{[#/:@][a-z]*/, 'svb'],
    [/^<\/?[A-Z][\w.]*/, 'cmp'],
    [/^<\/?[a-z][\w-]*/, 'tag'],
    [/^(?:import|from|export|const|let|var|function|return|new|await|async|if|else|for|of|in|typeof)\b/, 'kw'],
    [/^(?:true|false|null|undefined)\b/, 'atom'],
    [/^\d[\d_]*(?:\.\d+)?n?\b/, 'num'],
    [/^[A-Z_$][\w$]*(?==)/i, 'attr'],
    [/^[{}[\]()<>=:,;.|&!?+*-]+/, 'pun'],
    [/^\s+/, null],
    [/^[\w$]+/, null],
    [/^[\s\S]/, null],
];

export function highlight(code: string): CodeToken[] {
    const tokens: CodeToken[] = [];
    let rest = code;

    while (rest.length > 0) {
        for (const [rx, cls] of rules) {
            const m = rx.exec(rest);

            if (m) {
                const text = m[0];
                const prev = tokens[tokens.length - 1];

                // merge consecutive unstyled tokens
                if (cls === null && prev && prev.cls === undefined) {
                    prev.text += text;
                }
                else {
                    tokens.push(cls === null ? { text } : { text, cls });
                }

                rest = rest.slice(text.length);
                break;
            }
        }
    }

    return tokens;
}
