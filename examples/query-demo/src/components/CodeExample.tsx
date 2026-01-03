import type { ReactNode } from "react"
import { styles } from "../styles"

/**
 * Simple syntax highlighter for TypeScript/JavaScript code
 */
function highlightCode(code: string): ReactNode[] {
  const tokens: ReactNode[] = []
  let key = 0

  // Split by lines to preserve structure
  const lines = code.split("\n")

  lines.forEach((line, lineIndex) => {
    // Check if entire line is a comment
    const trimmed = line.trim()
    if (trimmed.startsWith("//")) {
      const leadingSpaces = line.match(/^(\s*)/)?.[1] || ""
      tokens.push(
        <span key={key++} style={{ color: "#6b7280" }}>
          {leadingSpaces}
        </span>
      )
      tokens.push(
        <span key={key++} style={{ color: "#6b7280", fontStyle: "italic" }}>
          {trimmed}
        </span>
      )
    } else {
      // Tokenize the line
      let remaining = line
      while (remaining.length > 0) {
        // Comments (inline)
        const commentMatch = remaining.match(/^(\/\/.*)/)
        if (commentMatch) {
          tokens.push(
            <span key={key++} style={{ color: "#6b7280", fontStyle: "italic" }}>
              {commentMatch[1]}
            </span>
          )
          remaining = remaining.slice(commentMatch[1].length)
          continue
        }

        // Keywords
        const keywordMatch = remaining.match(
          /^(const|let|var|function|async|await|return|if|else|import|export|from|type|interface|extends|new|null|true|false|undefined)\b/
        )
        if (keywordMatch) {
          tokens.push(
            <span key={key++} style={{ color: "#c084fc" }}>
              {keywordMatch[1]}
            </span>
          )
          remaining = remaining.slice(keywordMatch[1].length)
          continue
        }

        // Strings (double quotes)
        const doubleStringMatch = remaining.match(/^"([^"\\]|\\.)*"/)
        if (doubleStringMatch) {
          tokens.push(
            <span key={key++} style={{ color: "#4ade80" }}>
              {doubleStringMatch[0]}
            </span>
          )
          remaining = remaining.slice(doubleStringMatch[0].length)
          continue
        }

        // Strings (single quotes)
        const singleStringMatch = remaining.match(/^'([^'\\]|\\.)*'/)
        if (singleStringMatch) {
          tokens.push(
            <span key={key++} style={{ color: "#4ade80" }}>
              {singleStringMatch[0]}
            </span>
          )
          remaining = remaining.slice(singleStringMatch[0].length)
          continue
        }

        // Template literals (backticks)
        const templateMatch = remaining.match(/^`([^`\\]|\\.)*`/)
        if (templateMatch) {
          tokens.push(
            <span key={key++} style={{ color: "#4ade80" }}>
              {templateMatch[0]}
            </span>
          )
          remaining = remaining.slice(templateMatch[0].length)
          continue
        }

        // Function calls (word followed by parenthesis)
        const functionMatch = remaining.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)(\()/)
        if (functionMatch) {
          tokens.push(
            <span key={key++} style={{ color: "#60a5fa" }}>
              {functionMatch[1]}
            </span>
          )
          tokens.push(<span key={key++}>(</span>)
          remaining = remaining.slice(functionMatch[0].length)
          continue
        }

        // Object properties (word followed by colon)
        const propertyMatch = remaining.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)(:)/)
        if (propertyMatch) {
          tokens.push(
            <span key={key++} style={{ color: "#f472b6" }}>
              {propertyMatch[1]}
            </span>
          )
          tokens.push(<span key={key++}>:</span>)
          remaining = remaining.slice(propertyMatch[0].length)
          continue
        }

        // Method calls (.methodName)
        const methodMatch = remaining.match(/^\.([a-zA-Z_$][a-zA-Z0-9_$]*)/)
        if (methodMatch) {
          tokens.push(<span key={key++}>.</span>)
          tokens.push(
            <span key={key++} style={{ color: "#fbbf24" }}>
              {methodMatch[1]}
            </span>
          )
          remaining = remaining.slice(methodMatch[0].length)
          continue
        }

        // Numbers
        const numberMatch = remaining.match(/^[0-9]+(\.[0-9]+)?/)
        if (numberMatch) {
          tokens.push(
            <span key={key++} style={{ color: "#f97316" }}>
              {numberMatch[0]}
            </span>
          )
          remaining = remaining.slice(numberMatch[0].length)
          continue
        }

        // Arrow functions
        const arrowMatch = remaining.match(/^=>/)
        if (arrowMatch) {
          tokens.push(
            <span key={key++} style={{ color: "#c084fc" }}>
              {arrowMatch[0]}
            </span>
          )
          remaining = remaining.slice(arrowMatch[0].length)
          continue
        }

        // Brackets and punctuation
        const punctMatch = remaining.match(/^[{}()\[\];,]/)
        if (punctMatch) {
          tokens.push(
            <span key={key++} style={{ color: "#94a3b8" }}>
              {punctMatch[0]}
            </span>
          )
          remaining = remaining.slice(punctMatch[0].length)
          continue
        }

        // Default: take one character
        tokens.push(<span key={key++}>{remaining[0]}</span>)
        remaining = remaining.slice(1)
      }
    }

    // Add newline between lines (except for last line)
    if (lineIndex < lines.length - 1) {
      tokens.push(<span key={key++}>{"\n"}</span>)
    }
  })

  return tokens
}

export function CodeExample({ title, code }: { title: string; code: string }) {
  return (
    <div style={styles.codeBlock}>
      <p style={styles.codeTitle}>{title}</p>
      <pre style={styles.pre}>
        <code
          style={{ fontFamily: "'Fira Code', 'SF Mono', Consolas, monospace" }}
        >
          {highlightCode(code)}
        </code>
      </pre>
    </div>
  )
}
